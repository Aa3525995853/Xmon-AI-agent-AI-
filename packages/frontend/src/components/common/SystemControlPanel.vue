/**
 * @file 电脑控制面板
 * @description 电脑控制弹窗，展示系统控制快捷操作和操作日志
 *              支持通过自然语言指令控制电脑应用、文件、音量等
 * @module components/common/SystemControlPanel
 * @version 1.0.0
 * @date 2026-06-08
 */

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">
            <i class="fas fa-desktop"></i>
            <span>电脑控制</span>
          </div>
          <button class="modal-close" @click="handleClose">✕</button>
        </div>
        <div class="modal-body">
          <!-- 指令输入区 -->
          <div class="command-input-section">
            <div class="input-wrapper">
              <input
                v-model="commandText"
                type="text"
                placeholder="输入指令，如：打开微信、播放音乐、调大音量..."
                class="command-input"
                @keydown.enter="executeCommand"
              />
              <button
                class="execute-btn"
                :disabled="!commandText.trim() || executing"
                @click="executeCommand"
              >
                {{ executing ? '...' : '执行' }}
              </button>
            </div>
          </div>

          <!-- 快捷操作 -->
          <div class="quick-actions">
            <div class="section-title">快捷操作</div>
            <div class="action-grid">
              <button
                v-for="action in quickActions"
                :key="action.name"
                class="action-btn"
                @click="handleQuickAction(action)"
              >
                <span class="action-icon">{{ action.icon }}</span>
                <span class="action-label">{{ action.label }}</span>
              </button>
            </div>
          </div>

          <!-- 执行结果 -->
          <div v-if="lastResult" class="result-section">
            <div class="section-title">执行结果</div>
            <div :class="['result-card', lastResult.success ? 'result-success' : 'result-error']">
              <div class="result-icon">{{ lastResult.success ? '✅' : '❌' }}</div>
              <div class="result-message">{{ lastResult.message }}</div>
            </div>
            <!-- 危险操作确认 -->
            <div v-if="lastResult.requireConfirm" class="confirm-section">
              <div class="confirm-text">此操作需要确认，是否继续？</div>
              <div class="confirm-actions">
                <button class="btn btn-danger" @click="confirmAction">确认执行</button>
                <button class="btn btn-secondary" @click="cancelAction">取消</button>
              </div>
            </div>
          </div>

          <!-- 操作日志 -->
          <div class="log-section">
            <div class="section-title">操作日志</div>
            <div v-if="logs.length === 0" class="empty-state">
              <div class="empty-text">暂无操作记录</div>
            </div>
            <div v-else class="log-list">
              <div v-for="(log, index) in logs" :key="index" class="log-item">
                <div :class="['log-status', log.success ? 'log-success' : 'log-fail']">
                  {{ log.success ? '✓' : '✗' }}
                </div>
                <div class="log-info">
                  <div class="log-command">{{ log.input || log.type }}</div>
                  <div class="log-time">{{ formatTime(log.timestamp) }}</div>
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
import { ref, onMounted } from 'vue'

/** 组件属性 - 控制弹窗显示 */
defineProps<{ visible: boolean }>()
/** 组件事件 */
const emit = defineEmits<{ (e: 'close'): void }>()

/** 用户输入的指令文本 */
const commandText = ref('')
/** 是否正在执行指令 */
const executing = ref(false)
/** 最近一次执行结果 */
const lastResult = ref<{ success: boolean; message: string; requireConfirm?: boolean; pendingToolCall?: any } | null>(null)
/** 操作日志列表 */
const logs = ref<any[]>([])

/** 快捷操作配置列表 */
const quickActions = [
  { name: 'screenshot', icon: '📸', label: '截图', action: 'take_screenshot', params: {} },
  { name: 'volume_up', icon: '🔊', label: '音量+', action: 'control_volume', params: { action: 'up' } },
  { name: 'volume_down', icon: '🔉', label: '音量-', action: 'control_volume', params: { action: 'down' } },
  { name: 'mute', icon: '🔇', label: '静音', action: 'control_volume', params: { action: 'mute' } },
  { name: 'lock', icon: '🔒', label: '锁屏', action: 'system_shortcut', params: { action: 'lock' } },
  { name: 'wechat', icon: '💬', label: '微信', action: 'launch_app', params: { app_name: '微信' } },
  { name: 'browser', icon: '🌐', label: '浏览器', action: 'launch_app', params: { app_name: '浏览器' } },
  { name: 'music', icon: '🎵', label: '云音乐', action: 'launch_app', params: { app_name: '网易云音乐' } },
]

/**
 * 关闭弹窗
 */
function handleClose() {
  emit('close')
}

/**
 * 执行自然语言指令
 * 通过后端 /api/system/execute 接口解析并执行用户输入的指令
 */
