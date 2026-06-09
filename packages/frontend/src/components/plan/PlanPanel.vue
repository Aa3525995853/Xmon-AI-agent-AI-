/**
 * @file 计划面板组件
 * @description 计划面板组件，可折叠/展开，显示保存的计划列表和详情
 * @module components/plan/PlanPanel
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */

<template>
  <transition name="plan-panel">
    <div
      v-show="visible"
      :class="['plan-panel', { 'has-selection': planStore.currentPlan }]"
    >
      <!-- 面板头部 -->
      <div class="panel-header">
        <div class="panel-title-group">
          <i class="fas fa-clipboard-list"></i>
          <span class="panel-title">我的计划</span>
          <span v-if="planStore.plans.length > 0" class="plan-count">
            {{ planStore.plans.length }}
          </span>
        </div>
        <button class="close-btn" @click="emit('close')">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- 计划列表 -->
      <div v-if="!planStore.currentPlan" class="plan-list-section">
        <div v-if="planStore.plans.length === 0" class="empty-state">
          <div class="empty-icon">
            <i class="fas fa-folder-open"></i>
          </div>
          <div class="empty-text">暂无计划</div>
          <div class="empty-hint">生成的旅行规划可以保存到这里哦~</div>
        </div>
        <div v-else class="plan-list">
          <div
            v-for="plan in planStore.plans"
            :key="plan.id"
            class="plan-card"
            @click="viewPlan(plan.id)"
          >
            <div class="plan-card-icon">
              <i :class="['fas', planStore.getTypeIcon(plan.type)]"></i>
            </div>
            <div class="plan-card-info">
              <div class="plan-card-title">{{ plan.title }}</div>
              <div class="plan-card-meta">
                <span class="plan-type-badge">{{ planStore.getTypeLabel(plan.type) }}</span>
                <span class="plan-date">{{ planStore.formatDate(plan.createdAt) }}</span>
              </div>
            </div>
            <div class="plan-card-action">
              <i class="fas fa-chevron-right"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- 计划详情 -->
      <div v-else class="plan-detail-section">
        <div class="detail-header">
          <button class="back-btn" @click="planStore.currentPlan = null">
            <i class="fas fa-arrow-left"></i>
            <span>返回列表</span>
          </button>
          <div class="detail-actions">
            <button class="action-btn" @click="handleEdit" title="编辑">
              <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn delete" @click="handleDelete" title="删除">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>

        <div class="detail-content">
          <div class="detail-title">{{ planStore.currentPlan.title }}</div>
          <div class="detail-meta">
            <span class="plan-type-badge">{{ planStore.getTypeLabel(planStore.currentPlan.type) }}</span>
            <span>创建于 {{ planStore.formatDate(planStore.currentPlan.createdAt) }}</span>
          </div>
          <div class="detail-body">
            <div class="markdown-content" v-html="renderMarkdown(planStore.currentPlan.content)"></div>
          </div>
        </div>
      </div>

      <!-- 编辑弹窗 -->
      <div v-if="editingPlan" class="edit-modal">
        <div class="edit-modal-content">
          <div class="edit-modal-header">
            <span>编辑计划</span>
            <button @click="editingPlan = null">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="edit-modal-body">
            <div class="form-group">
              <label>标题</label>
              <input v-model="editForm.title" type="text" placeholder="计划标题" />
            </div>
            <div class="form-group">
              <label>内容 (Markdown)</label>
              <textarea v-model="editForm.content" rows="10" placeholder="计划内容..."></textarea>
            </div>
          </div>
          <div class="edit-modal-footer">
            <button class="btn-cancel" @click="editingPlan = null">取消</button>
            <button class="btn-save" @click="saveEdit">保存</button>
          </div>
        </div>
      </div>

      <!-- 删除确认弹窗 -->
      <ConfirmDialog
        v-if="showDeleteConfirm"
        :visible="showDeleteConfirm"
        title="删除计划"
        :message="`确定要删除「${planStore.currentPlan?.title}」吗？删除后无法恢复。`"
        confirm-text="删除"
        @confirm="confirmDelete"
        @cancel="showDeleteConfirm = false"
      />
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { usePlanStore, type Plan, type PlanListItem } from '../../stores/plan'
import ConfirmDialog from '../common/ConfirmDialog.vue'

