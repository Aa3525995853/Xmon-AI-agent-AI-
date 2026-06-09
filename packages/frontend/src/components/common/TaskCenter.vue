/**
 * @file 任务中心
 * @description 任务中心弹窗，展示复杂任务的待办进展、任务产物（生成文件）、
 *              参考信息（调用的技能和参考网页），支持关闭弹窗
 * @module components/common/TaskCenter
 * @version 2.0.0
 * @date 2026-06-08
 */

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">
            <i class="fas fa-tasks"></i>
            <span>任务中心</span>
          </div>
          <button class="modal-close" @click="handleClose">✕</button>
        </div>
        <div class="modal-body">
          <!-- ============================================================ -->
          <!-- 分区一：当前任务 -->
          <!-- ============================================================ -->
          <div class="section">
            <div class="section-header">
              <span class="section-title">当前任务</span>
            </div>
            <div class="section-body">
              <div v-if="currentTask" class="current-task">
                <div class="task-name">{{ currentTask.name }}</div>
                <div v-if="currentTask.status" class="task-status" :class="currentTask.status">
                  {{ statusText(currentTask.status) }}
                </div>
              </div>
              <div v-else class="empty-state small">
                <div class="empty-icon small">
                  <i class="fas fa-hourglass-half"></i>
                </div>
                <div class="empty-text">暂无执行中的任务</div>
                <div class="empty-hint">发送任务后，这里会显示执行状态</div>
              </div>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- 分区：任务产物 -->
          <!-- ============================================================ -->
          <div class="section">
            <div class="section-header">
              <span class="section-title">任务产物</span>
            </div>
            <div class="section-body">
              <div v-if="artifacts.length === 0" class="empty-state">
                <div class="empty-icon">
                  <i class="fas fa-cube"></i>
                </div>
                <div class="empty-text">暂产物</div>
                <div class="empty-hint">任务完成后，生成的文件将展示在这里</div>
              </div>
              <div v-else class="artifact-list">
                <div
                  v-for="artifact in artifacts"
                  :key="artifact.id"
                  class="artifact-item"
                  @click="openArtifact(artifact)"
                >
                  <div class="artifact-icon">
                    <i :class="artifactIcon(artifact.type)"></i>
                  </div>
                  <div class="artifact-info">
                    <div class="artifact-name">{{ artifact.name }}</div>
                    <div class="artifact-meta">{{ artifact.size || artifact.type }}</div>
                  </div>
                  <div class="artifact-action">
                    <i class="fas fa-external-link-alt"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ============================================================ -->
          <!-- 分区：参考信息 -->
          <!-- ============================================================ -->
          <div class="section">
            <div class="section-header">
              <span class="section-title">参考信息</span>
            </div>
            <div class="section-body">
              <div v-if="references.length === 0" class="empty-state">
                <div class="empty-icon">
                  <i class="fas fa-file-alt"></i>
                </div>
                <div class="empty-text">暂无参考信息</div>
                <div class="empty-hint">任务执行过程中调用的技能和参考的网页将展示在这里</div>
              </div>
              <div v-else class="reference-list">
                <div
                  v-for="ref in references"
                  :key="ref.id"
                  class="reference-item"
                  @click="openReference(ref)"
                >
                  <div class="reference-icon">
                    <i :class="ref.icon || 'fas fa-link'"></i>
                  </div>
                  <div class="reference-info">
                    <div class="reference-name">{{ ref.name }}</div>
                    <div class="reference-desc">{{ ref.description || ref.url }}</div>
                  </div>
                  <div class="reference-action">
                    <i class="fas fa-external-link-alt"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

// ============================================================
// 类型定义
// ============================================================

/** 当前任务数据结构 */
interface CurrentTask {
  id: string
  name: string
  status?: 'pending' | 'running' | 'completed' | 'error'
}

/** 任务产物数据结构 */
interface Artifact {
  id: string
  name: string
  type: string
  url?: string
  path?: string
  size?: string
}

/** 参考信息数据结构 */
interface Reference {
  id: string
  name: string
  description?: string
  url?: string
  icon?: string
}

// ============================================================
// 组件属性与事件
// ============================================================

/** 组件属性 - 控制弹窗显示 */
const props = defineProps<{ visible: boolean }>()
/** 组件事件 */
const emit = defineEmits<{ (e: 'close'): void }>()

// ============================================================
// 响应式数据
// ============================================================

/** 当前任务 */
const currentTask = ref<CurrentTask | null>(null)
/** 任务产物列表 */
const artifacts = ref<Artifact[]>([])
/** 参考信息列表 */
const references = ref<Reference[]>([])

// ============================================================
// 事件处理函数
// ============================================================

/**
 * 关闭弹窗
 * 触发 close 事件通知父组件关闭
 */
function handleClose() {
  emit('close')
}

/**
 * 获取任务状态显示文本
 * @param status - 任务状态枚举值
 * @returns 状态对应的中文文本
 */
function statusText(status: string): string {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '执行中',
    completed: '已完成',
    error: '出错'
  }
  return map[status] || status
}

