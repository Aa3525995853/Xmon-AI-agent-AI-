/**
 * @file 工作区面板组件
 * @description 小牛（牛马）工作区面板，包含牛马状态动画、实时日志、
 *              任务进度、结果展示和"让小牛退下"按钮。默认折叠，有任务时自动展开
 * @module components/work/WorkPanel
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

<template>
  <transition name="work-panel">
    <div
      v-show="workerStore.isExpanded"
      :class="['work-panel', workerStore.workerStatus]"
      :style="workPanelStyle"
    >
      <!-- 面板头部 -->
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="panel-icon">🐮</span>
          <span class="panel-title">小牛工作台</span>
        </div>
        <div class="panel-header-actions">
          <!-- 任务描述 -->
          <span v-if="workerStore.taskDescription" class="task-desc">
            {{ workerStore.taskDescription }}
          </span>
          <!-- 让小牛退下按钮（工作中时禁用，避免中断任务） -->
          <button
            class="dismiss-btn"
            @click="handleDismiss"
            :disabled="workerStore.workerStatus === 'working'"
            :title="workerStore.workerStatus === 'working' ? '小牛正在干活，稍后再说' : '让小牛下班'"
          >
            {{ workerStore.workerStatus === 'done' ? '让它收工吧' : '让它退下吧' }}
          </button>
        </div>
      </div>

      <!-- 小牛状态动画区 -->
      <div class="worker-animation-area">
        <WorkerStatus />
      </div>

      <!-- 进度条（工作中/开工时显示） -->
      <div
        v-if="workerStore.workerStatus !== 'idle'"
        class="progress-section"
      >
        <div class="progress-header">
          <span class="progress-label">任务进度</span>
          <span class="progress-value">{{ workerStore.progress }}%</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: workerStore.progress + '%' }"
          ></div>
        </div>
      </div>

      <!-- 实时日志区 -->
      <div class="log-section">
        <div class="log-header">
          <span class="log-title">📝 执行日志</span>
          <span class="log-count">{{ workerStore.logs.length }} 条</span>
        </div>
        <div ref="logContainerRef" class="log-list">
          <div
            v-for="(log, index) in workerStore.logs"
            :key="index"
            :class="['log-entry', log.level || 'info', log.category || 'info']"
          >
            <span class="log-icon">{{ getLogIcon(log) }}</span>
            <span class="log-time">{{ log.time }}</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
          <!-- 无日志时的占位 -->
          <div v-if="workerStore.logs.length === 0" class="log-empty">
            小牛还没开始干活呢~
          </div>
        </div>
      </div>

      <!-- 任务结果展示区 -->
      <div v-if="workerStore.taskResult" class="result-section">
        <div class="result-header">
          <span class="result-title">📄 执行结果</span>
          <div class="result-actions">
            <button
              v-if="canSaveToPlan"
              class="save-plan-btn"
              @click="saveToPlan"
              :disabled="savingToPlan"
              title="保存到我的计划"
            >
              {{ savingToPlan ? '保存中...' : '💾 保存到计划' }}
            </button>
            <button v-if="resultIsMarkdown" class="result-toggle-btn" @click="toggleResultView">
              {{ showRawResult ? '预览' : '源码' }}
            </button>
          </div>
        </div>
        <div class="result-content">
          <!-- 文件类型结果：内联预览 -->
          <div v-if="workerStore.taskResult.type === 'file'" class="result-file">
            <div class="result-file-header">
              <span class="result-icon">📁</span>
              <span class="result-path">{{ workerStore.taskResult.path }}</span>
              <button class="result-copy-btn" @click="copyPath" title="复制路径">📋</button>
            </div>
            <!-- 文件内容预览（如果content有值） -->
            <div v-if="workerStore.taskResult.content" class="result-file-preview" v-html="renderContent(workerStore.taskResult.content)"></div>
          </div>
          <!-- 文本类型结果：Markdown渲染 -->
          <div v-else-if="workerStore.taskResult.type === 'text'" class="result-text">
            <div v-if="!showRawResult && resultIsMarkdown" class="result-markdown" v-html="renderContent(workerStore.taskResult.content)"></div>
            <pre v-else class="result-raw">{{ workerStore.taskResult.content }}</pre>
          </div>
          <!-- 表格类型结果：HTML表格渲染 -->
          <div v-else-if="workerStore.taskResult.type === 'table'" class="result-table-wrapper">
            <div v-if="parsedTableData.length > 0" class="result-table-scroll">
              <table class="result-table">
                <thead>
                  <tr>
                    <th v-for="(cell, ci) in parsedTableData[0]" :key="ci">{{ cell }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, ri) in parsedTableData.slice(1)" :key="ri">
                    <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <pre v-else class="result-raw">{{ workerStore.taskResult.preview || workerStore.taskResult.content }}</pre>
          </div>
          <!-- 图表类型结果 -->
          <div v-else-if="workerStore.taskResult.type === 'chart'" class="result-chart">
            <div class="result-markdown" v-html="renderContent(workerStore.taskResult.preview || workerStore.taskResult.content)"></div>
          </div>
          <!-- 旅行规划类型结果：Markdown渲染 -->
          <div v-else-if="workerStore.taskResult.type === 'travel_plan'" class="result-travel-plan">
            <div class="result-markdown" v-html="renderContent(workerStore.taskResult.plan || workerStore.taskResult.content)"></div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
/**
 * @description 工作区面板组件
 * 展示小牛工作状态、日志、进度和结果
 * 支持Markdown渲染、表格展示、文件内联预览
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useWorkerStore } from '../../stores/worker'
import { usePlanStore } from '../../stores/plan'
import WorkerStatus from './WorkerStatus.vue'

/** 工作区状态管理 */
const workerStore = useWorkerStore()
/** 计划状态管理 */
const planStore = usePlanStore()

