/**
 * @file 音频播放
 * @description 从旧版HTML的 PCMAudioPlayer 类提取，管理 PCM 音频流播放和 TTS 合成播放
 * @module composables/useAudioPlayer
 */

import { ref, onUnmounted } from 'vue'

/**
 * PCM 音频播放器
 * 支持流式推送 PCM 数据并自动调度播放
 */
class PCMAudioPlayer {
  private sampleRate: number
  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private audioQueue: { arrayBuffer: ArrayBuffer; index: number }[] = []
  private activeSources: AudioBufferSourceNode[] = []
  private currentIndex = 0
  private nextIndex = 0
  private firstPlay = true
  private pcmPushFinish = false
  private scheduledRanges: { start: number; end: number }[] = []
  private _destroyed = false

  /** 播放结束回调 */
  onEndedCallback: (() => void) | null = null
  /** 播放开始回调 */
  onStartCallback: (() => void) | null = null

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate
  }

  /**
   * 确保音频上下文已创建
   * @returns 音频上下文或null
   */
  ensureContext(): AudioContext | null {
    if (this._destroyed) return null
    if (!this.audioContext) {
      try {
        this.audioContext = new AudioContext({ sampleRate: this.sampleRate })
      } catch {
        this.audioContext = new AudioContext()
      }
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.gainNode = this.audioContext.createGain()
      this.analyser.connect(this.gainNode)
      this.gainNode.connect(this.audioContext.destination)
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
    return this.audioContext
  }

  /**
   * 推送 PCM 数据
   * @param arrayBuffer - PCM 音频数据
   * @param index - 数据序号
   */
  pushPCM(arrayBuffer: ArrayBuffer, index: number) {
    this.audioQueue.push({ arrayBuffer, index })
    this._scheduleQueued()
  }

  /**
   * 标记 PCM 数据推送完成
   */
  finish() {
    this.pcmPushFinish = true
    this._scheduleQueued()
  }

  /**
   * 获取当前音量
   * @returns 音量值 (0-1)
   */
  getCurrentVolume(): number {
    if (!this.analyser) return 0
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i]
    return sum / (data.length * 255)
  }

  /**
   * 销毁播放器，释放资源
   */
  destroy() {
    this._destroyed = true
    for (const src of this.activeSources) {
      try { src.stop() } catch { /* 忽略 */ }
    }
    this.activeSources = []
    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
    this.gainNode = null
    this.analyser = null
  }

  /**
   * 合并同一序号的 PCM 数据
   */
  private getCombinedBuffer(targetIndex: number): Uint8Array | null {
    const items = this.audioQueue.filter(item => item.index === targetIndex)
    if (items.length === 0) return null

    items.sort((a, b) => a.index - b.index)
    const totalLength = items.reduce((acc, item) => acc + item.arrayBuffer.byteLength, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const item of items) {
      combined.set(new Uint8Array(item.arrayBuffer), offset)
      offset += item.arrayBuffer.byteLength
    }
    this.audioQueue = this.audioQueue.filter(item => item.index !== targetIndex)
    return combined
  }

  /**
   * 将 PCM 数据转换为 AudioBuffer
   */
  private _pcmToAudioBuffer(pcmData: Uint8Array): AudioBuffer | null {
    const ctx = this.audioContext
    if (!ctx) return null

    const byteLength = pcmData.byteLength - (pcmData.byteLength % 2)
    if (byteLength <= 0) return null

    const srcLength = byteLength / 2
    const srcBuffer = pcmData.buffer.slice(pcmData.byteOffset, pcmData.byteOffset + byteLength)
    const int16Array = new Int16Array(srcBuffer, 0, srcLength)
    const dstRate = ctx.sampleRate
    const srcRate = this.sampleRate
    const needResample = dstRate !== srcRate
    const ratio = dstRate / srcRate
    const outputLength = needResample ? Math.round(srcLength * ratio) : srcLength
    const audioBuffer = ctx.createBuffer(1, outputLength, dstRate)
    const channelData = audioBuffer.getChannelData(0)

    if (needResample) {
      for (let i = 0; i < outputLength; i++) {
        const srcIndex = i * (srcRate / dstRate)
        const srcIndexInt = Math.floor(srcIndex)
        const srcIndexFrac = srcIndex - srcIndexInt
        if (srcIndexInt >= srcLength - 1) {
          channelData[i] = int16Array[srcLength - 1] / 32768
        } else {
          const s1 = int16Array[srcIndexInt] / 32768
          const s2 = int16Array[srcIndexInt + 1] / 32768
          channelData[i] = Math.max(-1, Math.min(1, s1 + (s2 - s1) * srcIndexFrac))
        }
      }
    } else {
      for (let i = 0; i < srcLength; i++) {
        channelData[i] = Math.max(-1, Math.min(1, int16Array[i] / 32768))
      }
    }

    return audioBuffer
  }

  /**
   * 调度队列中的 PCM 数据播放
   */
  private _scheduleQueued() {
    if (this._destroyed) return
    const ctx = this.ensureContext()
    if (!ctx) return

    while (true) {
      const combined = this.getCombinedBuffer(this.currentIndex)
      if (!combined) break

      const audioBuffer = this._pcmToAudioBuffer(combined)
      if (!audioBuffer) {
        this.currentIndex++
        continue
      }

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.analyser!)
      this.activeSources.push(source)

      const startTime = this.firstPlay ? ctx.currentTime + 0.05 : this._getNextStartTime(ctx)
      source.start(startTime)

      if (this.firstPlay) {
        this.firstPlay = false
        this.onStartCallback?.()
      }

      this.scheduledRanges.push({ start: startTime, end: startTime + audioBuffer.duration })

      source.onended = () => {
        const idx = this.activeSources.indexOf(source)
        if (idx !== -1) this.activeSources.splice(idx, 1)

        if (this.pcmPushFinish && this.activeSources.length === 0 && this.audioQueue.length === 0) {
          this.onEndedCallback?.()
        }
      }

      this.currentIndex++
    }

    // 所有数据已推送且播放完毕
    if (this.pcmPushFinish && this.activeSources.length === 0 && this.audioQueue.length === 0) {
      this.onEndedCallback?.()
    }
  }

  /**
   * 获取下一个可用的播放开始时间
   */
  private _getNextStartTime(ctx: AudioContext): number {
    if (this.scheduledRanges.length === 0) return ctx.currentTime
    const lastEnd = this.scheduledRanges[this.scheduledRanges.length - 1].end
    return Math.max(ctx.currentTime, lastEnd)
  }
}

