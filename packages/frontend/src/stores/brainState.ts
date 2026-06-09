/**
 * @file 大脑状态机
 * @description 从旧版HTML的 BrainFSM 提取，管理小梦大脑的状态转换逻辑
 * @module stores/brainState
 */

import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import type { BrainState, BrainEvent, BrainStateConfig } from '../types'

/** 大脑状态配置映射 */
const BRAIN_STATE_CONFIGS: Record<BrainState, BrainStateConfig> = {
  idle:      { emotion: 'calm',    action: 'none',  label: '待机',   icon: '🌙' },
  listening: { emotion: 'calm',    action: 'tilt',  label: '聆听',   icon: '👂' },
  thinking:  { emotion: 'worried', action: 'none',  label: '思考',   icon: '💭' },
  chatting:  { emotion: 'warm',    action: 'nod',   label: '闲聊',   icon: '💬' },
  working:   { emotion: 'worried', action: 'none',  label: '工作中', icon: '⚡' },
  speaking:  { emotion: 'warm',    action: 'none',  label: '说话',   icon: '🗣️' },
  degraded:  { emotion: 'worried', action: 'shake', label: '降级',   icon: '⚠️' },
  error:     { emotion: 'angry',   action: 'sigh',  label: '异常',   icon: '❌' }
}

/** 状态转换表 */
const TRANSITIONS: Record<BrainState, Partial<Record<BrainEvent, BrainState>>> = {
  idle:      { listen: 'listening', think: 'thinking', chat: 'chatting', work: 'working', speak: 'speaking', degrade: 'degraded', error: 'error' },
  listening: { stop: 'idle', think: 'thinking', chat: 'chatting', work: 'working' },
  thinking:  { chat: 'chatting', work: 'working', speak: 'speaking', degrade: 'degraded', error: 'error' },
  chatting:  { stop: 'idle', think: 'thinking', work: 'working', speak: 'speaking' },
  working:   { done: 'idle', speak: 'speaking', degrade: 'degraded', error: 'error', chat: 'chatting' },
  speaking:  { stop: 'idle', think: 'thinking', chat: 'chatting', work: 'working' },
  degraded:  { recover: 'idle', chat: 'chatting', work: 'working', error: 'error' },
  error:     { reset: 'idle', recover: 'degraded' }
}

/**
 * 大脑状态机 Store
 * 管理小梦大脑的状态转换，驱动表情、动作和UI更新
 */
export const useBrainStateStore = defineStore('brainState', () => {
  // === 状态 ===
  /** 当前大脑状态 */
  const state = ref<BrainState>('idle')
  /** 前一个状态 */
  const prevState = ref<BrainState | null>(null)

  // === 计算属性 ===
  /** 当前状态配置 */
  const currentConfig = computed(() => BRAIN_STATE_CONFIGS[state.value])
  /** 当前状态标签 */
  const label = computed(() => currentConfig.value.label)
  /** 当前状态图标 */
  const icon = computed(() => currentConfig.value.icon)
  /** 当前情绪 */
  const emotion = computed(() => currentConfig.value.emotion)
  /** 是否处于工作状态 */
  const isWorking = computed(() => state.value === 'working')
  /** 是否处于降级状态 */
  const isDegraded = computed(() => state.value === 'degraded')

  // === 方法 ===

  /**
   * 执行状态转换
   * @param event - 触发转换的事件
   * @returns 是否转换成功
   */
  function transition(event: BrainEvent): boolean {
    const allowed = TRANSITIONS[state.value]
    if (!allowed || !allowed[event]) {
      console.warn(`[BrainFSM] 无效转换: ${state.value} + ${event}`)
      return false
    }

    const nextState = allowed[event]!
    prevState.value = state.value
    state.value = nextState
    console.log(`[BrainFSM] ${prevState.value} → ${nextState} (event: ${event})`)
    return true
  }

  /**
   * 强制重置到指定状态（跳过转换表校验）
   * @param newState - 目标状态
   */
  function forceState(newState: BrainState) {
    prevState.value = state.value
    state.value = newState
  }

  /**
   * 重置到空闲状态
   */
  function reset() {
    prevState.value = state.value
    state.value = 'idle'
  }

  return {
    // 状态（只读）
    state: readonly(state),
    prevState: readonly(prevState),

    // 计算属性
    currentConfig,
    label,
    icon,
    emotion,
    isWorking,
    isDegraded,

    // 方法
    transition,
    forceState,
    reset
  }
})
