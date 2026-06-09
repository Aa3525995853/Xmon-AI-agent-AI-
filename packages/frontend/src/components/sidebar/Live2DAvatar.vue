/**
 * @file Live2D头像
 * @description Live2D 头像组件，加载和管理 Live2D 模型
 * @module components/sidebar/Live2DAvatar
 */

<template>
  <div class="live2d-wrapper">
    <canvas ref="canvasRef" class="live2d-canvas"></canvas>
    <div v-if="!loaded" class="avatar-fallback">🌙</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue' // 导入Vue响应式API和生命周期钩子
import { useLive2D } from '../../composables/useLive2D' // 导入Live2D composable

/** Canvas元素引用 */
const canvasRef = ref<HTMLCanvasElement | null>(null)
/** 使用useLive2D composable，获取加载状态和初始化函数 */
const { loaded, init } = useLive2D(canvasRef)

/** 组件挂载时初始化Live2D */
onMounted(() => {
  init() // 调用初始化函数
})
</script>

<style scoped>
.live2d-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.live2d-canvas {
  width: 100%;
  height: 100%;
}

.avatar-fallback {
  font-size: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
