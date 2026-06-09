/**
 * @file useLive2D.ts
 * @description Live2D 模型管理组合式函数 - 管理模型加载、表情循环和唇形同步
 * @module composables/useLive2D
 * @version 2.0.0
 * @date 2026-06-06
 *
 * 资源路径说明：
 *   - Live2D 模型资源位于 public/live2d/ 目录，由 Vite/Nginx 直接提供静态服务
 *   - 旧路径 /Neuro_Live2D_Module/ 已废弃，后端不再托管前端资源
 *   - 目录结构：public/live2d/Character/Neuro/hiyori_pro_zh/runtime/ (模型文件)
 *               public/live2d/assets/live2d_core/ (Live2D SDK)
 *               public/live2d/assets/sounds/ (音效)
 */

import { ref, onUnmounted } from 'vue'
import type { ExpressionPreset } from '../types'

/**
 * Live2D 模型资源目录
 * 对应前端 public/live2d/ 目录，Vite 会将 public/ 映射到根路径 /
 * 模型文件结构：live2d/Character/Neuro/hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json
 */
const MODEL_DIR = 'live2d/Character/Neuro/hiyori_pro_zh/runtime/'

/**
 * Live2D 模型配置文件名
 * model3.json 包含模型的所有资源引用（纹理、动作、物理等）
 */
const MODEL_FILE = 'hiyori_pro_t11.model3.json'

/** Live2D 模型实例类型 */
interface Live2DModel {
  width: number
  height: number
  scale: { set(s: number): void }
  anchor: { set(x: number, y: number): void }
  x: number
  y: number
  motion(group: string): void
  internalModel: {
    coreModel: {
      _model: {
        parameters: {
          ids: string[]
          values: Float32Array | number[]
        }
      }
    }
    motionManager: {
      update(model: unknown, now: number): boolean
    }
  }
}

/** PIXI Application 类型 */
interface PIXIApp {
  renderer: { resize(w: number, h: number): void }
  stage: { addChild(model: Live2DModel): void }
  destroy(): void
}

/**
 * Live2D 组合式函数
 * 管理 Live2D 模型加载、表情循环、唇形同步等
 * @param canvasRef - Canvas 元素的 ref
 * @returns Live2D 控制方法和状态
 */
