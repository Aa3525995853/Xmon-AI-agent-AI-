/**
 * @file 全局应用状态
 * @description 从旧版HTML的 state 对象提取，管理全局应用状态（模式、语音、人格等）
 * @module stores/app
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppMode, Personality, Task } from '../types'

/**
 * 全局应用状态 Store
 * 管理应用模式、语音开关、人格、当前任务等全局状态
 */
export const useAppStore = defineStore('app', () => {
  // === 应用模式 ===
  /** 当前应用模式 */
  const mode = ref<AppMode>('idle')
  /** 是否正在聆听 */
  const isListening = ref(false)
  /** 是否正在处理 */
  const isProcessing = ref(false)
  /** 是否正在播放音频 */
  const isPlaying = ref(false)
  /** 是否已收到ASR结果 */
  const hasReceivedAsr = ref(false)

  // === 语音设置 ===
  /** 语音开关（从 localStorage 恢复） */
  const voiceEnabled = ref(localStorage.getItem('voiceEnabled') !== 'false')

  // === 人格设置 ===
  /** 当前人格（从 localStorage 恢复） */
  const personality = ref<Personality>(
    (localStorage.getItem('persona') as Personality) || 'normal'
  )
  /** 当前方言 */
  const dialect = ref<string | null>(null)
  /** 当前服务提供者 */
  const currentProvider = ref<string | null>(null)

  // === 大脑状态 ===
  /** 大脑模式 */
  const brainMode = ref<string>('idle')

  // === 任务状态 ===
  /** 当前活动任务 */
  const activeTask = ref<Task | null>(null)

  // === 连接状态 ===
  /** WebSocket 连接状态 */
  const wsConnected = ref(false)
  /** 工作大脑可用性 */
  const workbrainAvailable = ref<boolean | null>(null)

  // === 内部状态 ===
  /** 最后SSE文本时间 */
  const lastSseTextTime = ref(0)
  /** 打字指示器超时ID */
  const typingIndicatorTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

  // === 计算属性 ===
  /** 是否处于空闲状态 */
  const isIdle = computed(() => mode.value === 'idle')
  /** 是否正在工作中 */
  const isWorking = computed(() => brainMode.value === 'working')
  /** 输入框占位文本 */
  const inputPlaceholder = computed(() => {
    const labels: Record<AppMode, string> = {
      idle: '给小梦发消息...',
      listening: '正在聆听...',
      processing: '小梦正在思考...',
      speaking: '小梦正在说话...'
    }
    return labels[mode.value]
  })

  // === 方法 ===

  /**
   * 设置应用模式
   * @param newMode - 新的应用模式
   */
  function setMode(newMode: AppMode) {
    mode.value = newMode
    if (newMode === 'idle') {
      currentProvider.value = null
      brainMode.value = 'idle'
    }
  }

  /**
   * 切换语音开关
   */
  function toggleVoice() {
    voiceEnabled.value = !voiceEnabled.value
    localStorage.setItem('voiceEnabled', String(voiceEnabled.value))
  }

  /**
   * 设置人格
   * @param p - 人格类型
   */
  function setPersonality(p: Personality) {
    personality.value = p
    localStorage.setItem('persona', p)
  }

  /**
   * 设置方言
   * @param d - 方言标识
   */
  function setDialect(d: string | null) {
    dialect.value = d
  }

  /**
   * 设置当前活动任务
   * @param task - 任务对象或null
   */
  function setActiveTask(task: Task | null) {
    activeTask.value = task
  }

  /**
   * 设置工作大脑可用性
   * @param available - 是否可用
   */
  function setWorkbrainAvailable(available: boolean) {
    workbrainAvailable.value = available
  }

  /**
   * 更新最后SSE文本时间
   */
  function touchSseTextTime() {
    lastSseTextTime.value = Date.now()
  }

  /**
   * 重置处理状态
   */
  function resetProcessing() {
    isProcessing.value = false
    isPlaying.value = false
    hasReceivedAsr.value = false
    setMode(isListening.value ? 'listening' : 'idle')
  }

  return {
    // 状态
    mode,
    isListening,
    isProcessing,
    isPlaying,
    hasReceivedAsr,
    voiceEnabled,
    personality,
    dialect,
    currentProvider,
    brainMode,
    activeTask,
    wsConnected,
    workbrainAvailable,
    lastSseTextTime,
    typingIndicatorTimeout,

    // 计算属性
    isIdle,
    isWorking,
    inputPlaceholder,

    // 方法
    setMode,
    toggleVoice,
    setPersonality,
    setDialect,
    setActiveTask,
    setWorkbrainAvailable,
    touchSseTextTime,
    resetProcessing
  }
})