/** 日志容器DOM引用，用于自动滚动 */
const logContainerRef = ref<HTMLElement | null>(null)

/** 是否显示原始结果（vs 渲染后结果） */
const showRawResult = ref(false)

/** 是否正在保存到计划 */
const savingToPlan = ref(false)

/** 当前结果是否可保存为计划 */
const canSaveToPlan = computed(() => {
  const result = workerStore.taskResult
  return result && (result.type === 'travel_plan' || result.type === 'text')
})

/** 当前结果是否为旅行规划 */
const isTravelPlan = computed(() => {
  return workerStore.taskResult?.type === 'travel_plan'
})

// ============================================================
// 计算属性
// ============================================================

/**
 * 计算工作区面板样式
 * @returns {object} CSS样式对象
 */
const workPanelStyle = computed(() => {
  return { flex: `${workerStore.workRatio} 1 0%` }
})

/**
 * 判断结果内容是否包含Markdown格式
 * @returns {boolean} 是否为Markdown内容
 */
const resultIsMarkdown = computed(() => {
  const content = workerStore.taskResult?.content || ''
  // 检测常见Markdown标记：标题、加粗、列表、代码块、表格
  return /(^#{1,6}\s|\*\*.*\*\*|^\s*[-*]\s|^```|\|.+\|.+\|)/m.test(content)
})

/**
 * 解析Markdown表格为二维数组
 * @returns {string[][]} 解析后的表格数据，每行是一个字符串数组
 */
const parsedTableData = computed(() => {
  const content = workerStore.taskResult?.preview || workerStore.taskResult?.content || ''
  if (!content) return []

  // 尝试解析Markdown表格格式
  const lines = content.split('\n').filter(line => line.trim())
  const tableLines = lines.filter(line => line.trim().startsWith('|'))

  if (tableLines.length < 2) return []

  // 解析每行的单元格
  const rows = tableLines
    .filter(line => !line.match(/^\|[\s-:|]+\|$/))  // 过滤分隔行
    .map(line =>
      line.split('|')
        .filter((_, i, arr) => i > 0 && i < arr.length - 1)  // 去掉首尾空元素
        .map(cell => cell.trim())
    )

  return rows
})

// ============================================================
// 事件监听
// ============================================================

/**
 * 监听日志变化，自动滚动到底部
 */
watch(
  () => workerStore.logs.length,
  async () => {
    await nextTick()
    if (logContainerRef.value) {
      logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
    }
  }
)

// ============================================================
// 交互方法
// ============================================================

/**
 * 处理"让小牛退下"按钮点击
 */
async function handleDismiss() {
  await workerStore.workerDismiss()
}

/**
 * 切换结果视图（预览/源码）
 */
function toggleResultView() {
  showRawResult.value = !showRawResult.value
}

/**
 * 复制文件路径到剪贴板
 */
async function copyPath() {
  const path = workerStore.taskResult?.path || ''
  if (path) {
    try {
      await navigator.clipboard.writeText(path)
    } catch {
      // 降级方案
    }
  }
}

/**
 * 保存当前结果到计划
 */
async function saveToPlan() {
  const result = workerStore.taskResult
  if (!result) return

  savingToPlan.value = true
  try {
    // 提取标题（从内容中提取第一行作为标题）
    const content = result.plan || result.content || ''
    const firstLine = content.split('\n').find(line => line.trim() && !line.startsWith('#')) || '未命名计划'
    const title = firstLine.slice(0, 50).trim()

    // 提取描述（第二行或前100字符）
    const descMatch = content.match(/\n([^#\n][^\n]{10,80})/)
    const description = descMatch ? descMatch[1].trim().slice(0, 100) : ''

    // 保存计划
    await planStore.savePlan({
      title,
      content,
      type: isTravelPlan.value ? 'travel' : 'general',
      description,
      metadata: result.metadata || {}
    })

    // 显示成功提示
    workerStore.addLog('已保存到「我的计划」', 'success')
  } catch (e) {
    workerStore.addLog('保存计划失败', 'error')
  } finally {
    savingToPlan.value = false
  }
}

/**
 * 渲染内容为HTML（简易Markdown渲染，不依赖外部库）
 * @param content - 原始Markdown内容
 * @returns {string} 渲染后的HTML
 */
function renderContent(content: string): string {
  if (!content) return ''

  let html = content
    // 转义HTML特殊字符（防止XSS）
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 代码块（```...```）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre class="code-block" data-lang="${lang}"><code>${code.trim()}</code></pre>`
  })

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>')

  // 加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 斜体
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // 无序列表
  html = html.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')

  // Markdown表格
  html = html.replace(/(\|.+\|[\r\n]+\|[-:\s|]+\|[\r\n]+((\|.+\|[\r\n]*)+))/g, (match) => {
    const rows = match.trim().split('\n').filter(line => line.trim())
    const dataRows = rows.filter(line => !line.match(/^\|[\s-:|]+\|$/))

    let table = '<table class="md-table">'
    dataRows.forEach((row, i) => {
      const cells = row.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim())
      const tag = i === 0 ? 'th' : 'td'
      table += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>'
    })
    table += '</table>'
    return table
  })

  // 段落（双换行）
  html = html.replace(/\n\n/g, '</p><p>')

  // 单换行
  html = html.replace(/\n/g, '<br>')

  return `<p>${html}</p>`
}

/**
 * 根据日志类别和级别获取图标
 * @param log - 日志条目
 * @returns {string} emoji 图标
 */
function getLogIcon(log: { category?: string; level?: string; message?: string }) {
  if (log.category === 'intent') return '🎯'
  if (log.category === 'llm') return '🤖'
  if (log.category === 'tool') {
    if (log.success === false) return '❌'
    if (log.message?.includes('完成') || log.message?.includes('✅')) return '✅'
    return '🔧'
  }
  if (log.category === 'result') return '📊'
  if (log.level === 'error' || log.category === 'error') return '❌'
  if (log.level === 'success') return '✅'
  if (log.level === 'warn') return '⚠️'
  return '📝'
}
</script>

<style scoped>
/* ============================================================
 * 工作区面板基础样式
 * ============================================================ */
.work-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface-canvas);
  border-left: 1px solid var(--border-soft);
  overflow: hidden;
  min-width: 200px;
}

/* ============================================================
 * 面板过渡动画
 * ============================================================ */
.work-panel-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.work-panel-leave-active {
  transition: all 0.3s cubic-bezier(0.7, 0, 0.84, 0);
}

.work-panel-enter-from {
  opacity: 0;
  transform: translateX(40px);
}

.work-panel-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

/* ============================================================
 * 面板头部样式
 * ============================================================ */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-md) var(--sp-lg);
  border-bottom: 1px solid var(--border-soft);
  flex-shrink: 0;
  min-height: 72px;
}

.panel-title-group {
  display: flex;
  align-items: center;
  gap: var(--sp-xs);
}

.panel-icon {
  font-size: 20px;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
}

.task-desc {
  font-size: 12px;
  color: var(--text-dim);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 让小牛退下按钮 */
.dismiss-btn {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.dismiss-btn:hover:not(:disabled) {
  background: var(--accent-coral);
  color: white;
  border-color: var(--accent-coral);
}

.dismiss-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ============================================================
 * 小牛动画区样式
 * ============================================================ */
.worker-animation-area {
  padding: var(--sp-md);
  border-bottom: 1px solid var(--border-soft);
  flex-shrink: 0;
}

/* ============================================================
 * 进度条区域样式
 * ============================================================ */
.progress-section {
  padding: var(--sp-sm) var(--sp-lg);
  border-bottom: 1px solid var(--border-soft);
  flex-shrink: 0;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--sp-xxs);
}

.progress-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.progress-value {
  font-size: 12px;
  color: var(--accent-teal);
  font-weight: 600;
}

.progress-bar {
  height: 4px;
  background: var(--border-soft);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-teal);
  border-radius: var(--radius-full);
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ============================================================
 * 日志区域样式
 * ============================================================ */
.log-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp-sm) var(--sp-lg);
  flex-shrink: 0;
}

.log-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.log-count {
  font-size: 11px;
  color: var(--text-dim);
}

.log-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--sp-lg) var(--sp-md);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}

.log-entry {
  display: flex;
  gap: var(--sp-xs);
  padding: 2px 0;
  color: var(--text-body);
  align-items: flex-start;
}

/* 日志图标 */
.log-icon {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  font-size: 12px;
}

/* 日志级别样式 */
.log-entry.warn {
  color: var(--accent-amber);
}

.log-entry.error {
  color: var(--accent-coral);
}

.log-entry.success {
  color: var(--accent-green);
}

/* 日志类别样式 */
.log-entry.intent {
  color: var(--accent-teal);
}

.log-entry.llm {
  color: var(--accent-purple);
}

.log-entry.tool {
  color: var(--accent-amber);
}

.log-entry.result {
  color: var(--accent-green);
}

.log-time {
  color: var(--text-dim);
  flex-shrink: 0;
  font-size: 11px;
}

.log-message {
  word-break: break-all;
}

.log-empty {
  color: var(--text-dim);
  font-family: var(--font-main);
  font-size: 13px;
  text-align: center;
  padding: var(--sp-xl);
}

/* ============================================================
 * 结果展示区样式
 * ============================================================ */
.result-section {
  border-top: 1px solid var(--border-soft);
  padding: var(--sp-md) var(--sp-lg);
  flex-shrink: 0;
  max-height: 400px;
  overflow-y: auto;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--sp-xs);
}

.result-actions {
  display: flex;
  gap: var(--sp-xs);
  align-items: center;
}

.save-plan-btn {
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent-teal);
  color: white;
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 4px;
}

.save-plan-btn:hover:not(:disabled) {
  background: var(--accent-teal-dark);
  transform: translateY(-1px);
}

.save-plan-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.result-toggle-btn {
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.result-toggle-btn:hover {
  background: var(--surface-cream);
  color: var(--text-primary);
}

.result-content {
  font-size: 13px;
  color: var(--text-body);
}

/* 文件结果 */
.result-file-header {
  display: flex;
  align-items: center;
  gap: var(--sp-xs);
  margin-bottom: var(--sp-sm);
}

.result-file-header .result-path {
  flex: 1;
  word-break: break-all;
  color: var(--accent-teal);
  font-size: 12px;
}

.result-copy-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  opacity: 0.6;
  transition: opacity var(--transition-fast);
}

.result-copy-btn:hover {
  opacity: 1;
}

.result-file-preview {
  margin-top: var(--sp-xs);
}

/* Markdown渲染样式 */
.result-markdown {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-body);
}

.result-markdown :deep(h2) {
  font-size: 16px;
  font-weight: 600;
  margin: var(--sp-sm) 0 var(--sp-xs);
  color: var(--text-primary);
}

.result-markdown :deep(h3) {
  font-size: 15px;
  font-weight: 600;
  margin: var(--sp-sm) 0 var(--sp-xs);
  color: var(--text-primary);
}

.result-markdown :deep(h4) {
  font-size: 14px;
  font-weight: 500;
  margin: var(--sp-xs) 0;
  color: var(--text-primary);
}

.result-markdown :deep(strong) {
  font-weight: 600;
  color: var(--text-primary);
}

.result-markdown :deep(em) {
  font-style: italic;
}

.result-markdown :deep(li) {
  margin-left: var(--sp-md);
  list-style: disc;
}

.result-markdown :deep(.inline-code) {
  background: var(--surface-soft);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.result-markdown :deep(.code-block) {
  background: var(--surface-dark);
  color: var(--on-dark);
  padding: var(--sp-sm) var(--sp-md);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  margin: var(--sp-xs) 0;
}

/* Markdown表格渲染 */
.result-markdown :deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin: var(--sp-xs) 0;
}

.result-markdown :deep(.md-table th) {
  background: var(--surface-soft);
  font-weight: 600;
  text-align: left;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
}

.result-markdown :deep(.md-table td) {
  padding: 5px 10px;
  border: 1px solid var(--border-color);
}

/* 原始文本 */
.result-raw {
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--surface-soft);
  padding: var(--sp-sm);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 12px;
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
}

/* 表格类型结果 */
.result-table-wrapper {
  overflow: hidden;
}

.result-table-scroll {
  overflow-x: auto;
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.result-table th {
  background: var(--surface-soft);
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  white-space: nowrap;
}

.result-table td {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
}

.result-table tr:hover td {
  background: var(--surface-cream);
}

/* 文本结果 */
.result-text {
  overflow: hidden;
}

/* 图表结果 */
.result-chart {
  overflow: hidden;
}

/* 旅行规划结果 */
.result-travel-plan {
  overflow: hidden;
}

.result-travel-plan :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--sp-sm) 0;
  font-size: 13px;
}

.result-travel-plan :deep(th),
.result-travel-plan :deep(td) {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  text-align: left;
}

.result-travel-plan :deep(th) {
  background: var(--surface-soft);
  font-weight: 600;
}

.result-travel-plan :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  margin: var(--sp-md) 0 var(--sp-sm);
  color: var(--accent-coral);
  border-bottom: 2px solid var(--accent-coral);
  padding-bottom: var(--sp-xs);
}

.result-travel-plan :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: var(--sp-md) 0 var(--sp-sm);
  color: var(--text-primary);
}

.result-icon {
  font-size: 16px;
}
</style>
