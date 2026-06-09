/**
 * @file 可拖拽分隔条组件
 * @description 闲聊区与工作区之间的可拖拽分隔条，支持拖拽调整两个区域的宽度占比，
 *              包含拖拽手柄动画和视觉反馈效果
 * @module components/work/DragDivider
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

<template>
  <div
    :class="['drag-divider', { dragging: isDragging, 'panel-collapsed': isCollapsed }]"
    @mousedown="handleMouseDown"
  >
    <!-- 分隔线视觉元素 -->
    <div class="divider-line">
      <!-- 拖拽手柄 -->
      <div class="divider-handle">
        <span class="handle-dot"></span>
        <span class="handle-dot"></span>
        <span class="handle-dot"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 可拖拽分隔条组件
 * 通过鼠标拖拽调整闲聊区与工作区的宽度比例
 */
import { ref, computed } from 'vue'
import { useWorkerStore } from '../../stores/worker'

// ============================================================
// 常量定义
// ============================================================

/** 侧边栏宽度（px），用于计算鼠标相对于主内容区域的偏移 */
const SIDEBAR_WIDTH = 400

// ============================================================
// 组件定义
// ============================================================

/** 组件属性定义 */
const props = defineProps<{
  /** 容器总宽度（px），用于计算占比 */
  containerWidth: number
}>()

/** 工作区状态管理 */
const workerStore = useWorkerStore()

/** 是否正在拖拽 */
const isDragging = ref(false)

/** 工作区面板是否折叠 */
const isCollapsed = computed(() => !workerStore.isExpanded)

/**
 * 处理鼠标按下事件，开始拖拽
 * @param event - 鼠标事件
 * @returns {void}
 */
function handleMouseDown(event: MouseEvent) {
  // 面板折叠时不可拖拽
  if (isCollapsed.value) return

  event.preventDefault()
  isDragging.value = true

  // 添加全局鼠标事件监听，确保拖拽时鼠标移出分隔条也能继续响应
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)

  // 拖拽时改变光标样式
  document.body.style.cursor = 'col-resize'
  // 防止拖拽时选中文字
  document.body.style.userSelect = 'none'
}

/**
 * 处理鼠标移动事件，实时更新区域宽度占比
 * @param event - 鼠标事件
 * @returns {void}
 */
function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value || !props.containerWidth) return

  // containerWidth 已经是主内容区域宽度（= 总宽 - 侧边栏400px）
  // 不需要再减去侧边栏宽度
  const availableWidth = props.containerWidth

  // 鼠标位置相对于主内容区域起始位置的偏移
  // 侧边栏宽度400px是主内容区域的起始位置
  const relativeX = event.clientX - SIDEBAR_WIDTH

  // 计算闲聊区占比
  const ratio = relativeX / availableWidth

  // 更新 store 中的占比（store 内部会做 0.3~0.7 的范围限制）
  workerStore.setChatRatio(ratio)
}

/**
 * 处理鼠标释放事件，结束拖拽
 * @returns {void}
 */
function handleMouseUp() {
  isDragging.value = false

  // 移除全局事件监听
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)

  // 恢复光标和选择样式
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}
</script>

<style scoped>
/* ============================================================
 * 分隔条容器样式
 * ============================================================ */
.drag-divider {
  width: 12px;
  min-width: 12px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  position: relative;
  z-index: 10;
  transition: background var(--transition-fast);
}

/* 悬停时显示高亮背景 */
.drag-divider:hover {
  background: rgba(204, 120, 92, 0.06);
}

/* 拖拽中的高亮背景 */
.drag-divider.dragging {
  background: rgba(204, 120, 92, 0.12);
}

/* 面板折叠时隐藏分隔条交互 */
.drag-divider.panel-collapsed {
  cursor: default;
  width: 0;
  min-width: 0;
  overflow: hidden;
}

/* ============================================================
 * 分隔线样式
 * ============================================================ */
.divider-line {
  width: 2px;
  height: 100%;
  background: var(--border-soft);
  position: relative;
  transition: background var(--transition-fast), width var(--transition-fast);
}

.drag-divider:hover .divider-line,
.drag-divider.dragging .divider-line {
  background: var(--accent-coral);
  width: 3px;
}

/* ============================================================
 * 拖拽手柄样式
 * ============================================================ */
.divider-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 4px;
  border-radius: var(--radius-full);
  background: var(--surface-canvas);
  border: 1px solid var(--border-color);
  transition: all var(--transition-fast);
  /* 扩大点击区域 */
  margin: -10px;
  padding: 10px 6px;
}

.drag-divider:hover .divider-handle,
.drag-divider.dragging .divider-handle {
  background: var(--accent-coral);
  border-color: var(--accent-coral);
}

/* 手柄圆点 */
.handle-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: background var(--transition-fast);
}

.drag-divider:hover .handle-dot,
.drag-divider.dragging .handle-dot {
  background: white;
}

/* 拖拽中手柄缩放动画 */
.drag-divider.dragging .divider-handle {
  transform: translate(-50%, -50%) scale(1.1);
}
</style>
