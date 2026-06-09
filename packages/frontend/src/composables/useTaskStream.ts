/**
 * @file SSE任务流
 * @description 管理 Server-Sent Events 流式请求，处理文本流和PCM音频流，
 *              同时负责工作意图识别并路由到独立的工作API端点
 * @module composables/useTaskStream
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

import { ref } from 'vue'
import { useAppStore } from '../stores/app'
import { useChatStore } from '../stores/chat'
import { useBrainStateStore } from '../stores/brainState'
import { useWorkerStore } from '../stores/worker'
import type { SSEEventData } from '../types'

// ============================================================
// 常量定义
// ============================================================

/** SSE事件名前缀长度（"event: " 占7个字符） */
const SSE_EVENT_PREFIX_LEN = 7

/** SSE数据前缀长度（"data: " 占6个字符） */
const SSE_DATA_PREFIX_LEN = 6

/** 任务描述截断长度，用于日志展示 */
const TASK_DESC_PREVIEW_LEN = 50

/** 错误信息截断长度，防止日志过长 */
const ERROR_PREVIEW_LEN = 100

/** HTTP错误响应截断长度 */
const HTTP_ERROR_PREVIEW_LEN = 200

// ============================================================
// SSE 任务流组合式函数
// ============================================================

/**
 * SSE 任务流组合式函数
 * 管理 /api/chat/text-stream 的流式请求，解析 SSE 事件并分发到各 Store
 * @returns SSE 流控制方法和状态
 */
