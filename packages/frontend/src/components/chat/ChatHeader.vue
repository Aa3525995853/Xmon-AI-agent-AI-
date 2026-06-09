/**
 * @file 聊天区头部操作栏
 * @description 聊天区域顶部的操作按钮栏，包含人格切换、成长旅程、语音、上传、任务、记忆、清空、历史等
 * @module components/chat/ChatHeader
 */

<template>
  <div class="chat-header">
    <div class="chat-header-left">
      <div class="chat-header-dot" :class="statusClass"></div>
      <span class="chat-header-title">{{ chatTitle }}</span>
    </div>
    <div class="chat-header-actions">
      <!-- 人格选择器 -->
      <div class="personality-selector">
        <button class="header-action-btn personality-trigger" @click="showPersonalityDropdown = !showPersonalityDropdown" data-tooltip="选择性格">
          <i class="fas fa-theater-masks"></i>
          <span class="persona-badge">{{ personalityLabel }}</span>
        </button>
        <div v-if="showPersonalityDropdown" class="personality-dropdown">
          <div
            v-for="p in personalities"
            :key="p.id"
            :class="['personality-option', { selected: currentPersonality === p.id }]"
            @click="switchPersonality(p.id)"
          >
            <span class="personality-emoji">{{ p.icon }}</span>
            <div class="personality-info">
              <span class="personality-name">{{ p.label }}</span>
              <span class="personality-desc">{{ p.desc }}</span>
            </div>
            <i v-if="currentPersonality === p.id" class="fas fa-check personality-check"></i>
          </div>
        </div>
      </div>

      <!-- 成长旅程 -->
      <button class="header-action-btn growth-btn" data-tooltip="成长旅程" @click="$emit('openGrowth')">
        <i class="fas fa-heart"></i>
      </button>

      <div class="action-divider"></div>

      <!-- 语音播报 -->
      <button class="header-action-btn" :data-tooltip="voiceEnabled ? '关闭语音' : '语音播报'" @click="appStore.toggleVoice()">
        <i :class="['fas', voiceEnabled ? 'fa-volume-up' : 'fa-volume-mute']"></i>
      </button>

      <!-- 上传分析 -->
      <button class="header-action-btn" data-tooltip="上传分析" @click="$emit('uploadClick')">
        <i class="fas fa-file-import"></i>
      </button>

      <div class="action-divider"></div>

      <!-- 电脑控制 -->
      <button class="header-action-btn" data-tooltip="电脑控制" @click="$emit('systemControl')">
        <i class="fas fa-desktop"></i>
      </button>

      <!-- 任务中心 -->
      <button class="header-action-btn" data-tooltip="任务中心" @click="$emit('openTasks')">
        <i class="fas fa-tasks"></i>
      </button>

      <!-- 我的计划 -->
      <button class="header-action-btn" data-tooltip="我的计划" @click="$emit('openPlans')">
        <i class="fas fa-clipboard-list"></i>
      </button>

      <!-- 小牛工作台 -->
      <button
        :class="['header-action-btn', { 'worker-active': workerStore.isExpanded }]"
        :data-tooltip="workerStore.isExpanded ? '收起工作台' : '小牛工作台'"
        @click="workerStore.togglePanel()"
      >
        <span class="worker-icon">🐮</span>
      </button>

      <!-- 小梦的记忆 -->
      <button class="header-action-btn" data-tooltip="小梦的记忆" @click="$emit('openMemory')">
        <i class="fas fa-brain"></i>
      </button>

      <div class="action-divider"></div>

      <!-- 清空对话 -->
      <button class="header-action-btn" data-tooltip="清空对话" @click="$emit('clearChat')">
        <i class="fas fa-trash"></i>
      </button>

      <div class="action-divider"></div>

      <!-- 历史记录 -->
      <button class="header-action-btn" data-tooltip="历史记录" @click="$emit('openHistory')">
        <i class="fas fa-clock-rotate-left"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue' // 导入Vue响应式API
import { storeToRefs } from 'pinia' // 导入Pinia状态管理工具
import { useAppStore } from '../../stores/app' // 导入应用状态管理
import { useWorkerStore } from '../../stores/worker' // 导入工作区状态管理
import type { Personality } from '../../types' // 导入人格类型定义

/** 组件事件定义 */
defineEmits<{
  (e: 'openGrowth'): void // 打开成长旅程弹窗
  (e: 'uploadClick'): void // 打开上传功能
  (e: 'systemControl'): void // 打开电脑控制
  (e: 'openTasks'): void // 打开任务中心
  (e: 'openPlans'): void // 打开我的计划
  (e: 'openMemory'): void // 打开记忆面板
  (e: 'clearChat'): void // 清空当前对话
  (e: 'openHistory'): void // 打开历史记录
}>()

