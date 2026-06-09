/**
 * @file WebSocket客户端
 * @description 从旧版HTML的 initWebSocket() 提取，管理 Socket.io 连接、事件监听和自动重连
 * @module composables/useWebSocket
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useChatStore } from '../stores/chat'
import { useBrainStateStore } from '../stores/brainState'
import { useWorkerStore } from '../stores/worker'
import type { Task, TaskStep, TaskProgress, DangerConfirm, ClarificationData, WorkerLogEntry } from '../types'

/** Socket.io 客户端类型（从全局 io 加载） */
type SocketIOClient = {
  connected: boolean
  on(event: string, callback: (...args: unknown[]) => void): SocketIOClient
  emit(event: string, data?: unknown): SocketIOClient
  disconnect(): void
}

/** 后端历史事件中任务ID字段有 id/taskId 两种形态，且旧事件可能缺少 command/status */
type SocketTaskPayload = Partial<Task> & { taskId?: string; result?: unknown; duration?: number; error?: string; reason?: string }

/** 归一化后的任务事件，保证前端核心字段存在 */
type NormalizedSocketTaskPayload = Task & { taskId?: string; result?: unknown; duration?: number; error?: string; reason?: string }

/** WebSocket 事件回调映射 */
export interface WebSocketCallbacks {
  /** 任务排队 */
  onTaskQueued?: (task: Task) => void
  /** 任务开始 */
  onTaskStarted?: (task: Task) => void
  /** 任务完成 */
  onTaskCompleted?: (task: Task & { duration: number }) => void
  /** 任务失败 */
  onTaskFailed?: (task: Task & { error: string }) => void
  /** 任务降级 */
  onTaskDegraded?: (task: Task & { reason: string }) => void
  /** 任务步骤进度 */
  onTaskStepProgress?: (step: TaskStep) => void
  /** 任务进度 */
  onTaskProgress?: (progress: TaskProgress) => void
  /** 危险操作确认 */
  onDangerConfirm?: (data: DangerConfirm) => void
  /** 澄清对话 */
  onClarification?: (data: ClarificationData) => void
  /** 提醒触发 */
  onReminder?: (data: { message: string; text?: string }) => void
  /** 移动端任务派发 */
  onMobileDispatch?: (data: { from: string; task: { command: string } }) => void
  /** 聊天同步 */
  onChatSync?: (data: { from: string; content: string; role: string }) => void
}

/**
 * WebSocket 客户端组合式函数
 * 管理 Socket.io 连接生命周期，监听后端事件并分发到各 Store
 * @param callbacks - 可选的事件回调映射
 * @returns WebSocket 连接状态和控制方法
 */