export function useTaskStream() {
  const appStore = useAppStore()
  const chatStore = useChatStore()
  const brainStore = useBrainStateStore()
  const workerStore = useWorkerStore()

  /** 是否正在流式接收 */
  const streaming = ref(false)
  /** AbortController 用于取消请求 */
  let abortController: AbortController | null = null
  /** 正在被"正在执行任务..."占位符消息占据的最后一条 assistant 消息 ID（用于替换为真实内容） */
  let pendingThinkingMsgId: string | null = null

  // ============================================================
  // 闲聊流式请求
  // ============================================================

  /**
   * 发送文本消息并接收流式响应
   * @param text - 用户输入文本
   * @param options - 可选参数
   * @param options.personality - 人格类型
   * @param options.dialect - 方言
   * @param options.image - 图片附件
   * @param options.onText - 文本事件回调
   * @param options.onPCM - PCM音频事件回调
   * @param options.onAudioEnd - 音频结束回调
   * @param options.onError - 错误回调
   * @returns {Promise<void>} 无返回值
   * @throws {Error} 当HTTP请求失败时抛出错误（非AbortError）
   */
  async function sendStreamText(
    text: string,
    options?: {
      personality?: string
      dialect?: string | null
      image?: { base64: string; mimeType: string }
      onText?: (text: string, emotion?: string) => void
      onPCM?: (pcmBase64: string) => void
      onAudioEnd?: () => void
      onError?: (error: Error) => void
    }
  ) {
    if (streaming.value) return

    streaming.value = true
    abortController = new AbortController()
    appStore.isProcessing = true
    brainStore.transition('think')
    chatStore.showTyping(getToolContextHint(text))

    // 检测是否为 work 意图，如果是则发送到独立的工作 API
    if (isWorkIntent(text)) {
      // 重置闲聊区的加载状态（工作意图不走闲聊通道，不需要显示加载动画）
      streaming.value = false
      appStore.isProcessing = false
      chatStore.hideTyping()
      brainStore.transition('idle')
      // 使用独立的 /api/work 端点，不阻塞闲聊通道
      sendToWorkAPI(text, options?.image)
      // 立即返回，让用户可以继续聊天
      return
    }

    // 非工作意图，走正常的闲聊流程
    try {
      const formData = new FormData()
      formData.append('message', text.trim())
      formData.append('personality', options?.personality || appStore.personality)
      if (options?.dialect || appStore.dialect) {
        formData.append('dialect', options?.dialect || appStore.dialect!)
      }
      if (options?.image) {
        formData.append('image', options.image.base64)
        formData.append('imageMimeType', options.image.mimeType)
      }

      const response = await fetch('/api/chat/text-stream', {
        method: 'POST',
        body: formData,
        signal: abortController.signal
      })

      if (!response.ok) throw new Error(`请求失败: ${response.status}`)

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let collectedText: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(SSE_EVENT_PREFIX_LEN).trim()
            continue
          }
          if (line.startsWith('data: ')) {
            try {
              const data: SSEEventData = JSON.parse(line.slice(SSE_DATA_PREFIX_LEN))

              // 文本事件
              if (currentEvent === 'text' && data.text) {
                appStore.touchSseTextTime()
                if (data.emotion === 'thinking') {
                  // 工具调用模式：显示"正在执行任务..."占位符，记住消息ID以便后续替换
                  if (pendingThinkingMsgId) {
                    // 已经有占位符，替换内容
                    chatStore.updateLastMessage('assistant', data.text)
                  } else {
                    // 首次进入工具调用模式，添加占位消息
                    const msg = chatStore.addMessage('assistant', data.text)
                    pendingThinkingMsgId = msg.id
                  }
                } else {
                  // 正常模式：将文本累积到 collectedText，最后一次性添加
                  collectedText.push(data.text)
                }
                options?.onText?.(data.text, data.emotion)
              }

              // 任务ID事件：后端返回任务ID，更新工作区
              if (data.taskId && workerStore.isExpanded) {
                workerStore.currentTaskId = data.taskId
              }

              // PCM 音频事件
              if (data.pcm) {
                // 有音频时：先 flush 已收集的文本
                if (collectedText.length > 0) {
                  const fullText = collectedText.join('\n')
                  if (pendingThinkingMsgId) {
                    // 工具调用模式：替换占位消息
                    chatStore.updateLastMessage('assistant', fullText)
                    pendingThinkingMsgId = null
                  } else {
                    chatStore.addMessage('assistant', fullText)
                  }
                  collectedText = []
                }
                options?.onPCM?.(data.pcm)
              }

              // 音频结束事件
              if (currentEvent === 'audio_end') {
                options?.onAudioEnd?.()
              }
            } catch {
              // 忽略解析错误
            }
            // 注意：不要在这里重置 currentEvent！
            // currentEvent 应该保持不变，直到遇到下一个 event: 行
            // 这样同一个 event 后的多个 data: 行都能被正确处理
          }
        }
      }

      // 处理剩余 buffer 中的数据（重要修复！）
      if (buffer.trim()) {
        const lines = buffer.split('\n')
        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(SSE_EVENT_PREFIX_LEN).trim()
            continue
          }
          if (line.startsWith('data: ') && line.length > SSE_DATA_PREFIX_LEN) {
            try {
              const data: SSEEventData = JSON.parse(line.slice(SSE_DATA_PREFIX_LEN))
              if (currentEvent === 'text' && data.text) {
                collectedText.push(data.text)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      // 处理剩余的收集文本
      if (collectedText.length > 0) {
        const fullText = collectedText.join('\n')
        if (pendingThinkingMsgId) {
          // 工具调用模式：替换占位消息
          chatStore.updateLastMessage('assistant', fullText)
        } else {
          chatStore.addMessage('assistant', fullText)
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        options?.onError?.(err as Error)
        chatStore.addMessage('assistant', `抱歉，出了点问题：${(err as Error).message}`)
      }
    } finally {
      streaming.value = false
      appStore.isProcessing = false
      chatStore.hideTyping()
      abortController = null
      appStore.resetProcessing()
    }
  }

  /**
   * 取消当前流式请求
   * @returns {void}
   */
  function cancelStream() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    streaming.value = false
    appStore.isProcessing = false
    chatStore.hideTyping()
  }

  // ============================================================
  // 工作意图识别与路由
  // ============================================================

  /**
   * 获取工具上下文提示
   * 根据用户输入中的关键词匹配对应的操作类型，返回友好的提示文案
   * @param text - 用户输入文本
   * @returns {string} 上下文提示字符串，无匹配时返回空字符串
   */
  function getToolContextHint(text: string): string {
    const t = text.trim()
    if (/打开|启动/.test(t)) return '🖥️ 正在打开应用...'
    if (/搜索|搜一下|查一下/.test(t)) return '🔍 正在搜索...'
    if (/天气/.test(t)) return '🌤️ 正在查天气...'
    if (/截图|截屏/.test(t)) return '📸 正在截图...'
    if (/翻译/.test(t)) return '🌐 正在翻译...'
    if (/整理/.test(t)) return '📁 正在整理...'
    if (/关机|重启|锁屏/.test(t)) return '⚙️ 正在执行...'
    if (/音量|声音/.test(t)) return '🔊 正在调节...'
    if (/提醒|闹钟/.test(t)) return '⏰ 正在设置...'
    return ''
  }

  /**
   * 判断用户输入是否为工作意图
   * 工作意图 = 需要实际执行操作的请求（搜索实时数据、生成方案、系统控制、批量处理）
   * @param text - 用户输入文本
   * @returns {boolean} 是否为工作意图
   */
  function isWorkIntent(text: string): boolean {
    const t = text.trim()

    // ========================
    // 明确的排除模式（纯咨询/讨论类，走闲聊区）
    // ========================
    const chatPatterns = [
      // 单句翻译走闲聊区
      /翻译(?!.*文件|.*批量|.*多|.*文件夹|.*整个)/,
      // 解释/介绍类纯咨询
      /这个|那是什么|什么意思|怎么选|哪个好/
    ]
    if (chatPatterns.some(pattern => pattern.test(t))) return false

    // ========================
    // 工作区任务类型
    // ========================
    // 1. 规划/方案类（需要搜索实时数据 + 生成综合方案）
    const planPatterns = [
      /规划|计划(?!建议)/,
      /行程|路线|旅游/,
      /建议.*方案|制定.*方案|生成.*方案/
    ]
    if (planPatterns.some(pattern => pattern.test(t))) return true

    // 2. 系统控制类
    const systemPatterns = [
      /关机|重启|锁屏|注销|登出/,
      /调节.*音量|设置.*音量|音量.*调/,
      /调节.*亮度|设置.*亮度|亮度.*调/,
      /安装.*软件|卸载.*软件/
    ]
    if (systemPatterns.some(pattern => pattern.test(t))) return true

    // 3. 应用操作类
    const appPatterns = [
      /打开.*Excel|打开.*Word|打开.*PPT|打开.*PDF|打开.*记事本|打开.*浏览器/
    ]
    if (appPatterns.some(pattern => pattern.test(t))) return true

    // 4. 文件生成类
    const fileGenPatterns = [
      /生成.*Excel|生成.*表格/,
      /生成.*PPT|生成.*幻灯片/,
      /生成.*PDF/,
      /生成.*报告/,
      /导出.*文件|导出.*Excel|导出.*CSV/
    ]
    if (fileGenPatterns.some(pattern => pattern.test(t))) return true

    // 5. 批量处理类
    const batchPatterns = [
      /批量|多个文件|整个文件夹|全部.*翻译|翻译.*全部|翻译.*文件夹/,
      /整理.*文件|批量.*处理/
    ]
    if (batchPatterns.some(pattern => pattern.test(t))) return true

    // 6. 截图/录屏
    if (/截图|截屏|录屏/.test(t)) return true

    return false
  }

  // ============================================================
  // 工作 API 调用
  // ============================================================

  /**
   * 发送工作任务到独立的 /api/work 端点
   * 不阻塞闲聊通道，用户可以继续聊天
   * @param task - 任务描述
   * @param image - 可选的图片附件
   * @returns {Promise<void>} 无返回值
   * @throws {Error} 当网络请求失败时通过 workerStore 记录错误
   */
  async function sendToWorkAPI(task: string, image?: { base64: string; mimeType: string }) {
    console.log('[useTaskStream] sendToWorkAPI 开始:', task.substring(0, TASK_DESC_PREVIEW_LEN))
    // 展开工作区，显示小牛开工
    workerStore.expandPanel()
    workerStore.startTask('pending', task)
    workerStore.addLog(`📋 收到任务: ${task.substring(0, TASK_DESC_PREVIEW_LEN)}${task.length > TASK_DESC_PREVIEW_LEN ? '...' : ''}`, 'info')

    const startTime = Date.now()
    console.log('[useTaskStream] 发送请求到 /api/work...')

    try {
      const response = await fetch('/api/work', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task,
          context: {
            image: image ? {
              base64: image.base64,
              mimeType: image.mimeType
            } : undefined
          }
        })
      })

      console.log('[useTaskStream] 收到响应, 耗时:', Date.now() - startTime, 'ms, 状态:', response.status)

      if (!response.ok) {
        const text = await response.text()
        console.error('[useTaskStream] 响应错误:', text.substring(0, HTTP_ERROR_PREVIEW_LEN))
        workerStore.addLog(`❌ HTTP错误 ${response.status}: ${text.substring(0, ERROR_PREVIEW_LEN)}`, 'error')
        workerStore.setWorkerStatus('stuck')
        return
      }

      const data = await response.json()
      console.log('[useTaskStream] 解析 JSON 成功:', data)
      if (data.success && data.taskId) {
        workerStore.currentTaskId = data.taskId
        workerStore.addLog(`🚀 任务已排队，ID: ${data.taskId}`, 'info')
        // 任务提交成功，从 starting 切换到 working（后续由 WebSocket 事件驱动状态变化）
        workerStore.setWorkerStatus('working')
        // 启动超时检测：如果 180 秒内没有收到完成/失败事件，标记为超时
        workerStore.startTaskTimeout(data.taskId)
      } else {
        workerStore.addLog(`❌ 任务提交失败: ${data.error || '未知错误'}`, 'error')
        workerStore.setWorkerStatus('stuck')
      }
    } catch (err) {
      console.error('[useTaskStream] 网络错误:', err)
      workerStore.addLog(`❌ 网络错误: ${(err as Error).message}`, 'error')
      workerStore.setWorkerStatus('stuck')
    }
  }

  return {
    /** 是否正在流式接收 */
    streaming,
    /** 发送流式文本请求 */
    sendStreamText,
    /** 取消流式请求 */
    cancelStream
  }
}
