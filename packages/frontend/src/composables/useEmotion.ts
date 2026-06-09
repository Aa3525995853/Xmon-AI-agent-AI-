/**
 * @file 表情系统
 * @description 从旧版HTML的 EMOTIONS 和 setEmotion 提取，管理情绪标签映射和 Live2D 表情预设
 * @module composables/useEmotion
 */

import { ref, computed } from 'vue'
import type { EmotionConfig, ExpressionPreset } from '../types'

/** 情绪配置映射（支持中英文标签） */
const EMOTIONS: Record<string, EmotionConfig> = {
  'calm':    { icon: '😌', color: '#5db8a6', label: '平静' },
  'warm':    { icon: '🥰', color: '#cc785c', label: '温柔' },
  'worried': { icon: '😟', color: '#e8a55a', label: '担忧' },
  'sleepy':  { icon: '😴', color: '#8e8b82', label: '犯困' },
  'happy':   { icon: '😊', color: '#5db872', label: '开心' },
  'angry':   { icon: '😠', color: '#c64545', label: '生气' },
  '开心':    { icon: '😊', color: '#5db872', label: '开心' },
  '悲伤':    { icon: '😢', color: '#5db8a6', label: '悲伤' },
  '生气':    { icon: '😠', color: '#c64545', label: '生气' },
  '温柔':    { icon: '🥰', color: '#cc785c', label: '温柔' },
  '惊讶':    { icon: '😲', color: '#e8a55a', label: '惊讶' },
  '平静':    { icon: '😌', color: '#5db8a6', label: '平静' },
  '思考':    { icon: '🤔', color: '#8e8b82', label: '思考' }
}

/** Live2D 表情预设参数 */
const EXPRESSION_PRESETS: Record<string, ExpressionPreset> = {
  '开心': {
    ParamEyeLSmile: 1, ParamEyeRSmile: 1,
    ParamBrowLY: 0.3, ParamBrowRY: 0.3,
    ParamBrowLAngle: 0.2, ParamBrowRAngle: 0.2,
    ParamMouthForm: 1, ParamCheek: 1,
  },
  '悲伤': {
    ParamEyeLSmile: 0, ParamEyeRSmile: 0,
    ParamEyeLOpen: 0.5, ParamEyeROpen: 0.5,
    ParamBrowLY: -0.5, ParamBrowRY: -0.5,
    ParamBrowLAngle: -0.5, ParamBrowRAngle: -0.5,
    ParamMouthForm: -0.5, ParamCheek: 0,
  },
  '生气': {
    ParamEyeLSmile: 0, ParamEyeRSmile: 0,
    ParamEyeLOpen: 1.2, ParamEyeROpen: 1.2,
    ParamBrowLY: -0.8, ParamBrowRY: -0.8,
    ParamBrowLAngle: -1, ParamBrowRAngle: -1,
    ParamBrowLForm: 1, ParamBrowRForm: 1,
    ParamMouthForm: -0.8, ParamCheek: 0,
  },
  '温柔': {
    ParamEyeLSmile: 0.6, ParamEyeRSmile: 0.6,
    ParamEyeLOpen: 0.6, ParamEyeROpen: 0.6,
    ParamBrowLY: 0.2, ParamBrowRY: 0.2,
    ParamBrowLAngle: 0.3, ParamBrowRAngle: 0.3,
    ParamMouthForm: 0.5, ParamCheek: 0.6,
  },
  '惊讶': {
    ParamEyeLSmile: 0, ParamEyeRSmile: 0,
    ParamEyeLOpen: 1.5, ParamEyeROpen: 1.5,
    ParamBrowLY: 1, ParamBrowRY: 1,
    ParamBrowLAngle: 0.5, ParamBrowRAngle: 0.5,
    ParamMouthForm: 0, ParamMouthOpenY: 0.8,
    ParamCheek: 0,
  },
  '平静': {
    ParamEyeLSmile: 0, ParamEyeRSmile: 0,
    ParamEyeLOpen: 1, ParamEyeROpen: 1,
    ParamBrowLY: 0, ParamBrowRY: 0,
    ParamBrowLAngle: 0, ParamBrowRAngle: 0,
    ParamMouthForm: 0, ParamCheek: 0,
  },
  '思考': {
    ParamEyeLSmile: 0, ParamEyeRSmile: 0,
    ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7,
    ParamBrowLY: 0.3, ParamBrowRY: -0.2,
    ParamBrowLAngle: 0.3, ParamBrowRAngle: -0.2,
    ParamMouthForm: -0.2, ParamCheek: 0,
  }
}

/** 情绪到 Live2D 表情的映射 */
const EMOTION_TO_EXPRESSION: Record<string, string> = {
  'calm': '平静',
  'warm': '温柔',
  'worried': '思考',
  'sleepy': '思考',
  'happy': '开心',
  'angry': '生气'
}

/**
 * 表情系统组合式函数
 * 管理当前情绪状态、表情预设切换等
 * @returns 表情系统状态和控制方法
 */
export function useEmotion() {
  /** 当前情绪标签 */
  const currentEmotion = ref<string>('calm')
  /** 当前表情预设标签 */
  const currentExpression = ref<string>('平静')
  /** 当前表情预设参数 */
  const currentPreset = ref<ExpressionPreset>(EXPRESSION_PRESETS['平静'])

  /** 当前情绪配置 */
  const emotionConfig = computed(() =>
    EMOTIONS[currentEmotion.value] || { icon: '😶', color: '#8e8b82', label: currentEmotion.value }
  )

  /**
   * 设置情绪
   * @param label - 情绪标签（中英文均可）
   */
  function setEmotion(label: string) {
    currentEmotion.value = label
    // 映射到 Live2D 表情预设
    const expressionLabel = EMOTION_TO_EXPRESSION[label] || label
    applyExpression(expressionLabel)
  }

  /**
   * 应用表情预设
   * @param label - 表情预设标签
   */
  function applyExpression(label: string) {
    const preset = EXPRESSION_PRESETS[label] || EXPRESSION_PRESETS['平静']
    currentExpression.value = label
    currentPreset.value = preset
  }

  /**
   * 获取指定情绪的配置
   * @param label - 情绪标签
   * @returns 情绪配置
   */
  function getEmotionConfig(label: string): EmotionConfig {
    return EMOTIONS[label] || { icon: '😶', color: '#8e8b82', label }
  }

  return {
    /** 当前情绪标签 */
    currentEmotion,
    /** 当前表情预设标签 */
    currentExpression,
    /** 当前表情预设参数 */
    currentPreset,
    /** 当前情绪配置 */
    emotionConfig,
    /** 设置情绪 */
    setEmotion,
    /** 应用表情预设 */
    applyExpression,
    /** 获取情绪配置 */
    getEmotionConfig,
    /** 表情预设映射（供 Live2D 使用） */
    EXPRESSION_PRESETS
  }
}
