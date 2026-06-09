<!--
 * @file 记忆面板
 * @description 小梦的记忆面板，展示学习到的用户信息，支持关闭
 * @module components/common/MemoryPanel
 * @version 1.1.0
 * @date 2026-06-09
 -->

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">
            <i class="fas fa-brain"></i>
            <span>小梦的记忆</span>
          </div>
          <button class="modal-close" @click="handleClose">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <!-- 加载状态 -->
          <div v-if="loading" class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">正在加载记忆...</div>
          </div>

          <!-- 空状态 -->
          <div v-else-if="memories.length === 0" class="empty-state">
            <div class="empty-icon">🧠</div>
            <div class="empty-text">还没有学习到记忆</div>
            <div class="empty-hint">和小梦多聊聊，小梦会记住你的~</div>
          </div>

          <!-- 记忆列表 -->
          <div v-else class="memory-list">
            <div v-for="mem in memories" :key="mem.id" class="memory-item">
              <div class="memory-header">
                <span class="memory-icon">{{ mem.icon || '📝' }}</span>
                <span class="memory-label">{{ mem.label }}</span>
              </div>
              <div class="memory-value">{{ mem.value }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

// ============================================================
// 类型定义
// ============================================================

/** 记忆数据结构 */
interface Memory {
  id: string
  label: string
  value: string
  icon?: string
  type?: string
}

// ============================================================
// 组件属性与事件
// ============================================================

/** 组件属性 - 控制弹窗显示 */
const props = defineProps<{ visible: boolean }>()
/** 组件事件 - 通知父组件关闭 */
const emit = defineEmits<{ (e: 'close'): void }>()

// ============================================================
// 响应式数据
// ============================================================

/** 记忆列表数据 */
const memories = ref<Memory[]>([])

/** 加载状态 */
const loading = ref(false)

// ============================================================
// 事件处理
// ============================================================

/**
 * 关闭弹窗
 * 触发 close 事件通知父组件关闭
 */
function handleClose() {
  emit('close')
}

// ============================================================
// 数据加载
// ============================================================

/**
 * 从后端加载记忆数据
 * 使用 /api/memory/recall 接口获取记忆召回列表
 */
async function loadMemories() {
  loading.value = true

  try {
    const response = await fetch('/api/memory/recall')

    if (response.ok) {
      const data = await response.json()

      if (data.success && data.recallItems) {
        // 将召回数据转换为记忆列表格式
        memories.value = data.recallItems.map((item: any, index: number) => ({
          id: `mem_${index}`,
          label: item.title,
          value: item.content,
          icon: item.icon,
          type: item.type
        }))
      }
    }
  } catch (error) {
    console.error('[MemoryPanel] 加载记忆失败:', error)
    // 失败时显示空状态
    memories.value = []
  } finally {
    loading.value = false
  }
}

// ============================================================
// 生命周期
// ============================================================

// 弹窗显示时自动加载数据
watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadMemories()
  }
})

// 组件挂载时若已可见，立即加载数据
onMounted(() => {
  if (props.visible) {
    loadMemories()
  }
})
</script>

<style scoped>
/* ============================================================
   弹窗基础样式
   ============================================================ */

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(24, 23, 21, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlayFade 0.2s ease;
}

@keyframes overlayFade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background: var(--surface-canvas);
  border-radius: var(--radius-xl);
  width: 90%;
  max-width: 520px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(24, 23, 21, 0.2);
  animation: modalEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  display: flex;
  flex-direction: column;
}

@keyframes modalEnter {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp-lg) var(--sp-xl);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: var(--sp-xs);
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.3px;
  color: var(--text-primary);
}

.modal-title i {
  color: var(--accent-coral);
}

.modal-close {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--surface-card);
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

.modal-body {
  padding: var(--sp-xl);
  overflow-y: auto;
  flex: 1;
}

/* ============================================================
   加载状态
   ============================================================ */

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--sp-xxl) 0;
  text-align: center;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-coral);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: var(--sp-md);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: var(--text-dim);
}

/* ============================================================
   空状态
   ============================================================ */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--sp-xxl) 0;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: var(--sp-md);
  opacity: 0.4;
}

.empty-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 13px;
  color: var(--text-dim);
}

/* ============================================================
   记忆列表
   ============================================================ */

.memory-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-md);
}

.memory-item {
  display: flex;
  flex-direction: column;
  gap: var(--sp-xs);
  padding: var(--sp-md);
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.memory-item:hover {
  border-color: var(--accent-amber);
  transform: translateY(-1px);
}

.memory-header {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
}

.memory-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.memory-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.memory-value {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}
</style>