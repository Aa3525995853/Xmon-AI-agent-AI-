/**
 * @file 消息列表
 * @description 聊天消息列表组件，展示用户和助手的消息，支持自动滚动到底部
 * @module components/chat/ChatMessages
 */

<template>
  <div class="chat-messages" ref="containerRef">
    <!-- 欢迎消息（无消息时显示） -->
    <WelcomeMsg v-if="messages.length === 0" />

    <div
      v-for="msg in messages"
      :key="msg.id"
      :class="['msg-group', msg.role, { 'fade-in': true }]"
    >
      <div v-if="msg.role === 'assistant'" class="avatar-placeholder">🌙</div>
      <div class="msg-content">
        <div class="msg-bubble" v-html="renderMessage(msg)"></div>
        <div class="msg-time">{{ formatTime(msg.timestamp) }}</div>
      </div>
    </div>

    <!-- 打字指示器 -->
    <div v-if="isTyping" class="msg-group assistant fade-in">
      <div class="avatar-placeholder">🌙</div>
      <div class="msg-content">
        <div class="msg-bubble typing-bubble">
          <span v-if="typingContext" class="typing-context">{{ typingContext }}</span>
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 小梦插嘴气泡（浮动在聊天区底部） -->
    <transition name="chime-in">
      <div
        v-if="workerStore.chimeIn.active"
        class="chime-in-bubble"
        @click="workerStore.dismissChimeIn()"
      >
        <span class="chime-in-avatar">🌙</span>
        <span class="chime-in-text">{{ workerStore.chimeIn.text }}</span>
        <span class="chime-in-close">✕</span>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '../../stores/chat'
import { useWorkerStore } from '../../stores/worker'
import { useTaskStream } from '../../composables/useTaskStream'
import { processCodeBlocks, escapeHtml, renderMarkdown } from '../../utils/format'
import WelcomeMsg from './WelcomeMsg.vue'
import type { Message } from '../../types'

/** 组件事件 */
const emit = defineEmits<{
  (e: 'suggest', text: string): void
  (e: 'upload', type: string): void
}>()

/** 聊天状态管理 */
const chatStore = useChatStore()
/** 工作区状态管理（用于插嘴气泡） */
const workerStore = useWorkerStore()
/** 消息列表、打字状态等响应式数据 */
const { messages, isTyping, typingContext } = storeToRefs(chatStore)
/** 任务流处理 */
const { sendStreamText } = useTaskStream()

/** 消息容器DOM引用 */
const containerRef = ref<HTMLDivElement | null>(null)

/**
 * 渲染消息内容（Markdown → HTML，支持代码块高亮）
 * @param msg - 消息对象
 * @returns 渲染后的HTML字符串
 */
function renderMessage(msg: Message): string {
  if (msg.role === 'assistant') {
    try {
      // 使用 Markdown 渲染器处理换行、列表、加粗、引用等
      return renderMarkdown(msg.text)
    } catch {
      return escapeHtml(msg.text)
    }
  }
  return escapeHtml(msg.text)
}

/**
 * 格式化消息时间显示
 * @param timestamp - 时间戳
 * @returns HH:MM格式的时间字符串
 */
function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/** 监听消息列表变化：自动滚动到底部并保存历史记录 */
watch(
  () => messages.value.length,
  () => {
    nextTick(() => {
      if (containerRef.value) {
        containerRef.value.scrollTop = containerRef.value.scrollHeight
      }
    })
    saveToHistory()
  }
)

/** 监听打字状态变化：自动滚动到底部 */
watch(isTyping, () => {
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  })
})

/**
 * 保存当前对话到localStorage历史记录
 */
function saveToHistory() {
  try {
    const saved = localStorage.getItem('xiaomeng-chat-history')
    let history = saved ? JSON.parse(saved) : []
    
    const currentChat = {
      id: 'chat_' + Date.now(),
      title: messages.value.length > 0 
        ? (messages.value[0].text.length > 20 
            ? messages.value[0].text.substring(0, 20) + '...' 
            : messages.value[0].text)
        : '新对话',
      messages: messages.value.map(m => ({
        role: m.role,
        content: m.text,
        timestamp: m.timestamp
      })),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    if (history.length === 0) {
      history.push(currentChat)
    } else {
      // 更新最新的对话
      history[0].messages = currentChat.messages
      history[0].updatedAt = Date.now()
      history[0].title = currentChat.title
    }
    
    localStorage.setItem('xiaomeng-chat-history', JSON.stringify(history))
  } catch (e) {}
}
</script>

<style scoped>
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-md);
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
  padding-bottom: var(--sp-xl);
}

.msg-group {
  display: flex;
  max-width: 700px;
  gap: var(--sp-sm);
  width: 100%;
}

.msg-group.user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.msg-group.assistant {
  align-self: flex-start;
}

.avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-coral), var(--accent-amber));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.msg-content {
  display: flex;
  flex-direction: column;
  max-width: calc(100% - 48px);
}

.msg-bubble {
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  line-height: 1.6;
  word-break: break-word;
  font-size: 14px;
}

.msg-group.user .msg-bubble {
  background: linear-gradient(135deg, var(--accent-coral), var(--accent-amber));
  color: white;
  border-bottom-right-radius: var(--radius-xs);
}

.msg-group.assistant .msg-bubble {
  background: var(--surface-canvas);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-bottom-left-radius: var(--radius-xs);
}

.msg-time {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 4px;
  padding: 0 4px;
}

.msg-group.user .msg-time {
  text-align: right;
}

.typing-bubble {
  display: flex;
  align-items: center;
  gap: 4px;
}

.typing-context {
  color: var(--text-secondary);
  font-size: 13px;
  margin-right: 8px;
}

.typing-indicator {
  display: flex;
  gap: 4px;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-dim);
  animation: typing-bounce 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: 0s; }
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.fade-in {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ============================================================
 * 小梦插嘴气泡样式
 * 浮动在聊天区底部，有特殊的渐变背景和弹跳动画
 * ============================================================ */
.chime-in-bubble {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(255, 154, 139, 0.12), rgba(255, 193, 120, 0.12));
  border: 1px solid rgba(255, 154, 139, 0.25);
  border-radius: var(--radius-lg);
  cursor: pointer;
  backdrop-filter: blur(8px);
  margin-top: auto;
  z-index: 10;
}

.chime-in-avatar {
  font-size: 18px;
  flex-shrink: 0;
  animation: chime-wiggle 0.6s ease;
}

.chime-in-text {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
}

.chime-in-close {
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.chime-in-bubble:hover .chime-in-close {
  opacity: 1;
}

/* 插嘴气泡弹跳进入动画 */
.chime-in-enter-active {
  animation: chime-bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.chime-in-leave-active {
  animation: chime-fade-out 0.3s ease;
}

@keyframes chime-bounce-in {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.9);
  }
  60% {
    opacity: 1;
    transform: translateY(-4px) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes chime-fade-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(10px);
  }
}

@keyframes chime-wiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-8deg); }
  75% { transform: rotate(8deg); }
}
</style>
