/**
 * @file 消息渲染
 * @description 单条消息渲染组件，支持 Markdown、代码高亮、图片等
 * @module components/chat/MessageRenderer
 */

<template>
  <div :class="['msg-group', message.role]">
    <div class="msg-content">
      <div class="msg-bubble" v-html="renderedContent"></div>
      <div class="msg-time">{{ formattedTime }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { processCodeBlocks, escapeHtml } from '../../utils/format'
import type { Message } from '../../types'

const props = defineProps<{
  /** 消息对象 */
  message: Message
}>()

/** 渲染后的消息内容 */
const renderedContent = computed(() => {
  if (props.message.role === 'assistant') {
    try {
      return processCodeBlocks(props.message.text)
    } catch {
      return escapeHtml(props.message.text)
    }
  }
  return escapeHtml(props.message.text)
})

/** 格式化的时间 */
const formattedTime = computed(() => {
  const d = new Date(props.message.timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
})
</script>

<style scoped>
.msg-group {
  display: flex;
  max-width: 80%;
}

.msg-group.user {
  align-self: flex-end;
}

.msg-group.assistant {
  align-self: flex-start;
}

.msg-bubble {
  padding: var(--sp-sm) var(--sp-md);
  border-radius: var(--radius-lg);
  line-height: 1.5;
  word-break: break-word;
}

.msg-group.user .msg-bubble {
  background: var(--bg-msg-user);
  color: white;
  border-bottom-right-radius: var(--radius-xs);
}

.msg-group.assistant .msg-bubble {
  background: var(--bg-msg-assistant);
  color: var(--text-body);
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
</style>