/**
 * 根据产物类型返回对应的图标类名
 * @param type - 产物类型（如 xlsx、png、pdf 等）
 * @returns FontAwesome 图标类名
 */
function artifactIcon(type: string): string {
  const map: Record<string, string> = {
    xlsx: 'fas fa-file-excel',
    csv: 'fas fa-file-csv',
    pdf: 'fas fa-file-pdf',
    png: 'fas fa-file-image',
    jpg: 'fas fa-file-image',
    jpeg: 'fas fa-file-image',
    docx: 'fas fa-file-word',
    txt: 'fas fa-file-alt',
    md: 'fas fa-file-alt',
    json: 'fas fa-file-code'
  }
  return map[type] || 'fas fa-file'
}

/**
 * 打开任务产物（文件或链接）
 * @param artifact - 任务产物对象
 */
function openArtifact(artifact: Artifact) {
  if (artifact.url) {
    window.open(artifact.url, '_blank')
  } else if (artifact.path) {
    // 本地文件通过后端 /api/system/open-file 接口打开
    fetch(`/api/system/open-file?path=${encodeURIComponent(artifact.path)}`)
  }
}

/**
 * 打开参考信息（网页链接）
 * @param ref - 参考信息对象
 */
function openReference(ref: Reference) {
  if (ref.url) {
    window.open(ref.url, '_blank')
  }
}

// ============================================================
// 数据加载
// ============================================================

/**
 * 从后端获取任务中心数据
 * 包括待办列表、任务产物、参考信息
 */
async function fetchTaskData() {
  try {
    // 并行获取任务和产物数据
    const [taskRes, artifactRes, refRes] = await Promise.all([
      fetch('/api/task/current').catch(() => null),
      fetch('/api/task/artifacts').catch(() => null),
      fetch('/api/task/references').catch(() => null)
    ])

    if (taskRes?.ok) {
      const data = await taskRes.json()
      if (data.success && data.task) {
        currentTask.value = data.task
      } else {
        currentTask.value = null
      }
    } else {
      currentTask.value = null
    }

    if (artifactRes?.ok) {
      const data = await artifactRes.json()
      if (data.success) {
        artifacts.value = data.artifacts || []
      }
    }

    if (refRes?.ok) {
      const data = await refRes.json()
      if (data.success) {
        references.value = data.references || []
      }
    }
  } catch (e: any) {
    console.error('[TaskCenter] 获取任务数据失败:', e)
  }
}

// 弹窗显示时自动加载数据
watch(() => props.visible, (newVal) => {
  if (newVal) {
    fetchTaskData()
  }
})

// 组件挂载时若已可见，立即加载数据
onMounted(() => {
  if (props.visible) {
    fetchTaskData()
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
   分区通用样式
   ============================================================ */

.section {
  margin-bottom: var(--sp-xl);
}

.section:last-child {
  margin-bottom: 0;
}

.section-header {
  margin-bottom: var(--sp-md);
}

.section-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
}

/* ============================================================
   空状态样式
   ============================================================ */

.empty-state {
  text-align: center;
  padding: var(--sp-xl) 0;
  color: var(--text-dim);
}

.empty-state.small {
  padding: var(--sp-md) 0;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto var(--sp-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-soft);
  border-radius: var(--radius-md);
  font-size: 20px;
  color: var(--text-dim);
}

.empty-icon.small {
  width: 32px;
  height: 32px;
  font-size: 14px;
  margin-bottom: var(--sp-sm);
}

.empty-icon i {
  font-size: 20px;
  color: var(--text-dim);
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}

/* ============================================================
   当前任务
   ============================================================ */

.current-task {
  padding: var(--sp-md);
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.task-name {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.task-status {
  font-size: 12px;
}

.task-status.pending {
  color: #e8a55a;
}

.task-status.running {
  color: #5db872;
}

.task-status.completed {
  color: var(--accent-green);
}

.task-status.error {
  color: #c64848;
}

/* ============================================================
   任务产物列表
   ============================================================ */

.artifact-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
}

.artifact-item {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: var(--sp-sm) var(--sp-md);
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.artifact-item:hover {
  background: var(--surface-cream);
  border-color: var(--accent-amber);
  transform: translateY(-1px);
}

.artifact-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-soft);
  border-radius: var(--radius-sm);
  font-size: 16px;
  color: var(--accent-coral);
  flex-shrink: 0;
}

.artifact-info {
  flex: 1;
  min-width: 0;
}

.artifact-name {
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artifact-meta {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 2px;
}

.artifact-action {
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
}

/* ============================================================
   参考信息列表
   ============================================================ */

.reference-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
}

.reference-item {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: var(--sp-sm) var(--sp-md);
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.reference-item:hover {
  background: var(--surface-cream);
  border-color: var(--accent-amber);
  transform: translateY(-1px);
}

.reference-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-soft);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--accent-teal);
  flex-shrink: 0;
}

.reference-info {
  flex: 1;
  min-width: 0;
}

.reference-name {
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reference-desc {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reference-action {
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
}
</style>
