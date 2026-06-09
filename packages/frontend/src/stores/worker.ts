/**
 * @file 工作区状态管理
 * @description 管理小牛（牛马）工作区的状态，包括面板展开/折叠、
 *              小牛工作状态、动画状态、任务进度、日志和结果
 * @module stores/worker
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  WorkerStatus,
  WorkerAnimation,
  WorkerPanelState,
  WorkerLogEntry,
  WorkerTaskResult,
  ChimeInState
} from '../types'

/** 小牛状态到动画的默认映射 */
const STATUS_TO_ANIMATION: Record<WorkerStatus, WorkerAnimation> = {
  idle: 'sleep',
  starting: 'stretch',
  working: 'typing',
  stuck: 'headscratch',
  done: 'celebrate'
}

/** 小牛状态配置：图标、标签、颜色 */
const STATUS_CONFIG: Record<WorkerStatus, { icon: string; label: string; color: string; emoji: string }> = {
  idle:      { icon: '💤', label: '小牛休息中', color: 'var(--text-dim)', emoji: '🐮' },
  starting:  { icon: '🚀', label: '小牛开工了', color: 'var(--accent-amber)', emoji: '🚀' },
  working:   { icon: '⌨️', label: '小牛干活中', color: 'var(--accent-teal)', emoji: '💻' },
  stuck:     { icon: '🤔', label: '小牛卡住了', color: 'var(--accent-coral)', emoji: '🤔' },
  done:      { icon: '🎉', label: '小牛搞定了', color: 'var(--accent-green)', emoji: '🎉' }
}

/** 最大日志条数限制，防止内存无限增长 */
const MAX_LOG_ENTRIES = 200

/** 闲聊区默认宽度占比 */
const DEFAULT_CHAT_RATIO = 0.6

/** 闲聊区最小宽度占比，保证工作区至少30%可见 */
const MIN_CHAT_RATIO = 0.3

/** 闲聊区最大宽度占比，保证工作区至少30%可见 */
const MAX_CHAT_RATIO = 0.7

/** 小牛下班动画播放时长（毫秒） */
const DISMISS_ANIMATION_DELAY_MS = 500

/** 任务超时时间（毫秒），用于发现后端没有推送结束事件的异常任务 */
const TASK_TIMEOUT_MS = 180000

// ============================================================
// 插嘴机制配置
// 功能说明：小梦在工作区状态变化时可能"插嘴"调侃
// ============================================================

/** 插嘴触发概率（0~1），30%概率真正插嘴 */
const CHIME_IN_PROBABILITY = 0.3

/** 预设台词占比（0~1），80%使用预设台词，20%调用AI生成 */
const PRESET_LINE_RATIO = 0.8

/** 插嘴气泡显示时长（毫秒），超时后自动消失 */
const CHIME_IN_DISPLAY_MS = 5000

/** 插嘴冷却时间（毫秒），避免短时间内连续插嘴 */
const CHIME_IN_COOLDOWN_MS = 30000

/**
 * 各工作区状态对应的预设台词
 * 每个状态有多条台词，随机选择一条
 */
const CHIME_IN_PRESETS: Record<WorkerStatus, string[]> = {
  idle: [
    '小牛在偷懒呢~',
    '工作区空空如也~'
  ],
  starting: [
    '哟，小牛动起来了~',
    '小牛伸了个懒腰，准备开工！',
    '来了来了，小牛要开始干活了~'
  ],
  working: [
    '它正埋头苦干呢~',
    '小牛敲键盘的声音好认真~',
    '别打扰它，小牛在专心干活呢~',
    '小牛干得挺起劲的嘛~'
  ],
  stuck: [
    '哎呀，好像卡壳了，我催催它🔧',
    '小牛挠头了...要不要帮帮它？',
    '看起来遇到难题了，小牛需要点时间~'
  ],
  done: [
    '搞定啦！效率还不错嘛~',
    '小牛交差了！看看结果怎么样~',
    '完成了！小牛还挺靠谱的嘛~',
    '终于搞定了，给它加个鸡腿🍗'
  ]
}

/**
 * 工作区状态 Store
 * 管理小牛工作区的所有状态，包括面板、动画、进度、日志
 */