/**
 * 音频播放组合式函数
 * 管理 PCM 流式播放和 TTS 合成播放
 * @returns 音频播放控制方法和状态
 */
export function useAudioPlayer() {
  /** 当前播放器实例 */
  const player = ref<PCMAudioPlayer | null>(null)
  /** 是否正在播放 */
  const isPlaying = ref(false)

  /**
   * 创建新的 PCM 播放器
   * @param sampleRate - 采样率
   * @returns 播放器实例
   */
  function createPlayer(sampleRate = 24000): PCMAudioPlayer {
    // 销毁旧播放器
    if (player.value) {
      player.value.destroy()
    }

    const newPlayer = new PCMAudioPlayer(sampleRate)
    newPlayer.onStartCallback = () => {
      isPlaying.value = true
    }
    newPlayer.onEndedCallback = () => {
      isPlaying.value = false
      player.value = null
    }
    player.value = newPlayer
    return newPlayer
  }

  /**
   * 合成并播放 TTS 音频
   * @param text - 要合成的文本
   * @param emotion - 情绪标签
   */
  async function synthesizeAndPlay(text: string, emotion = 'happy') {
    try {
      const response = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, emotion, speech_rate: 0.95, volume: 0.8 })
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = () => URL.revokeObjectURL(url)
        isPlaying.value = true
        audio.onended = () => {
          isPlaying.value = false
          URL.revokeObjectURL(url)
        }
        await audio.play()
      }
    } catch (e) {
      console.warn('[TTS] 播报失败:', (e as Error).message)
    }
  }

  /**
   * 停止当前播放
   */
  function stop() {
    if (player.value) {
      player.value.destroy()
      player.value = null
    }
    isPlaying.value = false
  }

  // 组件卸载时清理
  onUnmounted(() => {
    stop()
  })

  return {
    /** 当前播放器实例 */
    player,
    /** 是否正在播放 */
    isPlaying,
    /** 创建新播放器 */
    createPlayer,
    /** 合成并播放 TTS */
    synthesizeAndPlay,
    /** 停止播放 */
    stop
  }
}
