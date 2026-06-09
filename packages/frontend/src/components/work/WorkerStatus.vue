/**
 * @file 小牛状态动画组件
 * @description 展示小牛（牛马）的当前状态，纯文字展示
 *              简洁轻量，状态图标+文字+微动画
 * @module components/work/WorkerStatus
 * @author xiaomeng
 * @version 14.0.0
 * @date 2026-06-06
 */

<template>
  <div :class="['worker-status', animation]">
    <!-- 状态图标 -->
    <div class="status-emoji">{{ statusConfig.icon }}</div>

    <!-- 状态文字 -->
    <div class="status-info">
      <span class="status-label">{{ statusConfig.label }}</span>
      <span class="status-desc" v-if="statusDesc">{{ statusDesc }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 小牛状态动画组件，纯文字展示
 */
import { computed } from 'vue'
import { useWorkerStore } from '../../stores/worker'

/** 工作区状态管理 */
const workerStore = useWorkerStore()

// ============================================================
// 计算属性
// ============================================================

/** 当前动画状态 */
const animation = computed(() => workerStore.workerAnimation)

/** 当前状态配置（图标+标签+颜色） */
const statusConfig = computed(() => workerStore.statusConfig)

/**
 * 状态描述文字
 * 根据当前动画状态映射对应的中文描述文案
 * @returns {string} 状态描述文字，无匹配时返回空字符串
 */
const statusDesc = computed(() => {
  const descMap: Record<string, string> = {
    sleep: '小牛正在休息...',
    stretch: '小牛开工了！',
    typing: '小牛正在努力干活...',
    headscratch: '小牛遇到问题了',
    celebrate: '小牛搞定了！',
    packup: '小牛正在收拾...',
    wave: '小牛下班啦~'
  }
  return descMap[animation.value] || ''
})
</script>

<style scoped>
/* ============================================================
 * 状态容器基础样式
 * ============================================================ */
.worker-status {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: var(--sp-md) var(--sp-lg);
  user-select: none;
}

/* ============================================================
 * 状态各元素样式
 * ============================================================ */
.status-emoji {
  font-size: 28px;
  line-height: 1;
  animation: emoji-bounce 2s ease-in-out infinite;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.status-desc {
  font-size: 12px;
  color: var(--text-dim);
}

/* ============================================================
 * 各状态对应的微动画
 * ============================================================ */
.worker-status.sleep .status-emoji {
  animation: emoji-breathe 3s ease-in-out infinite;
}

.worker-status.stretch .status-emoji {
  animation: emoji-pop 0.5s ease-out;
}

.worker-status.typing .status-emoji {
  animation: emoji-bob 0.5s ease-in-out infinite;
}

.worker-status.headscratch .status-emoji {
  animation: emoji-wobble 0.6s ease-in-out infinite;
}

.worker-status.celebrate .status-emoji {
  animation: emoji-jump 0.7s ease-in-out infinite;
}

/* ============================================================
 * 关键帧动画定义
 * ============================================================ */
@keyframes emoji-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

@keyframes emoji-breathe {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
}

@keyframes emoji-pop {
  0% { transform: scale(0.6); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

@keyframes emoji-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

@keyframes emoji-wobble {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-8deg); }
  75% { transform: rotate(8deg); }
}

@keyframes emoji-jump {
  0%, 100% { transform: translateY(0) scale(1); }
  40% { transform: translateY(-6px) scale(1.1); }
  60% { transform: translateY(-6px) scale(1.1); }
}
</style>
