/**
 * @file 语音输入
 * @description 从旧版HTML的 startListening/stopListening 提取，管理麦克风录音和VAD语音活动检测
 * @module composables/useVoiceInput
 */

import { ref, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useBrainStateStore } from '../stores/brainState'

/** VAD 参数配置 */
const VAD_THRESHOLD = 0.025
const SILENCE_TIMEOUT = 800
const MIN_SPEECH_DURATION = 400
const MIN_SPEECH_LENGTH = 800

/**
 * 计算音频数据音量
 * @param data - 音频采样数据
 * @returns 音量值 (0-1)
 */
function getVolume(data: Float32Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i]
  }
  return Math.sqrt(sum / data.length)
}

/**
 * 语音输入组合式函数
 * 管理麦克风录音、VAD语音活动检测、自动停止等
 * @returns 语音输入控制方法和状态
 */
export function useVoiceInput() {
  const appStore = useAppStore()
  const brainStore = useBrainStateStore()

  /** 是否正在录音 */
  const isRecording = ref(false)
  /** 音频上下文 */
  let audioContext: AudioContext | null = null
  /** 媒体流 */
  let mediaStream: MediaStream | null = null
  /** 音频处理器 */
  let processor: ScriptProcessorNode | null = null
  /** 音频数据块 */
  let audioChunks: Float32Array[] = []
  /** 静音开始时间 */
  let silenceStart: number | null = null
  /** 语音开始时间 */
  let speechStart: number | null = null
  /** 是否检测到语音 */
  let isSpeakingDetected = false

  /**
   * 开始录音
   * @param onResult - 语音识别结果回调（接收音频 Blob）
   * @param onVADInterrupt - VAD打断回调
   */
  async function startListening(
    onResult: (blob: Blob) => void,
    onVADInterrupt?: () => void
  ) {
    try {
      audioContext = new AudioContext()
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const source = audioContext.createMediaStreamSource(mediaStream)
      processor = audioContext.createScriptProcessor(4096, 1, 1)

      isRecording.value = true
      appStore.isListening = true
      appStore.setMode('listening')
      brainStore.transition('listen')

      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0)
        const volume = getVolume(data)

        // VAD 打断：检测到用户说话时停止当前播放
        if (appStore.isPlaying && volume > 0.025) {
          onVADInterrupt?.()
        }

        if (volume > VAD_THRESHOLD) {
          if (!isSpeakingDetected) {
            isSpeakingDetected = true
            speechStart = Date.now()
            audioChunks = []
          }
          silenceStart = null
          audioChunks.push(new Float32Array(data))
        } else if (isSpeakingDetected) {
          if (!silenceStart) silenceStart = Date.now()
          audioChunks.push(new Float32Array(data))

          // 静音超时，停止录音
          if (silenceStart && Date.now() - silenceStart > SILENCE_TIMEOUT) {
            const speechDuration = Date.now() - (speechStart || Date.now())
            if (speechDuration >= MIN_SPEECH_LENGTH) {
              // 有效语音，发送识别
              stopListening()
              const blob = encodeWAV(audioChunks, audioContext.sampleRate)
              onResult(blob)
            } else {
              // 太短，视为噪音，重置
              resetVADState()
            }
          }
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)
    } catch (e) {
      console.error('[语音输入] 启动失败:', e)
      isRecording.value = false
      appStore.isListening = false
    }
  }

  /**
   * 停止录音
   */
  function stopListening() {
    if (processor) {
      processor.disconnect()
      processor = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop())
      mediaStream = null
    }
    if (audioContext) {
      audioContext.close().catch(() => {})
      audioContext = null
    }

    isRecording.value = false
    appStore.isListening = false
    resetVADState()
  }

  /**
   * 重置 VAD 状态
   */
  function resetVADState() {
    audioChunks = []
    silenceStart = null
    speechStart = null
    isSpeakingDetected = false
  }

  // 组件卸载时清理
  onUnmounted(() => {
    stopListening()
  })

  return {
    /** 是否正在录音 */
    isRecording,
    /** 开始录音 */
    startListening,
    /** 停止录音 */
    stopListening
  }
}

/**
 * 将音频数据块编码为 WAV 格式
 * @param chunks - 音频数据块数组
 * @param sampleRate - 采样率
 * @returns WAV 格式的 Blob
 */
function encodeWAV(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((acc, c) => acc + c.length, 0)
  const combined = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }

  const buffer = new ArrayBuffer(44 + combined.length * 2)
  const view = new DataView(buffer)

  // WAV 文件头
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + combined.length * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, combined.length * 2, true)

  // 写入 PCM 数据
  let pos = 44
  for (let i = 0; i < combined.length; i++) {
    const s = Math.max(-1, Math.min(1, combined[i]))
    view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    pos += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * 向 DataView 写入字符串
 * @param view - DataView 实例
 * @param offset - 偏移量
 * @param str - 要写入的字符串
 */
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
