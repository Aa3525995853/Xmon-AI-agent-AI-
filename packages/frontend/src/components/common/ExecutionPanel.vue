/**
 * @file 执行面板
 * @description 任务执行状态面板，展示任务步骤进度和执行详情
 * @module components/common/ExecutionPanel
 */

<template>
  <div v-if="visible" class="execution-panel">
    <div class="panel-header">
      <span class="panel-title">⚡ 执行中</span>
      <span class="panel-progress">{{ currentStep }}/{{ totalSteps }}</span>
      <button class="panel-close" @click="visible = false">✕</button>
    </div>

    <!-- 进度条 -->
    <div class="progress-bar">
      <div
        class="progress-fill"
        :style="{ width: progressPercent + '%' }"
      ></div>
    </div>

    <!-- 步骤列表 -->
    <div class="steps-list">
      <div
        v-for="(step, index) in steps"
        :key="index"
        :class="['step-item', step.status]"
      >
        <span class="step-icon">{{ stepIcon(step.status) }}</span>
        <span class="step-action">{{ step.action || step.desc || `步骤 ${index + 1}` }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue' // 导入Vue响应式API
import type { TaskStep } from '../../types' // 导入任务步骤类型

/** 执行面板是否可见 */
const visible = ref(false)
/** 当前步骤序号 */
const currentStep = ref(0)
/** 总步骤数 */
const totalSteps = ref(0)
/** 步骤列表 */
const steps = ref<TaskStep[]>([])

/** 计算进度百分比 */
const progressPercent = computed(() => {
  if (totalSteps.value === 0) return 0 // 总步数为0时返回0
  return Math.round((currentStep.value / totalSteps.value) * 100) // 计算百分比并取整
})

/**
 * 根据步骤状态获取对应的图标
 * @param status - 步骤状态
 * @returns 图标emoji字符串
 */
function stepIcon(status: string): string {
  const icons: Record<string, string> = { // 状态到图标的映射
    starting: '⏳', // 启动中
    running: '⚡', // 执行中
    completed: '✅', // 已完成
    asking: '❓', // 询问中
    thinking: '💭' // 思考中
  }
  return icons[status] || '○' // 返回对应图标或默认圆圈
}

/**
 * 显示执行面板
 * @param taskId - 任务ID（暂未使用）
 * @param command - 执行命令（暂未使用）
 * @param taskSteps - 任务步骤列表
 */
function show(taskId: string, command: string, taskSteps: TaskStep[]) {
  steps.value = taskSteps // 保存步骤列表
  totalSteps.value = taskSteps.length // 设置总步骤数
  currentStep.value = 0 // 重置当前步骤
  visible.value = true // 显示面板
}

/**
 * 更新步骤进度
 * @param progress - 进度信息对象
 */
function updateProgress(progress: { current: number; total: number }) {
  currentStep.value = progress.current // 更新当前步骤
  totalSteps.value = progress.total // 更新总步骤数
}

/**
 * 隐藏执行面板
 */
function hide() {
  visible.value = false // 隐藏面板
}

/** 暴露给父组件的方法 */
defineExpose({ show, updateProgress, hide })
</script>

<style scoped>
.execution-panel {
  background: var(--surface-canvas);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--sp-md);
  margin: var(--sp-sm) 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  margin-bottom: var(--sp-sm);
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-progress {
  font-size: 12px;
  color: var(--text-dim);
  margin-left: auto;
}

.panel-close {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--text-dim);
  cursor: pointer;
  padding: 2px;
}

.progress-bar {
  height: 3px;
  background: var(--border-soft);
  border-radius: var(--radius-full);
  margin-bottom: var(--sp-sm);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-amber);
  border-radius: var(--radius-full);
  transition: width var(--transition-normal);
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-xs);
}

.step-item {
  display: flex;
  align-items: center;
  gap: var(--sp-xs);
  font-size: 13px;
  padding: 2px 0;
}

.step-item.completed {
  color: var(--text-dim);
}

.step-item.running {
  color: var(--accent-amber);
  font-weight: 500;
}

.step-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.step-action {
  flex: 1;
}
</style>