async function executeCommand() {
  const cmd = commandText.value.trim()
  if (!cmd || executing.value) return

  executing.value = true
  lastResult.value = null

  try {
    const res = await fetch('/api/system/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    })
    const data = await res.json()
    lastResult.value = {
      success: data.success !== false,
      message: data.message || data.error || (data.success ? '执行成功' : '执行失败'),
      requireConfirm: data.requireConfirm || false,
      pendingToolCall: data.pendingToolCall || null
    }
    // 执行后刷新日志
    fetchLogs()
    commandText.value = ''
  } catch (e: any) {
    lastResult.value = { success: false, message: '网络错误，请检查连接' }
  } finally {
    executing.value = false
  }
}

/**
 * 执行快捷操作
 * 通过后端 /api/system/quick 接口直接调用指定工具
 * @param action - 快捷操作配置对象
 */
async function handleQuickAction(action: { action: string; params: Record<string, any>; label: string }) {
  executing.value = true
  lastResult.value = null

  try {
    const res = await fetch('/api/system/quick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action.action, params: action.params })
    })
    const data = await res.json()
    lastResult.value = {
      success: data.success !== false,
      message: data.message || data.error || (data.success ? `${action.label} 执行成功` : `${action.label} 执行失败`),
      requireConfirm: data.requireConfirm || false,
      pendingToolCall: data.pendingToolCall || null
    }
    fetchLogs()
  } catch (e: any) {
    lastResult.value = { success: false, message: '网络错误，请检查连接' }
  } finally {
    executing.value = false
  }
}

/**
 * 确认执行危险操作
 * 将待确认的工具调用发送到后端 /api/system/confirm 接口完成二次确认
 */
async function confirmAction() {
  if (!lastResult.value?.pendingToolCall) return

  executing.value = true
  try {
    const res = await fetch('/api/system/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToolCall: lastResult.value.pendingToolCall })
    })
    const data = await res.json()
    lastResult.value = {
      success: data.success !== false,
      message: data.message || data.error || (data.success ? '执行成功' : '执行失败')
    }
    fetchLogs()
  } catch (e: any) {
    lastResult.value = { success: false, message: '网络错误，请检查连接' }
  } finally {
    executing.value = false
  }
}

/**
 * 取消待确认的危险操作
 */
function cancelAction() {
  lastResult.value = null
}

/**
 * 从后端获取操作日志
 */
async function fetchLogs() {
  try {
    const res = await fetch('/api/system/logs')
    const data = await res.json()
    if (data.success) {
      // 日志按时间倒序展示，最新的在前面
      logs.value = (data.logs || []).reverse().slice(0, 20)
    }
  } catch (e: any) {
    // 日志获取失败不影响主流程，静默处理
  }
}

/**
 * 格式化时间戳为可读字符串
 * @param timestamp - 时间戳（毫秒或秒）
 * @returns 格式化后的时间字符串
 */
function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  // 兼容秒级和毫秒级时间戳
  const ts = timestamp > 1e12 ? timestamp : timestamp * 1000
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// 组件挂载时预加载操作日志
onMounted(() => {
  fetchLogs()
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

/* 指令输入区 */
.command-input-section {
  margin-bottom: var(--sp-lg);
}

.input-wrapper {
  display: flex;
  gap: var(--sp-sm);
}

.command-input {
  flex: 1;
  padding: var(--sp-sm) var(--sp-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 14px;
  outline: none;
  background: var(--surface-soft);
  color: var(--text-primary);
}

.command-input:focus {
  border-color: var(--accent-coral);
}

.execute-btn {
  padding: var(--sp-sm) var(--sp-lg);
  background: var(--accent-coral);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.execute-btn:hover:not(:disabled) {
  background: var(--accent-coral-active);
}

.execute-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 快捷操作 */
.quick-actions {
  margin-bottom: var(--sp-lg);
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: var(--sp-md);
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-sm);
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--sp-sm);
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--surface-cream);
  border-color: var(--accent-amber);
  transform: translateY(-1px);
}

.action-icon {
  font-size: 20px;
}

.action-label {
  font-size: 11px;
  color: var(--text-secondary);
}

/* 执行结果 */
.result-section {
  margin-bottom: var(--sp-lg);
}

.result-card {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-sm);
  padding: var(--sp-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

.result-card.result-success {
  background: rgba(93, 184, 114, 0.08);
  border-color: rgba(93, 184, 114, 0.3);
}

.result-card.result-error {
  background: rgba(198, 72, 72, 0.08);
  border-color: rgba(198, 72, 72, 0.3);
}

.result-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.result-message {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}

/* 确认操作 */
.confirm-section {
  margin-top: var(--sp-sm);
  padding: var(--sp-md);
  background: rgba(247, 197, 159, 0.1);
  border-radius: var(--radius-md);
  border: 1px dashed var(--accent-amber);
}

.confirm-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: var(--sp-sm);
}

.confirm-actions {
  display: flex;
  gap: var(--sp-sm);
}

/* 操作日志 */
.log-section {
  margin-top: var(--sp-sm);
}

.empty-state {
  text-align: center;
  padding: var(--sp-lg) 0;
  color: var(--text-dim);
}

.empty-text {
  font-size: 13px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-item {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: 6px 0;
  border-bottom: 1px solid var(--border-color);
}

.log-item:last-child {
  border-bottom: none;
}

.log-status {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
}

.log-status.log-success {
  background: rgba(93, 184, 114, 0.15);
  color: var(--accent-green);
}

.log-status.log-fail {
  background: rgba(198, 72, 72, 0.15);
  color: #c64848;
}

.log-info {
  flex: 1;
  min-width: 0;
}

.log-command {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-time {
  font-size: 11px;
  color: var(--text-dim);
}

/* 通用按钮 */
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
}

.btn-danger {
  background: #c64848;
  color: white;
}

.btn-danger:hover {
  background: #b03a3a;
}
</style>