export function useWebSocket(callbacks?: WebSocketCallbacks) {
  const appStore = useAppStore()
  const chatStore = useChatStore()
  const brainStore = useBrainStateStore()
  const workerStore = useWorkerStore()

  /** Socket.io 实例 */
  const socket = ref<SocketIOClient | null>(null)
  /** 连接状态 */
  const connected = ref(false)
  /** 状态上报定时器 */
  let statusInterval: ReturnType<typeof setInterval> | null = null
  /** 已处理过的任务结束事件，避免兼容旧/新事件名时重复展示完成或失败日志 */
  const handledTerminalTasks = new Set<string>()

  /**
   * 归一化任务事件数据，兼容 WorkAgent 使用 taskId、TaskScheduler 使用 id 的两种事件格式。
   * @param data - WebSocket 收到的原始任务事件
   * @returns 带标准 id 字段的任务事件
   */
  function normalizeTaskPayload(data: SocketTaskPayload): NormalizedSocketTaskPayload {
    return {
      ...data,
      id: data.id || data.taskId || '',
      command: data.command || workerStore.taskDescription || '',
      status: data.status || 'running',
      duration: data.duration || 0
    }
  }

  /**
   * 处理任务完成事件，兼容 task:completed 与旧版 task:complete。
   * 智能解析结果类型：文件路径→file，Markdown表格→table，其他→text
   * @param data - 任务完成事件数据
   * @returns {void}
   */
  function handleTaskCompleted(data: SocketTaskPayload & { duration?: number; result?: unknown }) {
    const task = normalizeTaskPayload(data)
    if (task.id) {
      if (handledTerminalTasks.has(task.id)) return
      handledTerminalTasks.add(task.id)
    }

    console.log('[useWebSocket] 收到 task completed 事件:', task.id, '耗时:', task.duration, 'ms')
    workerStore.clearTaskTimeout()
    appStore.setActiveTask(null)
    if (brainStore.state === 'working') brainStore.transition('done')
    workerStore.setWorkerStatus('done')
    workerStore.updateProgress(100)

    // 智能解析结果类型
    const taskResult = parseTaskResult(task.result, task.command)
    workerStore.setTaskResult(taskResult)

    // 聊天消息使用简化文本
    const chatText = taskResult.type === 'file'
      ? `小牛完成啦！文件已保存到：${taskResult.path}`
      : `小牛完成啦：\n\n${taskResult.content}`
    chatStore.addMessage('assistant', chatText, 'happy')
    callbacks?.onTaskCompleted?.(task as Task & { duration: number })
  }

  /**
   * 智能解析任务结果，判断结果类型并提取关键字段
   * 优先使用后端返回的原始 type 字段，保持类型一致性
   * @param result - 原始结果数据（可能是字符串、对象等）
   * @param command - 任务命令描述
   * @returns {Object} 解析后的结果对象，包含 type/content/path/preview/plan
   */
  function parseTaskResult(result: unknown, command?: string): { type: 'file' | 'text' | 'table' | 'chart' | 'travel_plan'; content: string; path?: string; preview?: string; plan?: string; metadata?: Record<string, unknown> } {
    // 结果为空
    if (!result) {
      return { type: 'text', content: `${command || '任务'} 已完成` }
    }

    // 如果结果是对象，尝试提取原始 type 字段（优先保留后端指定的类型）
    if (typeof result === 'object' && result !== null) {
      const resultObj = result as Record<string, unknown>

      // 旅行规划类型：后端返回 { type: 'travel_plan', plan: markdown, metadata: {...} }
      if (resultObj.type === 'travel_plan') {
        return {
          type: 'travel_plan',
          content: String(resultObj.plan || resultObj.content || ''),
          plan: String(resultObj.plan || ''),
          metadata: resultObj.metadata as Record<string, unknown>
        }
      }

      // 其他有 type 字段的对象
      const originalType = resultObj.type
      if (typeof originalType === 'string' && ['file', 'text', 'table', 'chart'].includes(originalType)) {
        return {
          type: originalType as 'file' | 'text' | 'table' | 'chart',
          content: String(resultObj.content || resultObj.plan || JSON.stringify(resultObj)),
          path: typeof resultObj.path === 'string' ? resultObj.path : undefined,
          preview: typeof resultObj.preview === 'string' ? resultObj.preview : undefined
        }
      }

      // 对象没有 type 字段，转为字符串继续处理
      const resultStr = JSON.stringify(resultObj)

      // 检测Markdown表格（| ... | ... | 格式）
      if (/\|.+\|.+\|[\r\n]+\|[-:\s|]+\|/.test(resultStr)) {
        return {
          type: 'table',
          content: resultStr,
          preview: resultStr
        }
      }

      // 默认为文本类型
      return { type: 'text', content: resultStr }
    }

    // 结果是字符串
    const resultStr = typeof result === 'string' ? result : String(result)

    // 检测文件路径模式（如 C:/Users/.../xxx.txt 或 /home/.../xxx.csv）
    const filePathMatch = resultStr.match(/(?:保存|已保存|文件|写入)[到至]?\s*[：:]?\s*([A-Za-z]:[\\\/][^\s"',，。]+|[\/][^\s"',，。]+)/)
    if (filePathMatch) {
      const filePath = filePathMatch[1]
      // 判断文件类型
      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const isTable = ['csv', 'xlsx', 'xls'].includes(ext)
      return {
        type: isTable ? 'table' : 'file',
        content: resultStr,
        path: filePath,
        preview: isTable ? undefined : undefined
      }
    }

    // 检测Markdown表格（| ... | ... | 格式）
    if (/\|.+\|.+\|[\r\n]+\|[-:\s|]+\|/.test(resultStr)) {
      return {
        type: 'table',
        content: resultStr,
        preview: resultStr
      }
    }

    // 默认为文本类型
    return { type: 'text', content: resultStr }
  }

  /**
   * 处理任务失败事件，兼容 task:failed 与旧版 task:fail。
   * @param data - 任务失败事件数据
   * @returns {void}
   */
  function handleTaskFailed(data: SocketTaskPayload & { error?: string }) {
    const task = normalizeTaskPayload(data)
    if (task.id) {
      if (handledTerminalTasks.has(task.id)) return
      handledTerminalTasks.add(task.id)
    }

    workerStore.clearTaskTimeout()
    appStore.setActiveTask(null)
    if (brainStore.state === 'working') brainStore.transition('error')
    workerStore.setWorkerStatus('stuck')
    workerStore.addLog(`❌ 任务失败: ${task.error || '未知错误'}`, 'error')
    chatStore.addMessage('assistant', `小牛卡住了：${task.error || '未知错误'}`, 'worried')
    callbacks?.onTaskFailed?.(task as Task & { error: string })
  }

  /**
   * 初始化 WebSocket 连接
   */
  function connect() {
    if (typeof (window as unknown as { io?: unknown }).io === 'undefined') {
      console.warn('[WS] socket.io 客户端未加载，WebSocket 不可用')
      return
    }

    const protocol = location.protocol === 'https:' ? 'https:' : 'http:'
    const wsUrl = `${protocol}//${location.host}`
    const io = (window as unknown as { io: typeof import('socket.io-client').io }).io

    socket.value = io(wsUrl, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000
    })

    // === 连接事件 ===
    socket.value.on('connect', () => {
      connected.value = true
      appStore.wsConnected = true
      console.log('[WS] 已连接')
      socket.value?.emit('device:register', { userId: 'legacy', deviceType: 'pc' })
    })

    socket.value.on('disconnect', (reason: string) => {
      connected.value = false
      appStore.wsConnected = false
      console.log('[WS] 断开:', reason)
    })

    // === 初始化事件 ===
    socket.value.on('init', (data: {
      workbrainStatus?: { available: boolean }
      taskStatus?: { currentTask: Task | null }
    }) => {
      if (data.workbrainStatus) {
        appStore.setWorkbrainAvailable(data.workbrainStatus.available)
      }
      if (data.taskStatus?.currentTask) {
        appStore.setActiveTask(data.taskStatus.currentTask)
      }
    })

    // === 任务事件 ===
    socket.value.on('task:queued', (data: unknown) => {
      const task = normalizeTaskPayload(data as SocketTaskPayload)
      appStore.setActiveTask({ id: task.id, command: task.command, status: 'queued' })
      callbacks?.onTaskQueued?.(task)
    })

    socket.value.on('task:started', (data: unknown) => {
      const task = normalizeTaskPayload(data as SocketTaskPayload)
      console.log('[useWebSocket] 收到 task:started 事件:', task.id, task.command)
      appStore.setActiveTask({ id: task.id, command: task.command, status: 'running' })
      // 任务开始时，将小牛状态从 starting 切换到 working
      if (workerStore.workerStatus === 'starting' || workerStore.workerStatus === 'idle') {
        workerStore.setWorkerStatus('working')
      }
      callbacks?.onTaskStarted?.(task)
    })

    socket.value.on('task:completed', (data: unknown) => handleTaskCompleted(data as SocketTaskPayload))
    socket.value.on('task:complete', (data: unknown) => handleTaskCompleted(data as SocketTaskPayload))

    socket.value.on('task:failed', (data: unknown) => handleTaskFailed(data as SocketTaskPayload))
    socket.value.on('task:fail', (data: unknown) => handleTaskFailed(data as SocketTaskPayload))

    socket.value.on('task:degraded', (data: unknown) => {
      const task = normalizeTaskPayload(data as SocketTaskPayload & { reason: string })
      appStore.setActiveTask(null)
      brainStore.transition('degrade')
      callbacks?.onTaskDegraded?.(task as Task & { reason: string })
    })

    socket.value.on('task:step_progress', (data: TaskStep & { message?: string; ttsText?: string }) => {
      if (data.status === 'done') {
        callbacks?.onTaskStepProgress?.(data)
        return
      }
      callbacks?.onTaskStepProgress?.(data)
    })

    socket.value.on('work:log', (data: WorkerLogEntry & { taskId?: string }) => {
      console.log('[useWebSocket] 收到 work:log 事件:', data.message ? data.message.substring(0, 30) : 'no message', 'userId:', data.userId)
      // 工作区实时日志：直接添加到工作区日志列表
      workerStore.addWorkLog({
        time: data.time || new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        message: data.message,
        level: data.level,
        category: data.category,
        provider: data.provider,
        model: data.model,
        tokens: data.tokens,
        toolName: data.toolName,
        duration: data.duration,
        success: data.success
      })

      // 如果日志包含任务ID且与当前任务ID不同，更新任务ID
      if (data.taskId && data.taskId !== workerStore.currentTaskId) {
        workerStore.currentTaskId = data.taskId
      }

      // 根据日志级别和类别更新小牛状态
      if (data.level === 'error') {
        workerStore.setWorkerStatus('stuck')
      } else if (data.category === 'llm' || data.category === 'tool' || data.category === 'intent') {
        // LLM 调用、工具执行、意图理解等类别都表示小牛正在工作中
        if (workerStore.workerStatus === 'starting' || workerStore.workerStatus === 'idle') {
          workerStore.setWorkerStatus('working')
        }
      } else if (data.message?.includes('开始') || data.message?.includes('LLM调用') || data.message?.includes('理解意图') || data.message?.includes('执行')) {
        workerStore.setWorkerStatus('working')
      }
    })

    socket.value.on('task:progress', (data: TaskProgress) => {
      callbacks?.onTaskProgress?.(data)
    })

    socket.value.on('step:start', (data: TaskStep) => {
      callbacks?.onTaskStepProgress?.({ ...data, status: 'starting' })
    })

    socket.value.on('step:complete', (data: TaskStep) => {
      callbacks?.onTaskStepProgress?.({ ...data, status: 'completed' })
    })

    socket.value.on('step:ask', (data: ClarificationData & { params?: Record<string, unknown> }) => {
      if (data.params) {
        callbacks?.onClarification?.(data)
      } else {
        callbacks?.onClarification?.(data)
      }
    })

    socket.value.on('danger:confirm', (data: DangerConfirm) => {
      callbacks?.onDangerConfirm?.(data)
    })

    // === 工作大脑事件 ===
    socket.value.on('workbrain:offline', () => {
      appStore.setWorkbrainAvailable(false)
      if (brainStore.state === 'working') brainStore.transition('degrade')
    })

    socket.value.on('workbrain:online', () => {
      appStore.setWorkbrainAvailable(true)
      if (brainStore.state === 'degraded') brainStore.transition('recover')
    })

    // === 提醒事件 ===
    socket.value.on('reminder:triggered', (data: { message: string; text?: string }) => {
      chatStore.addMessage('assistant', data.text || `⏰ 提醒你：${data.message}`)
      callbacks?.onReminder?.(data)
    })

    // === 移动端派发 ===
    socket.value.on('task:dispatch', (data: { from: string; task: { command: string } }) => {
      callbacks?.onMobileDispatch?.(data)
    })

    // === 聊天同步 ===
    socket.value.on('chat:sync', (data: { from: string; content: string; role: string }) => {
      callbacks?.onChatSync?.(data)
    })

    // === 任务取消 ===
    socket.value.on('task:cancelled', () => {
      workerStore.clearTaskTimeout()
      appStore.setActiveTask(null)
      if (brainStore.state === 'working') brainStore.transition('cancel')
      // 任务取消时，重置小牛状态
      workerStore.setWorkerStatus('idle')
      workerStore.addLog('🚫 任务已取消', 'warn')
    })

    // === 上下文更新 ===
    socket.value.on('context:update', () => {
      // 上下文更新通知
    })

    // === 可恢复任务 ===
    socket.value.on('task:recoverable', () => {
      // 可恢复任务通知
    })

    // 定时上报状态
    statusInterval = setInterval(() => {
      if (socket.value?.connected) {
        socket.value.emit('pc:status', {
          activeTask: appStore.activeTask
            ? { command: appStore.activeTask.command, status: appStore.activeTask.status }
            : null,
          brainMode: appStore.brainMode,
          workbrainAvailable: appStore.workbrainAvailable
        })
      }
    }, 10000)
  }

  /**
   * 断开 WebSocket 连接
   */
  function disconnect() {
    if (statusInterval) {
      clearInterval(statusInterval)
      statusInterval = null
    }
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }
    connected.value = false
    appStore.wsConnected = false
  }

  /**
   * 发送事件到服务器
   * @param event - 事件名
   * @param data - 事件数据
   */
  function emit(event: string, data?: unknown) {
    if (socket.value?.connected) {
      socket.value.emit(event, data)
    }
  }

  // 生命周期管理
  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    /** Socket.io 实例 */
    socket,
    /** 连接状态 */
    connected,
    /** 连接方法 */
    connect,
    /** 断开方法 */
    disconnect,
    /** 发送事件方法 */
    emit
  }
}