/** 组件属性 */
const props = defineProps<{ visible: boolean }>()
/** 组件事件 */
const emit = defineEmits<{ (e: 'close'): void }>()

/** 计划 Store */
const planStore = usePlanStore()

/** 编辑中的计划 */
const editingPlan = ref<Plan | null>(null)

/** 编辑表单 */
const editForm = ref({
  title: '',
  content: ''
})

/** 显示删除确认 */
const showDeleteConfirm = ref(false)

// ============================================================
// 方法
// ============================================================

/**
 * 查看计划详情
 */
async function viewPlan(planId: string) {
  await planStore.loadPlan(planId)
}

/**
 * 进入编辑模式
 */
function handleEdit() {
  if (!planStore.currentPlan) return
  editingPlan.value = planStore.currentPlan
  editForm.value = {
    title: planStore.currentPlan.title,
    content: planStore.currentPlan.content
  }
}

/**
 * 保存编辑
 */
async function saveEdit() {
  if (!editingPlan.value) return

  await planStore.updatePlan(editingPlan.value.id, {
    title: editForm.value.title,
    content: editForm.value.content
  })

  editingPlan.value = null
}

/**
 * 显示删除确认
 */
function handleDelete() {
  showDeleteConfirm.value = true
}

/**
 * 确认删除
 */
async function confirmDelete() {
  if (!planStore.currentPlan) return

  const success = await planStore.deletePlan(planStore.currentPlan.id)
  if (success) {
    showDeleteConfirm.value = false
    planStore.currentPlan = null
  }
}

/**
 * 转义 HTML 特殊字符（保留 emoji 和 Unicode 符号）
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 渲染 Markdown 为 HTML
 */
