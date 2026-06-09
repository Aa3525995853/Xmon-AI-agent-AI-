/**
 * @file 主动服务轮询
 * @description 从旧版HTML的 fetchProactiveMessages 提取，管理主动消息轮询和显示
 * @module composables/useProactive
 */

import { ref, onUnmounted } from 'vue'
import type { ProactiveMessage, ProactiveType } from '../types'

/** 主动消息情绪映射 */
const PROACTIVE_EMOTION_MAP: Record<ProactiveType, string> = {
  'morning': 'warm',
  'evening': 'warm',
  'night': 'calm',
  'emotion_care': 'warm',
  'milestone': 'happy',
  'streak': 'happy',
  'stage_transition': 'happy'
}

/** 主动消息类型图标 */
const TYPE_ICONS: Record<ProactiveType, string> = {
  'morning': '🌅',
  'evening': '🌆',
  'night': '🌙',
  'emotion_care': '💛',
  'milestone': '🎉',
  'streak': '🔥',
  'stage_transition': '✨'
}

/**
 * 主动服务轮询组合式函数
 * 管理主动消息的定时轮询、显示和对话模式控制
 * @returns 主动服务控制方法和状态
 */
export function useProactive() {
  /** 是否正在轮询 */
  const pollingActive = ref(false)
  /** 轮询定时器 */
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  /** 最后收到的主动消息 */
  const lastMessage = ref<ProactiveMessage | null>(null)

  /**
   * 开始轮询主动消息
   * @param onMessage - 收到消息时的回调
   * @param interval - 轮询间隔（毫秒），默认30秒
   */
  function startPolling(
    onMessage?: (msg: ProactiveMessage) => void,
    interval = 30000
  ) {
    pollingActive.value = true
    fetchMessages(onMessage, interval)
  }

  /**
   * 停止轮询主动消息
   */
  function stopPolling() {
    pollingActive.value = false
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  /**
   * 获取主动消息
   * @param onMessage - 收到消息时的回调
   * @param interval - 轮询间隔
   */
  async function fetchMessages(
    onMessage?: (msg: ProactiveMessage) => void,
    interval = 30000
  ) {
    if (!pollingActive.value) return

    try {
      const response = await fetch('/api/proactive/messages')
      if (response.ok) {
        const data = await response.json()
        if (data.messages && data.messages.length > 0) {
          const msg = data.messages[0] as ProactiveMessage
          lastMessage.value = msg
          onMessage?.(msg)
        }
      }
    } catch (e) {
      console.warn('[主动服务] 获取消息失败:', (e as Error).message)
    }

    // 继续轮询
    pollTimer = setTimeout(() => fetchMessages(onMessage, interval), interval)
  }

  /**
   * 通知主动服务进入/退出对话模式
   * @param inConversation - 是否处于对话中
   */
  async function setConversationMode(inConversation: boolean) {
    try {
      await fetch('/api/proactive/conversation-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inConversation })
      })
    } catch {
      // 忽略错误
    }
  }

  /**
   * 获取消息类型图标
   * @param type - 消息类型
   * @returns 图标字符串
   */
  function getTypeIcon(type: ProactiveType): string {
    return TYPE_ICONS[type] || '💭'
  }

  /**
   * 获取消息对应情绪
   * @param type - 消息类型
   * @returns 情绪标签
   */
  function getEmotionForType(type: ProactiveType): string {
    return PROACTIVE_EMOTION_MAP[type] || 'warm'
  }

  // 组件卸载时清理
  onUnmounted(() => {
    stopPolling()
  })

  return {
    /** 是否正在轮询 */
    pollingActive,
    /** 最后收到的消息 */
    lastMessage,
    /** 开始轮询 */
    startPolling,
    /** 停止轮询 */
    stopPolling,
    /** 设置对话模式 */
    setConversationMode,
    /** 获取类型图标 */
    getTypeIcon,
    /** 获取类型情绪 */
    getEmotionForType
  }
}
