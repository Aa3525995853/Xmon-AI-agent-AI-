/**
 * @file 确认对话框
 * @description 通用确认对话框组件，用于危险操作确认、澄清对话等
 * @module components/common/ConfirmDialog
 */

<template>
  <Teleport to="body">
    <div v-if="visible" class="confirm-overlay" @click.self="handleCancel">
      <div class="confirm-dialog">
        <div class="confirm-header">
          <span class="confirm-icon">{{ icon }}</span>
          <h3 class="confirm-title">{{ title }}</h3>
        </div>
        <p class="confirm-message">{{ message }}</p>

        <!-- 选项列表 -->
        <div v-if="options.length > 0" class="confirm-options">
          <button
            v-for="(opt, index) in options"
            :key="index"
            class="option-btn"
            @click="handleSelect(opt)"
          >
            {{ opt }}
          </button>
        </div>

        <!-- 确认/取消按钮 -->
        <div v-else class="confirm-actions">
          <button class="cancel-btn" @click="handleCancel">取消</button>
          <button
            :class="['confirm-btn', warningLevel]"
            @click="handleConfirm"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue' // 导入Vue响应式API

/** 对话框是否可见 */
const visible = ref(false)
/** 对话框标题 */
const title = ref('确认操作')
/** 对话框消息内容 */
const message = ref('')
/** 对话框图标 */
const icon = ref('⚠️')
/** 选项列表（可选模式） */
const options = ref<string[]>([])
/** 确认按钮文字 */
const confirmText = ref('确认')
/** 警告级别（normal/danger） */
const warningLevel = ref('normal')

/** Promise resolve函数引用，用于返回用户选择结果 */
let resolvePromise: ((value: string | boolean) => void) | null = null

/**
 * 显示确认对话框
 * @param opts - 对话框配置对象
 * @returns Promise，resolve用户选择结果（true/false或选项文本）
 */
function show(opts: {
  title?: string // 标题（可选）
  message: string // 消息内容（必填）
  icon?: string // 图标（可选）
  options?: string[] // 选项列表（可选，提供时显示选项模式）
  confirmText?: string // 确认按钮文字（可选）
  warningLevel?: string // 警告级别（可选）
}): Promise<string | boolean> {
  title.value = opts.title || '确认操作' // 设置标题，默认'确认操作'
  message.value = opts.message // 设置消息内容
  icon.value = opts.icon || '⚠️' // 设置图标，默认警告图标
  options.value = opts.options || [] // 设置选项列表，默认为空
  confirmText.value = opts.confirmText || '确认' // 设置确认按钮文字，默认'确认'
  warningLevel.value = opts.warningLevel || 'normal' // 设置警告级别，默认normal
  visible.value = true // 显示对话框

  return new Promise((resolve) => { // 返回Promise，等待用户选择
    resolvePromise = resolve // 保存resolve函数引用
  })
}

/**
 * 处理确认按钮点击
 */
function handleConfirm() {
  visible.value = false // 隐藏对话框
  resolvePromise?.(true) // resolve true表示确认
  resolvePromise = null // 清空引用
}

/**
 * 处理取消按钮点击或点击遮罩
 */
function handleCancel() {
  visible.value = false // 隐藏对话框
  resolvePromise?.(false) // resolve false表示取消
  resolvePromise = null // 清空引用
}

/**
 * 处理选项点击（选项模式）
 * @param opt - 选中的选项文本
 */
function handleSelect(opt: string) {
  visible.value = false // 隐藏对话框
  resolvePromise?.(opt) // resolve选中的选项文本
  resolvePromise = null // 清空引用
}

/** 暴露show方法给父组件 */
defineExpose({ show })
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

.confirm-dialog {
  background: var(--surface-canvas);
  border-radius: var(--radius-xl);
  padding: var(--sp-lg);
  max-width: 400px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  margin-bottom: var(--sp-md);
}

.confirm-icon {
  font-size: 20px;
}

.confirm-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.confirm-message {
  font-size: 14px;
  color: var(--text-body);
  line-height: 1.5;
  margin: 0 0 var(--sp-md) 0;
}

.confirm-options {
  display: flex;
  flex-direction: column;
  gap: var(--sp-xs);
}

.option-btn {
  padding: var(--sp-sm) var(--sp-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
}

.option-btn:hover {
  background: var(--surface-card);
  border-color: var(--accent-coral);
}

.confirm-actions {
  display: flex;
  gap: var(--sp-sm);
  justify-content: flex-end;
}

.cancel-btn {
  padding: var(--sp-sm) var(--sp-lg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
}

.confirm-btn {
  padding: var(--sp-sm) var(--sp-lg);
  border: none;
  border-radius: var(--radius-md);
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.confirm-btn.normal {
  background: var(--accent-coral);
}

.confirm-btn.danger {
  background: #c64545;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
