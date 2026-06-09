/**
 * @file 聊天状态
 * @description 管理聊天消息列表、会话隔离、打字指示器、消息发送等聊天相关状态
 *              支持多会话切换、自动保存到后端、上下文压缩与摘要
 * @module stores/chat
 * @version 2.0.0
 * @date 2026-06-08
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Message, MessageRole } from '../types'

/** 生成唯一消息ID */
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** localStorage 中存储会话ID的键名 */
const SESSION_ID_KEY = 'xiaomeng_session_id'

/**
 * 获取稳定的会话ID
 * 优先从 localStorage 读取，已存在则复用；首次访问时生成并存储
 */
function getStableSessionId(): string {
  // 优先从 localStorage 读取已存在的会话ID
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem(SESSION_ID_KEY)
    if (stored) return stored
  }
  // 首次访问时生成并存储
  const newId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(SESSION_ID_KEY, newId)
  }
  return newId
}

/** 生成唯一会话ID（仅用于创建新会话） */
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 自动保存到后端的防抖间隔（毫秒） */
const AUTO_SAVE_DEBOUNCE_MS = 3000

/**
 * 聊天状态 Store
 * 管理消息列表、会话隔离、打字指示器、消息增删改等
 */
export const useChatStore = defineStore('chat', () => {
  // ============================================================
  // 会话管理状态
  // ============================================================

  /** 当前活跃会话ID（使用稳定ID，避免刷新页面创建新会话） */
  const currentSessionId = ref<string>(getStableSessionId())
  /** 是否已初始化会话（与后端同步） */
  const sessionInitialized = ref(false)
  /** 自动保存定时器 */
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

  // ============================================================
  // 消息状态
  // ============================================================

  /** 消息列表 */
  const messages = ref<Message[]>([])
  /** 是否显示打字指示器 */
  const isTyping = ref(false)
  /** 打字指示器上下文文本 */
  const typingContext = ref<string>('')

  // ============================================================
  // 计算属性
  // ============================================================

  /** 最后一条消息 */
  const lastMessage = computed(() =>
    messages.value.length > 0 ? messages.value[messages.value.length - 1] : null
  )
  /** 助手消息数量 */
  const assistantMessageCount = computed(() =>
    messages.value.filter(m => m.role === 'assistant').length
  )

  // ============================================================
  // 会话管理方法
  // ============================================================

  /**
   * 初始化当前会话（与后端同步）
   * 仅获取后端已有的历史消息，不主动创建空会话
   */
  async function initSession() {
    if (sessionInitialized.value) return

    try {
      // 仅获取会话历史，不创建新会话（避免空对话占用存储）
      const res = await fetch(`/api/session/history?sessionId=${currentSessionId.value}&limit=50`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.history?.length > 0) {
          // 将后端历史消息转换为前端 Message 格式
          messages.value = data.history.map((msg: any) => ({
            id: generateId(),
            role: msg.role as MessageRole,
            text: msg.content || '',
            emotion: msg.emotion,
            timestamp: msg.timestamp || Date.now()
          }))
        }
      }
    } catch (e) {
      console.error('[ChatStore] 初始化会话失败:', e)
    } finally {
      // 无论成功失败都标记为已初始化，避免反复重试
      sessionInitialized.value = true
    }
  }

  /**
   * 切换到指定会话
   * @param sessionId - 目标会话ID
   */
  async function switchSession(sessionId: string) {
    // 先保存当前会话
    await saveCurrentSession()

    // 切换会话ID
    currentSessionId.value = sessionId
    // 更新 localStorage 中的会话ID
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(SESSION_ID_KEY, sessionId)
    }
    messages.value = []
    sessionInitialized.value = false

    // 加载目标会话的历史消息
    await initSession()
  }

  /**
   * 创建新会话
   * @returns 新会话ID
   */
  async function createNewSession(): Promise<string> {
    // 先保存当前会话（只有非空会话才保存）
    await saveCurrentSession()

    // 生成新会话ID
    const newId = generateSessionId()

    // 只有当前会话有消息时才在后端创建会话记录
    // 空对话直接清空前端状态，不占用后端存储
    if (messages.value.length > 0) {
      try {
        await fetch('/api/session/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: newId,
            metadata: { title: '新对话' }
          })
        })
      } catch (e) {
        console.error('[ChatStore] 创建新会话失败:', e)
      }
    }

    // 切换到新会话
    currentSessionId.value = newId
    // 更新 localStorage 中的会话ID
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(SESSION_ID_KEY, newId)
    }
    messages.value = []
    sessionInitialized.value = true

    return newId
  }

  /**
   * 保存当前会话到后端（将所有消息同步）
   */
  async function saveCurrentSession() {
    if (messages.value.length === 0) return

    try {
      // 逐条发送消息到后端（仅发送新增的）
      // 为简化逻辑，这里批量发送所有消息
      const historyMessages = messages.value.map(msg => ({
        role: msg.role,
        content: msg.text,
        emotion: msg.emotion,
        timestamp: msg.timestamp
      }))

      // 使用清空+重新添加的方式确保一致性
      await fetch('/api/session/clear-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId.value })
      })

      // 批量添加消息
      for (const msg of historyMessages) {
        await fetch('/api/session/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId.value,
            role: msg.role,
            content: msg.content,
            extra: { emotion: msg.emotion, timestamp: msg.timestamp }
          })
        })
      }
    } catch (e) {
      console.error('[ChatStore] 保存会话失败:', e)
    }
  }

  /**
   * 获取对话摘要（上下文压缩）
   * @returns 摘要文本
   */
  async function getSummary(): Promise<string> {
    try {
      const res = await fetch(`/api/session/summary?sessionId=${currentSessionId.value}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          return data.summary || ''
        }
      }
    } catch (e) {
      console.error('[ChatStore] 获取摘要失败:', e)
    }
    return ''
  }

  /**
   * 触发上下文压缩
   * @param strategy - 压缩策略
   * @returns 压缩后的消息列表
   */
  async function compressContext(strategy: string = 'hybrid') {
    try {
      const res = await fetch('/api/session/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId.value,
          strategy
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          return data.compressed
        }
      }
    } catch (e) {
      console.error('[ChatStore] 上下文压缩失败:', e)
    }
    return null
  }

  /**
   * 获取所有会话列表
   * @returns 会话列表
   */
  async function getSessionList() {
    try {
      const res = await fetch('/api/session/list')
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          return data.sessions || []
        }
      }
    } catch (e) {
      console.error('[ChatStore] 获取会话列表失败:', e)
    }
    return []
  }

  /**
   * 删除指定会话
   * @param sessionId - 要删除的会话ID
   */
  async function deleteSession(sessionId: string) {
    try {
      await fetch(`/api/session/${sessionId}`, { method: 'DELETE' })
    } catch (e) {
      console.error('[ChatStore] 删除会话失败:', e)
    }
  }

  // ============================================================
  // 消息操作方法
  // ============================================================

  /**
   * 添加消息
   * @param role - 消息角色
   * @param text - 消息文本
   * @param emotion - 情绪标签
   * @returns 新添加的消息对象
   */
  function addMessage(role: MessageRole, text: string, emotion?: string): Message {
    const msg: Message = {
      id: generateId(),
      role,
      text,
      emotion: emotion || undefined,
      timestamp: Date.now()
    }
    messages.value.push(msg)

    // 触发自动保存（防抖）
    scheduleAutoSave()

    return msg
  }

  /**
   * 更新最后一条指定角色的消息
   * @param role - 消息角色
   * @param text - 新文本内容
   */
  function updateLastMessage(role: MessageRole, text: string) {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === role) {
        messages.value[i].text = text
        // 触发自动保存
        scheduleAutoSave()
        return
      }
    }
    // 如果没找到，添加新消息
    addMessage(role, text)
  }

  /**
   * 显示打字指示器
   * @param contextText - 上下文提示文本
   */
  function showTyping(contextText = '') {
    isTyping.value = true
    typingContext.value = contextText
  }

  /**
   * 隐藏打字指示器
   */
  function hideTyping() {
    isTyping.value = false
    typingContext.value = ''
  }

  /**
   * 清空所有消息（当前会话）
   */
  function clearMessages() {
    messages.value = []
    // 清空后端历史
    fetch('/api/session/clear-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId.value })
    }).catch(() => {})
  }

  /**
   * 删除指定ID的消息
   * @param id - 消息ID
   */
  function removeMessage(id: string) {
    const index = messages.value.findIndex(m => m.id === id)
    if (index !== -1) {
      messages.value.splice(index, 1)
      scheduleAutoSave()
    }
  }

  // ============================================================
  // 自动保存机制
  // ============================================================

  /**
   * 调度自动保存（防抖，避免频繁请求后端）
   */
  function scheduleAutoSave() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }
    autoSaveTimer = setTimeout(() => {
      saveCurrentSession()
    }, AUTO_SAVE_DEBOUNCE_MS)
  }

  return {
    // 会话状态
    currentSessionId,
    sessionInitialized,

    // 消息状态
    messages,
    isTyping,
    typingContext,

    // 计算属性
    lastMessage,
    assistantMessageCount,

    // 会话管理方法
    initSession,
    switchSession,
    createNewSession,
    saveCurrentSession,
    getSummary,
    compressContext,
    getSessionList,
    deleteSession,

    // 消息操作方法
    addMessage,
    updateLastMessage,
    showTyping,
    hideTyping,
    clearMessages,
    removeMessage
  }
})
