/**
 * @file 历史记录
 * @description 历史记录弹窗，从后端会话API获取会话列表，支持会话切换、删除、新建
 *              实现会话隔离和历史可追溯
 * @module components/common/HistoryPanel
 * @version 2.0.0
 * @date 2026-06-08
 */

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
      <div class="modal-content history-panel">
        <div class="modal-header">
          <div class="modal-title">
            <i class="fas fa-clock-rotate-left"></i>
            <span>历史记录</span>
          </div>
          <button class="modal-close" @click="handleClose">✕</button>
        </div>
        <div class="modal-body">
          <!-- 加载状态 -->
          <div v-if="loading" class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">加载中...</div>
          </div>

          <!-- 错误状态 -->
          <div v-else-if="error" class="error-state">
            <div class="error-icon">⚠️</div>
            <div class="error-text">{{ error }}</div>
            <button class="btn btn-secondary" @click="fetchSessionList">重试</button>
          </div>

          <!-- 空状态 -->
          <div v-else-if="sessionList.length === 0" class="empty-state">
            <div class="empty-icon">📝</div>
            <div class="empty-text">暂无聊天记录</div>
            <div class="empty-hint">开始和小梦聊天，记录会自动保存</div>
          </div>

          <!-- 会话列表 -->
          <div v-else class="history-list">
            <div
              v-for="item in sessionList"
              :key="item.id"
              class="history-item"
              :class="{ active: item.id === currentSessionId }"
              @click="handleSelect(item.id)"
            >
              <div class="history-icon">{{ getSessionIcon(item) }}</div>
              <div class="history-info">
                <div class="history-title">{{ item.title }}</div>
                <div class="history-meta">
                  <span class="history-time">{{ formatTime(item.lastActiveAt) }}</span>
                  <span class="history-count">{{ item.messageCount }} 条消息</span>
                </div>
              </div>
              <button
                class="history-delete"
                @click.stop="handleDelete(item.id)"
                data-tooltip="删除"
              >
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="handleNewChat">
            <i class="fas fa-plus"></i>
            新对话
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useChatStore } from '../../stores/chat'

/** 组件属性 */
const props = defineProps<{ visible: boolean }>()
/** 组件事件 */
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', id: string): void
  (e: 'new'): void
}>()

/** 聊天状态 Store */
const chatStore = useChatStore()

/** 加载状态 */
const loading = ref(false)
/** 错误信息 */
const error = ref('')

/** 会话列表数据结构 */
interface SessionItem {
  id: string
  fullId: string
  title: string
  createdAt: number
  updatedAt: number
  lastActiveAt: number
  messageCount: number
  metadata: Record<string, any>
}

/** 会话列表 */
const sessionList = ref<SessionItem[]>([])
/** 当前活跃会话ID */
const currentSessionId = ref<string>('')

/**
 * 关闭弹窗
 */
function handleClose() {
  emit('close')
}

/**
 * 选择会话
 * @param id - 会话ID
 */
function handleSelect(id: string) {
  currentSessionId.value = id
  emit('select', id)
  handleClose()
}

/**
 * 删除会话
 * @param id - 要删除的会话ID
 */
async function handleDelete(id: string) {
  try {
    await chatStore.deleteSession(id)
    // 从列表中移除
    sessionList.value = sessionList.value.filter(item => item.id !== id)
  } catch (e) {
    console.error('[HistoryPanel] 删除会话失败:', e)
  }
}

/**
 * 开始新对话
 */
function handleNewChat() {
  emit('new')
  handleClose()
}

/**
 * 获取会话图标（根据消息数量和活跃度）
 * @param item - 会话项
 * @returns 图标字符串
 */
function getSessionIcon(item: SessionItem): string {
  if (item.messageCount === 0) return '💬'
  if (item.messageCount > 20) return '🔥'
  if (item.messageCount > 10) return '💬'
  return '🗨️'
}

/**
 * 格式化时间显示
 * @param timestamp - 时间戳
 * @returns 格式化后的时间字符串（如"刚刚"、"5分钟前"等）
 */
function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

  return date.toLocaleDateString('zh-CN')
}

/**
 * 从后端API获取会话列表
 * 过滤掉空会话（messageCount === 0），避免空对话占用历史面板
 */
async function fetchSessionList() {
  loading.value = true
  error.value = ''

  try {
    const sessions = await chatStore.getSessionList()
    // 只显示有消息的会话，空对话不占用历史记录
    sessionList.value = sessions.filter((s: any) => s.messageCount > 0)
    currentSessionId.value = chatStore.currentSessionId
  } catch (e: any) {
    console.error('[HistoryPanel] 获取会话列表失败:', e)
    error.value = '获取历史记录失败，请检查网络连接'
  } finally {
    loading.value = false
  }
}

// 弹窗显示时自动加载会话列表
watch(() => props.visible, (newVal) => {
  if (newVal) {
    fetchSessionList()
  }
})

/** 组件挂载时预加载会话列表 */
onMounted(() => {
  if (props.visible) {
    fetchSessionList()
  }
})
</script>

<style scoped>
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
  max-width: 480px;
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
  padding: var(--sp-lg) var(--sp-xl);
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: var(--sp-md) var(--sp-xl) var(--sp-lg);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

/* 加载状态 */
.loading-state {
  text-align: center;
  padding: var(--sp-xxl) 0;
  color: var(--text-dim);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-coral);
  border-radius: 50%;
  margin: 0 auto var(--sp-md);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
}

/* 错误状态 */
.error-state {
  text-align: center;
  padding: var(--sp-xxl) 0;
  color: var(--text-dim);
}

.error-icon {
  font-size: 40px;
  margin-bottom: var(--sp-md);
  opacity: 0.6;
}

.error-text {
  font-size: 14px;
  margin-bottom: var(--sp-md);
  color: var(--text-secondary);
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: var(--sp-xxl) 0;
  color: var(--text-dim);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: var(--sp-md);
  opacity: 0.4;
}

.empty-text {
  font-size: 14px;
  margin-bottom: var(--sp-xs);
}

.empty-hint {
  font-size: 12px;
  color: var(--text-dim);
  opacity: 0.7;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
}

.history-item {
  display: flex;
  align-items: center;
  gap: var(--sp-md);
  padding: var(--sp-md);
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.history-item:hover {
  background: var(--surface-cream);
  border-color: var(--accent-amber);
  transform: translateY(-1px);
}

.history-item.active {
  background: var(--surface-cream-strong);
  border-color: var(--accent-coral);
}

.history-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.history-info {
  flex: 1;
  min-width: 0;
}

.history-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-meta {
  display: flex;
  gap: var(--sp-sm);
  font-size: 12px;
  color: var(--text-dim);
}

.history-count {
  opacity: 0.7;
}

.history-delete {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.history-delete:hover {
  background: rgba(198, 72, 72, 0.1);
  color: #c64848;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-xs);
  padding: var(--sp-sm) var(--sp-lg);
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-secondary {
  background: var(--surface-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--surface-cream);
  border-color: var(--accent-amber);
  transform: translateY(-1px);
}
</style>