/** 应用状态管理实例 */
const appStore = useAppStore()
/** 工作区状态管理实例 */
const workerStore = useWorkerStore()
/** 从store中解构当前人格和语音开关状态 */
const { personality: currentPersonality, voiceEnabled } = storeToRefs(appStore)

/** 是否显示人格选择下拉菜单 */
const showPersonalityDropdown = ref(false)

/** 可用人格配置列表 */
const personalities: { id: Personality; icon: string; label: string; desc: string }[] = [
  { id: 'normal',   icon: '😊', label: '正常', desc: '温暖亲切的小梦' }, // 正常模式人格
  { id: 'bad',      icon: '😏', label: '毒舌', desc: '高反差神回复' }, // 毒舌模式人格
  { id: 'cute',     icon: '🥰', label: '可爱', desc: '软萌撒娇小梦' }, // 可爱模式人格
  { id: 'gentle',   icon: '🌸', label: '温柔', desc: '善解人意的知心姐姐' }, // 温柔模式人格
  { id: 'obedient', icon: '🍃', label: '乖巧', desc: '懂事小梦带点小心机' } // 乖巧模式人格
]

/** 计算当前选中的人格显示标签 */
const personalityLabel = computed(() => {
  return personalities.find(p => p.id === currentPersonality.value)?.label || '正常'
})

/** 计算状态点的样式类（在线/空闲） */
const statusClass = computed(() => {
  return voiceEnabled.value ? 'online' : 'idle'
})

/** 聊天标题（显示当前对话主题） */
const chatTitle = computed(() => '帮我写一篇社媒文章...')

/**
 * 切换当前人格
 * @param id - 要切换到的人格ID
 */
function switchPersonality(id: Personality) {
  appStore.setPersonality(id) // 更新store中的人格设置
  showPersonalityDropdown.value = false // 切换后关闭下拉菜单
}
</script>

<style scoped>
/* ============================================================
   聊天区头部操作栏 - 恢复原版UI设计
   ============================================================ */

.chat-header {
  width: 100%;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--sp-xl);
  background: var(--surface-canvas);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
}

.chat-header-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
}

.chat-header-dot.online {
  background: var(--accent-green);
  box-shadow: 0 0 0 2px rgba(93, 184, 114, 0.2);
}

.chat-header-dot.idle {
  background: var(--text-dim);
}

.chat-header-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.action-divider {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 6px;
  flex-shrink: 0;
}

/* --- 通用操作按钮 --- */
.header-action-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  position: relative;
  font-size: 14px;
}

.header-action-btn:hover {
  background: var(--surface-card);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.header-action-btn:active {
  transform: translateY(0) scale(0.95);
}

/* tooltip */
.header-action-btn[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  background: var(--surface-dark);
  color: var(--on-dark);
  font-family: var(--font-main);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 100;
}

.header-action-btn:hover[data-tooltip]::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* --- 人格选择器 --- */
.personality-selector {
  position: relative;
}

.personality-trigger {
  width: auto;
  padding: 0 var(--sp-sm);
  gap: var(--sp-xxs);
}

.persona-badge {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.personality-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--surface-canvas);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--sp-xs);
  min-width: 220px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  z-index: 200;
  animation: dropdownEnter 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes dropdownEnter {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.personality-option {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: var(--sp-sm) var(--sp-md);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.personality-option:hover {
  background: var(--surface-card);
}

.personality-option.selected {
  background: var(--surface-cream-strong);
}

.personality-emoji {
  font-size: 20px;
  flex-shrink: 0;
}

.personality-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.personality-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.personality-desc {
  font-size: 12px;
  color: var(--text-dim);
}

.personality-check {
  color: var(--accent-coral);
  font-size: 12px;
}

/* --- 成长按钮特殊样式 --- */
.growth-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 0;
}

.growth-btn:hover {
  background: var(--surface-card);
  color: var(--accent-coral);
}

.growth-btn i {
  font-size: 14px;
}

/* --- 小牛工作台按钮 --- */
.worker-icon {
  font-size: 16px;
  line-height: 1;
}

.header-action-btn.worker-active {
  background: var(--accent-teal);
  color: white;
  border-radius: var(--radius-sm);
}

.header-action-btn.worker-active:hover {
  background: var(--accent-teal);
  opacity: 0.9;
}
</style>