function renderMarkdown(content: string): string {
  if (!content) return ''

  let html = content

  // 代码块（需要先处理，避免代码内的内容被转义）
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="code-block"><code>${escapeHtml(code.trim())}</code></pre>`
  })

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')

  // 标题（转义内容）
  html = html.replace(/^### (.+)$/gm, (_match, text) => `<h4>${escapeHtml(text)}</h4>`)
  html = html.replace(/^## (.+)$/gm, (_match, text) => `<h3>${escapeHtml(text)}</h3>`)
  html = html.replace(/^# (.+)$/gm, (_match, text) => `<h2>${escapeHtml(text)}</h2>`)

  // 加粗、斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 无序列表
  html = html.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')

  // 表格（单元格内容需要转义）
  html = html.replace(/(\|.+\|[\r\n]+\|[-:\s|]+\|[\r\n]+((\|.+\|[\r\n]*)+))/g, (match) => {
    const rows = match.trim().split('\n').filter(line => line.trim())
    const dataRows = rows.filter(line => !line.match(/^\|[\s-:|]+\|$/))

    let table = '<table class="md-table">'
    dataRows.forEach((row, i) => {
      const cells = row.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim())
      const tag = i === 0 ? 'th' : 'td'
      table += '<tr>' + cells.map(c => `<${tag}>${escapeHtml(c)}</${tag}>`).join('') + '</tr>'
    })
    table += '</table>'
    return table
  })

  // 段落
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')

  return `<p>${html}</p>`
}

// 加载计划列表
onMounted(() => {
  planStore.loadPlans()
})
</script>

<style scoped>
/* ============================================================
   计划面板基础样式
   ============================================================ */
.plan-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 400px;
  background: var(--surface-canvas);
  border-left: 1px solid var(--border-color);
  z-index: 900;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 过渡动画 */
.plan-panel-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.plan-panel-leave-active {
  transition: transform 0.25s cubic-bezier(0.7, 0, 0.84, 0);
}

.plan-panel-enter-from,
.plan-panel-leave-to {
  transform: translateX(100%);
}

/* ============================================================
   面板头部
   ============================================================ */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp-md) var(--sp-lg);
  border-bottom: 1px solid var(--border-soft);
  flex-shrink: 0;
}

.panel-title-group {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
}

.panel-title-group i {
  color: var(--accent-teal);
  font-size: 18px;
}

.panel-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
}

.plan-count {
  background: var(--accent-teal);
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--surface-soft);
  color: var(--text-primary);
}

/* ============================================================
   空状态
   ============================================================ */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--sp-2xl) var(--sp-lg);
  text-align: center;
}

.empty-icon {
  width: 56px;
  height: 56px;
  background: var(--surface-soft);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--sp-md);
}

.empty-icon i {
  font-size: 24px;
  color: var(--text-dim);
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
   计划列表
   ============================================================ */
.plan-list-section {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-md);
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
}

.plan-card {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: var(--sp-sm) var(--sp-md);
  background: var(--surface-card);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.plan-card:hover {
  background: var(--surface-cream);
  border-color: var(--accent-amber);
  transform: translateY(-1px);
}

.plan-card-icon {
  width: 40px;
  height: 40px;
  background: var(--surface-soft);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.plan-card-icon i {
  font-size: 16px;
  color: var(--accent-teal);
}

.plan-card-info {
  flex: 1;
  min-width: 0;
}

.plan-card-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plan-card-meta {
  display: flex;
  align-items: center;
  gap: var(--sp-xs);
  margin-top: 4px;
}

.plan-type-badge {
  background: var(--accent-teal);
  color: white;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-weight: 600;
}

.plan-date {
  font-size: 11px;
  color: var(--text-dim);
}

.plan-card-action {
  color: var(--text-dim);
  font-size: 12px;
}

/* ============================================================
   计划详情
   ============================================================ */
.plan-detail-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp-sm) var(--sp-md);
  border-bottom: 1px solid var(--border-soft);
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--sp-xs);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: var(--sp-xs) var(--sp-sm);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.back-btn:hover {
  background: var(--surface-soft);
  color: var(--text-primary);
}

.detail-actions {
  display: flex;
  gap: var(--sp-xs);
}

.action-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--surface-soft);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

.action-btn.delete:hover {
  background: var(--accent-coral);
  color: white;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-lg);
}

.detail-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--sp-sm);
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: var(--sp-lg);
}

.detail-body {
  border-top: 1px solid var(--border-soft);
  padding-top: var(--sp-md);
}

/* Markdown 内容样式 */
.markdown-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-body);
  word-break: break-word;
}

/* 确保 emoji 和特殊 Unicode 字符正确显示 */
.markdown-content :deep(*) {
  font-family: inherit;
}

.markdown-content :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  margin: var(--sp-md) 0 var(--sp-sm);
  color: var(--text-primary);
}

.markdown-content :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: var(--sp-md) 0 var(--sp-sm);
  color: var(--text-primary);
}

.markdown-content :deep(h4) {
  font-size: 14px;
  font-weight: 600;
  margin: var(--sp-sm) 0;
}

.markdown-content :deep(strong) {
  font-weight: 600;
}

.markdown-content :deep(li) {
  margin-left: var(--sp-md);
  list-style: disc;
}

.markdown-content :deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--sp-sm) 0;
  font-size: 13px;
}

.markdown-content :deep(.md-table th),
.markdown-content :deep(.md-table td) {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
}

.markdown-content :deep(.md-table th) {
  background: var(--surface-soft);
  font-weight: 600;
}

.markdown-content :deep(.code-block) {
  background: var(--surface-dark);
  color: var(--on-dark);
  padding: var(--sp-sm) var(--sp-md);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
}

/* ============================================================
   编辑弹窗
   ============================================================ */
.edit-modal {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-lg);
  z-index: 10;
}

.edit-modal-content {
  background: var(--surface-canvas);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.edit-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp-md) var(--sp-lg);
  border-bottom: 1px solid var(--border-soft);
  font-weight: 500;
}

.edit-modal-header button {
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-modal-header button:hover {
  background: var(--surface-soft);
  color: var(--text-primary);
}

.edit-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-lg);
}

.form-group {
  margin-bottom: var(--sp-md);
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: var(--sp-xs);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: var(--sp-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--accent-teal);
}

.edit-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-sm);
  padding: var(--sp-md) var(--sp-lg);
  border-top: 1px solid var(--border-soft);
}

.btn-cancel,
.btn-save {
  padding: var(--sp-xs) var(--sp-lg);
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-cancel {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--surface-soft);
}

.btn-save {
  border: none;
  background: var(--accent-teal);
  color: white;
}

.btn-save:hover {
  background: var(--accent-teal-dark);
}
</style>