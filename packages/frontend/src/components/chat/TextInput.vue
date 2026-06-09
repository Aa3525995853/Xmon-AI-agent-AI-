/**
 * @file 文本输入
 * @description 聊天文本输入组件，支持发送消息、自适应高度、快捷键等
 * @module components/chat/TextInput
 */

<template>
  <div :class="['input-container', modeClass]">
    <div class="input-wrapper">
      <button class="attach-btn" title="发送图片" @click="$emit('imageBtnClick')">
        <span>🖼️</span>
      </button>
      <textarea
        ref="inputRef"
        v-model="inputText"
        :placeholder="placeholder"
        :disabled="isProcessing"
        @keydown.enter.exact="handleSend"
        @input="autoResize"
        rows="1"
      ></textarea>
      <button
        class="send-btn"
        :disabled="!inputText.trim() || isProcessing"
        @click="handleSend"
      >
        <span class="send-icon">➤</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue' // 导入Vue响应式API
import { storeToRefs } from 'pinia' // 导入Pinia状态管理工具
import { useAppStore } from '../../stores/app' // 导入应用状态管理
import { useChatStore } from '../../stores/chat' // 导入聊天状态管理

/** 组件事件定义 */
const emit = defineEmits<{
  (e: 'send', text: string): void // 发送消息事件，传递消息文本
  (e: 'imageBtnClick'): void // 点击图片上传按钮事件
}>()

/** 应用状态管理实例 */
const appStore = useAppStore()
/** 聊天状态管理实例 */
const chatStore = useChatStore()
/** 从store中解构是否正在处理状态 */
const { isProcessing } = storeToRefs(appStore)
/** 从store中解构当前模式（空闲/监听/处理/说话） */
const { mode } = storeToRefs(appStore)

/** 用户输入的文本内容 */
const inputText = ref('')
/** textarea元素的DOM引用 */
const inputRef = ref<HTMLTextAreaElement | null>(null)

/** 计算输入框占位文本（根据状态动态变化） */
const placeholder = computed(() => appStore.inputPlaceholder)

/** 计算当前模式对应的CSS类名 */
const modeClass = computed(() => {
  const map: Record<string, string> = {
    idle: 'idle', // 空闲状态
    listening: 'recording', // 正在录音状态
    processing: 'processing', // 正在处理状态
    speaking: 'speaking' // 正在说话状态
  }
  return map[mode.value] || 'idle' // 默认返回空闲状态
})

/**
 * 处理发送消息
 * @param e - 键盘事件（可选，当按Enter键时触发）
 */
function handleSend(e?: Event) {
  e?.preventDefault() // 阻止默认行为（如换行）
  const text = inputText.value.trim() // 获取输入文本并去除首尾空格
  if (!text || isProcessing.value) return // 文本为空或正在处理时不发送

  emit('send', text) // 触发发送消息事件
  inputText.value = '' // 清空输入框

  // 重置输入框高度
  if (inputRef.value) {
    inputRef.value.style.height = 'auto'
  }
}

/**
 * 自适应调整输入框高度
 */
function autoResize() {
  if (inputRef.value) {
    inputRef.value.style.height = 'auto' // 先重置高度
    inputRef.value.style.height = inputRef.value.scrollHeight + 'px' // 再设置为内容高度
  }
}
</script>

<style scoped>
.input-container {
  padding: var(--sp-md) var(--sp-lg);
  background: var(--surface-canvas);
  border-top: 1px solid var(--border-soft);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-sm);
  background: var(--bg-input);
  border-radius: var(--radius-xl);
  padding: var(--sp-xs) var(--sp-xs) var(--sp-xs) var(--sp-md);
  transition: all var(--transition-fast);
}

.input-container.processing .input-wrapper,
.input-container.speaking .input-wrapper {
  opacity: 0.7;
}

.attach-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition-fast);
  font-size: 16px;
}

.attach-btn:hover {
  background: var(--surface-card);
  color: var(--text-primary);
}

textarea {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: var(--font-main);
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-primary);
  resize: none;
  max-height: 120px;
  padding: var(--sp-xs) 0;
}

textarea::placeholder {
  color: var(--text-dim);
}

textarea:disabled {
  cursor: not-allowed;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--accent-coral);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-coral-active);
}

.send-btn:disabled {
  background: var(--accent-coral-disabled);
  cursor: not-allowed;
}

.send-icon {
  font-size: 14px;
}
</style>