export const useWorkerStore = defineStore('worker', () => {
  // ============================================================
  // 面板状态
  // ============================================================

  /** 工作区面板状态：折叠/展开 */
  const panelState = ref<WorkerPanelState>('collapsed')

  /** 闲聊区宽度占比（0.3 ~ 0.7），用于拖拽分隔条 */
  const chatRatio = ref(DEFAULT_CHAT_RATIO)

  // ============================================================
  // 小牛状态
  // ============================================================

  /** 小牛工作状态 */
  const workerStatus = ref<WorkerStatus>('idle')

  /** 小牛动画状态（可独立于工作状态设置，用于过渡动画） */
  const workerAnimation = ref<WorkerAnimation>('sleep')

  // ============================================================
  // 任务数据
  // ============================================================

  /** 当前任务ID */
  const currentTaskId = ref<string | null>(null)

  /** 任务描述 */
  const taskDescription = ref<string>('')

  /** 任务进度（0~100） */
  const progress = ref(0)

  /** 任务日志列表 */
  const logs = ref<WorkerLogEntry[]>([])

  /** 任务结果 */
  const taskResult = ref<WorkerTaskResult | null>(null)

  /** 当前任务超时定时器 */
  let taskTimeoutTimer: ReturnType<typeof setTimeout> | null = null

  // ============================================================
  // 插嘴状态
  // ============================================================

  /** 小梦插嘴状态 */
  const chimeIn = ref<ChimeInState>({
    active: false,
    text: '',
    triggerStatus: 'idle',
    timestamp: 0
  })

  /** 上次插嘴时间戳，用于冷却控制 */
  let lastChimeInTime = 0

  /** 插嘴气泡自动消失定时器 */
  let chimeInTimer: ReturnType<typeof setTimeout> | null = null

  // ============================================================
  // 计算属性
  // ============================================================

  /** 面板是否展开 */
  const isExpanded = computed(() => panelState.value === 'expanded')

  /** 小牛是否空闲 */
  const isIdle = computed(() => workerStatus.value === 'idle')

  /** 小牛是否工作中 */
  const isWorking = computed(() => workerStatus.value === 'working')

  /** 当前状态配置 */
  const statusConfig = computed(() => STATUS_CONFIG[workerStatus.value])

  /** 工作区宽度占比（= 1 - 闲聊区占比） */
  const workRatio = computed(() => 1 - chatRatio.value)

  // ============================================================
  // 方法
  // ============================================================

  /**
   * 切换面板展开/折叠
   * @returns {void}
   */
  function togglePanel() {
    panelState.value = panelState.value === 'collapsed' ? 'expanded' : 'collapsed'
  }

  /**
   * 展开工作区面板
   * @returns {void}
   */
  function expandPanel() {
    panelState.value = 'expanded'
  }

  /**
   * 折叠工作区面板
   * @returns {void}
   */
  function collapsePanel() {
    panelState.value = 'collapsed'
  }

  /**
   * 设置闲聊区宽度占比
   * @param ratio - 占比值（0.3 ~ 0.7）
   * @returns {void}
   */
  function setChatRatio(ratio: number) {
    // 限制闲聊区最小30%、最大70%，保证两个区域都可用
    const clamped = Math.min(MAX_CHAT_RATIO, Math.max(MIN_CHAT_RATIO, ratio))
    chatRatio.value = clamped
  }

  /**
   * 设置小牛工作状态，同时自动更新动画状态
   * 状态变化时触发插嘴判断：30%概率插嘴，80%预设+20%AI生成
   * @param status - 新的工作状态
   * @returns {void}
   */
  function setWorkerStatus(status: WorkerStatus) {
    const oldStatus = workerStatus.value
    workerStatus.value = status
    // 自动映射到对应的动画状态
    workerAnimation.value = STATUS_TO_ANIMATION[status]

    // 状态变化时触发插嘴判断（idle→idle不算变化）
    if (oldStatus !== status) {
      _checkChimeIn(status)
    }
  }

  /**
   * 独立设置动画状态（用于过渡动画，如收拾东西、挥手）
   * @param animation - 动画状态
   * @returns {void}
   */
  function setWorkerAnimation(animation: WorkerAnimation) {
    workerAnimation.value = animation
  }

  /**
   * 开始新任务
   * @param taskId - 任务ID
   * @param description - 任务描述
   * @returns {void}
   */
  function startTask(taskId: string, description: string) {
    clearTaskTimeout()
    currentTaskId.value = taskId
    taskDescription.value = description
    progress.value = 0
    logs.value = []
    taskResult.value = null
    setWorkerStatus('starting')
    // 自动展开工作区面板
    expandPanel()
  }

  /**
   * 更新任务进度
   * @param value - 进度值（0~100）
   * @returns {void}
   */
  function updateProgress(value: number) {
    progress.value = Math.min(100, Math.max(0, value))
  }

  /**
   * 添加日志条目
   * @param message - 日志消息
   * @param level - 日志级别，默认 info
   * @returns {void}
   */
  function addLog(message: string, level: WorkerLogEntry['level'] = 'info') {
    const now = new Date()
    const time = now.toLocaleTimeString('zh-CN', { hour12: false })
    logs.value.push({ time, message, level })
    // 超过最大条数时移除最早的日志
    if (logs.value.length > MAX_LOG_ENTRIES) {
      logs.value = logs.value.slice(-MAX_LOG_ENTRIES)
    }
  }

  /**
   * 添加日志条目（从 WebSocket work:log 事件）
   * @param logEntry - 日志条目对象
   * @returns {void}
   */
  function addWorkLog(logEntry: WorkerLogEntry) {
    // 如果没有 time，使用当前时间
    if (!logEntry.time) {
      logEntry.time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    }
    logs.value.push(logEntry)
    // 超过最大条数时移除最早的日志
    if (logs.value.length > MAX_LOG_ENTRIES) {
      logs.value = logs.value.slice(-MAX_LOG_ENTRIES)
    }
  }

  /**
   * 设置任务结果
   * @param result - 任务结果对象
   * @returns {void}
   */
  function setTaskResult(result: WorkerTaskResult) {
    clearTaskTimeout()
    taskResult.value = result
    setWorkerStatus('done')
  }

  /**
   * 启动任务超时检测。任务结束事件会调用 clearTaskTimeout 清理，避免失败后又显示超时。
   * @param taskId - 当前后端任务ID
   * @returns {void}
   */
  function startTaskTimeout(taskId: string) {
    clearTaskTimeout()
    taskTimeoutTimer = setTimeout(() => {
      const isSameTask = currentTaskId.value === taskId
      const isRunning = workerStatus.value === 'working' || workerStatus.value === 'starting'
      if (isSameTask && isRunning) {
        addLog('⏰ 任务执行超时，请检查后端服务是否正常', 'error')
        setWorkerStatus('stuck')
      }
    }, TASK_TIMEOUT_MS)
  }

  /**
   * 清理任务超时检测，任务完成、失败、取消或重置时必须调用。
   * @returns {void}
   */
  function clearTaskTimeout() {
    if (taskTimeoutTimer) {
      clearTimeout(taskTimeoutTimer)
      taskTimeoutTimer = null
    }
  }

  /**
   * 小牛下班（一键收起）
   * 播放收拾→挥手动画后折叠面板，同时触发小梦的下班台词
   * @returns {Promise<void>} 无返回值
   */
  async function workerDismiss() {
    clearTaskTimeout()
    // 播放收拾东西动画
    setWorkerAnimation('packup')
    addLog('小牛正在收拾东西...', 'info')
    // 收拾动画播放（600ms，比默认稍长，让动画更丝滑）
    await new Promise(resolve => setTimeout(resolve, 600))
    // 播放挥手动画
    setWorkerAnimation('wave')
    addLog('小牛挥手告别~', 'info')
    // 触发小梦的下班台词（通过插嘴机制显示）
    _triggerChimeIn('小牛已下班，老大还有什么吩咐？', 'idle')
    // 挥手动画播放（800ms，给用户足够时间看到挥手）
    await new Promise(resolve => setTimeout(resolve, 800))
    // 重置状态并折叠面板
    workerStatus.value = 'idle'
    workerAnimation.value = 'sleep'
    currentTaskId.value = null
    taskDescription.value = ''
    progress.value = 0
    taskResult.value = null
    collapsePanel()
  }

  // ============================================================
  // 插嘴机制内部方法
  // ============================================================

  /**
   * 检查是否应该插嘴
   * 规则：状态变化时30%概率插嘴，冷却期内不插嘴
   * @param newStatus - 新的工作区状态
   * @returns {void}
   */
  function _checkChimeIn(newStatus: WorkerStatus) {
    // 冷却期内不插嘴，避免频繁打扰
    const now = Date.now()
    if (now - lastChimeInTime < CHIME_IN_COOLDOWN_MS) {
      return
    }

    // 30%概率真正插嘴
    if (Math.random() > CHIME_IN_PROBABILITY) {
      return
    }

    // 决定使用预设台词还是AI生成
    const usePreset = Math.random() < PRESET_LINE_RATIO

    if (usePreset) {
      // 80%：从预设台词中随机选择
      const presets = CHIME_IN_PRESETS[newStatus]
      const text = presets[Math.floor(Math.random() * presets.length)]
      _triggerChimeIn(text, newStatus)
    } else {
      // 20%：调用AI生成插嘴台词
      _generateAIChimeIn(newStatus)
    }
  }

  /**
   * 触发插嘴：设置插嘴状态并启动自动消失定时器
   * @param text - 插嘴台词
   * @param triggerStatus - 触发的工作区状态
   * @returns {void}
   */
  function _triggerChimeIn(text: string, triggerStatus: WorkerStatus) {
    // 清除之前的定时器
    _clearChimeInTimer()

    // 设置插嘴状态
    chimeIn.value = {
      active: true,
      text,
      triggerStatus,
      timestamp: Date.now()
    }
    lastChimeInTime = Date.now()

    // 自动消失定时器
    chimeInTimer = setTimeout(() => {
      chimeIn.value.active = false
    }, CHIME_IN_DISPLAY_MS)
  }

  /**
   * 调用后端AI生成插嘴台词
   * 使用轻量级LLM调用，根据工作区状态生成调侃台词
   * @param workerStatus - 当前工作区状态
   * @returns {void}
   */
  async function _generateAIChimeIn(workerStatus: WorkerStatus) {
    // 状态描述映射，帮助AI理解当前场景
    const statusDesc: Record<WorkerStatus, string> = {
      idle: '小牛在休息',
      starting: '小牛刚接到任务，准备开工',
      working: '小牛正在埋头苦干',
      stuck: '小牛遇到困难卡住了',
      done: '小牛完成了任务'
    }

    try {
      const response = await fetch('/api/chat/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `你是小梦，一个可爱调皮的AI伙伴。工作区的小牛${statusDesc[workerStatus]}。请用一句话调侃或评论这个场景，要求：简短（15字以内）、可爱调皮、不要用引号。直接输出台词，不要解释。`,
          personality: 'lively'
        })
      })

      if (response.ok) {
        const data = await response.json()
        // 提取回复文本，兼容不同响应格式
        const text = data.reply || data.text || data.message || ''
        if (text && text.trim()) {
          _triggerChimeIn(text.trim(), workerStatus)
          return
        }
      }
    } catch {
      // AI生成失败时静默回退到预设台词，不显示错误
    }

    // AI生成失败，回退到预设台词
    const presets = CHIME_IN_PRESETS[workerStatus]
    const fallback = presets[Math.floor(Math.random() * presets.length)]
    _triggerChimeIn(fallback, workerStatus)
  }

  /**
   * 清除插嘴自动消失定时器
   * @returns {void}
   */
  function _clearChimeInTimer() {
    if (chimeInTimer) {
      clearTimeout(chimeInTimer)
      chimeInTimer = null
    }
  }

  /**
   * 手动关闭插嘴气泡
   * @returns {void}
   */
  function dismissChimeIn() {
    _clearChimeInTimer()
    chimeIn.value.active = false
  }

  /**
   * 重置工作区到初始状态
   * @returns {void}
   */
  function reset() {
    clearTaskTimeout()
    _clearChimeInTimer()
    panelState.value = 'collapsed'
    chatRatio.value = DEFAULT_CHAT_RATIO
    workerStatus.value = 'idle'
    workerAnimation.value = 'sleep'
    currentTaskId.value = null
    taskDescription.value = ''
    progress.value = 0
    logs.value = []
    taskResult.value = null
    chimeIn.value = { active: false, text: '', triggerStatus: 'idle', timestamp: 0 }
    lastChimeInTime = 0
  }

  return {
    // 面板状态
    panelState,
    chatRatio,

    // 小牛状态
    workerStatus,
    workerAnimation,

    // 任务数据
    currentTaskId,
    taskDescription,
    progress,
    logs,
    taskResult,

    // 插嘴状态
    chimeIn,

    // 计算属性
    isExpanded,
    isIdle,
    isWorking,
    statusConfig,
    workRatio,

    // 方法
    togglePanel,
    expandPanel,
    collapsePanel,
    setChatRatio,
    setWorkerStatus,
    setWorkerAnimation,
    startTask,
    updateProgress,
    addLog,
    addWorkLog,
    setTaskResult,
    startTaskTimeout,
    clearTaskTimeout,
    workerDismiss,
    dismissChimeIn,
    reset
  }
})