export function useLive2D(canvasRef: Ref<HTMLCanvasElement | null>) {
  /** 是否已加载 */
  const loaded = ref(false)
  /** Live2D 模型实例 */
  let live2dModel: Live2DModel | null = null
  /** PIXI 应用实例 */
  let pixiApp: PIXIApp | null = null
  /** 空闲动作定时器 */
  let idleInterval: ReturnType<typeof setInterval> | null = null
  /** 唇形同步是否激活 */
  let lipSyncActive = false
  /** PCM 音量 */
  let pcmVolume = 0
  /** 当前表情预设 */
  let currentPreset: ExpressionPreset = {}
  /** ResizeObserver 实例 */
  let resizeObserver: ResizeObserver | null = null

  /**
   * 初始化 Live2D 模型
   */
  async function init() {
    const canvas = canvasRef.value
    if (!canvas) return

    // 检查依赖是否可用（PIXI + Live2D SDK）
    const win = window as unknown as {
      PIXI?: { Application: new (opts: unknown) => PIXIApp; live2d?: { Live2DModel: { from(url: string, opts: unknown): Promise<Live2DModel> } } }
    }

    if (!win.PIXI?.live2d?.Live2DModel) {
      console.warn('[Live2D] PIXI Live2D 依赖未加载，使用 fallback 头像')
      return
    }

    const wrapper = canvas.parentElement
    if (!wrapper) return

    try {
      pixiApp = new win.PIXI.Application({
        view: canvas,
        autoStart: true,
        transparent: true,
        backgroundAlpha: 0
      })

      const model = await win.PIXI.live2d.Live2DModel.from(MODEL_DIR + MODEL_FILE, {
        autoInteract: false
      })

      live2dModel = model
      const origW = model.width
      const origH = model.height

      /** 重新定位模型 */
      function repositionModel() {
        const w = wrapper!.clientWidth
        const h = wrapper!.clientHeight
        if (w <= 0 || h <= 0) return
        pixiApp!.renderer.resize(w, h)

        const scaleX = w / origW
        const scaleY = h / origH
        const scale = Math.min(scaleX, scaleY) * 2.1
        model.scale.set(scale)
        model.anchor.set(0.5, 0.5)
        model.x = w / 2
        model.y = h / 2 + h * 0.06
      }

      repositionModel()
      pixiApp.stage.addChild(model)

      // 监听容器大小变化
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => repositionModel())
        resizeObserver.observe(wrapper)
      }

      // 启动表情循环
      startExpressionLoop()

      // 空闲动作
      idleInterval = setInterval(() => {
        if (live2dModel) {
          model.motion('Idle')
        }
      }, 8000)

      loaded.value = true
    } catch (err) {
      console.error('[Live2D] 加载失败:', err)
    }
  }

  /**
   * 启动表情+唇形同步循环
   */
  function startExpressionLoop() {
    if (!live2dModel) return

    try {
      const internalModel = live2dModel.internalModel
      const origUpdate = internalModel.motionManager.update.bind(internalModel.motionManager)

      internalModel.motionManager.update = function (model: unknown, now: number) {
        origUpdate(model, now)

        try {
          const params = (model as Live2DModel).internalModel.coreModel._model.parameters

          // 应用表情预设
          for (const [paramId, value] of Object.entries(currentPreset)) {
            const idx = params.ids.indexOf(paramId)
            if (idx >= 0) {
              params.values[idx] = value
            }
          }

          // 唇形同步
          if (lipSyncActive) {
            const idx = params.ids.indexOf('ParamMouthOpenY')
            if (idx >= 0) {
              const target = Math.min(1.0, pcmVolume * 6)
              const current = params.values[idx] || 0
              params.values[idx] = current + (target - current) * 0.6
            }
          }
        } catch {
          // 忽略参数访问错误
        }
      }
    } catch (e) {
      console.error('[表情] 启动失败:', e)
    }
  }

  /**
   * 设置当前表情预设
   * @param preset - 表情预设参数
   */
  function setPreset(preset: ExpressionPreset) {
    currentPreset = preset
  }

  /**
   * 开始 PCM 唇形同步
   * @param volume - 当前 PCM 音量
   */
  function startLipSyncFromPCM(volume: number) {
    lipSyncActive = true
    pcmVolume = volume
  }

  /**
   * 停止唇形同步
   */
  function stopLipSync() {
    lipSyncActive = false
    pcmVolume = 0

    if (live2dModel) {
      try {
        const params = live2dModel.internalModel.coreModel._model.parameters
        const idx = params.ids.indexOf('ParamMouthOpenY')
        if (idx >= 0) params.values[idx] = 0
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 触发说话动作
   */
  function triggerSpeaking() {
    live2dModel?.motion('Tap')
  }

  /**
   * 销毁 Live2D 实例，释放资源
   */
  function destroy() {
    if (idleInterval) {
      clearInterval(idleInterval)
      idleInterval = null
    }
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (pixiApp) {
      pixiApp.destroy()
      pixiApp = null
    }
    live2dModel = null
    loaded.value = false
  }

  // 组件卸载时清理
  onUnmounted(() => {
    destroy()
  })

  return {
    /** 是否已加载 */
    loaded,
    /** 初始化 Live2D */
    init,
    /** 设置表情预设 */
    setPreset,
    /** 开始 PCM 唇形同步 */
    startLipSyncFromPCM,
    /** 停止唇形同步 */
    stopLipSync,
    /** 触发说话动作 */
    triggerSpeaking,
    /** 销毁 Live2D */
    destroy
  }
}

/** Vue Ref 类型简写 */
type Ref<T> = import('vue').Ref<T>
