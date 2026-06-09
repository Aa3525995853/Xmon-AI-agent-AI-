/**
 * @file 人格切换
 * @description 人格切换组件，支持在多种性格之间切换
 * @module components/sidebar/PersonalitySwitcher
 */

<template>
  <div class="personality-switcher">
    <div class="switcher-label">人格</div>
    <div class="switcher-options">
      <button
        v-for="p in personalities"
        :key="p.id"
        :class="['personality-btn', { active: currentPersonality === p.id }]"
        :title="p.label"
        @click="switchPersonality(p.id)"
      >
        <span class="p-icon">{{ p.icon }}</span>
        <span class="p-label">{{ p.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia' // 导入Pinia状态管理工具
import { useAppStore } from '../../stores/app' // 导入应用状态管理
import type { Personality } from '../../types' // 导入人格类型定义

/** 可用的人格配置列表 */
const personalities: { id: Personality; icon: string; label: string }[] = [
  { id: 'normal',   icon: '😊', label: '正常' }, // 正常人格
  { id: 'bad',      icon: '😏', label: '毒舌' }, // 毒舌人格
  { id: 'cute',     icon: '🥰', label: '可爱' }, // 可爱人格
  { id: 'gentle',   icon: '🌸', label: '温柔' }, // 温柔人格
  { id: 'obedient', icon: '🧸', label: '乖巧' } // 乖巧人格
]

/** 应用状态管理实例 */
const appStore = useAppStore()
/** 从store解构当前人格状态 */
const { personality: currentPersonality } = storeToRefs(appStore)

/**
 * 切换当前人格
 * @param id - 目标人格的ID
 */
function switchPersonality(id: Personality) {
  appStore.setPersonality(id) // 调用store方法更新人格
}
</script>

<style scoped>
.personality-switcher {
  padding: var(--sp-sm) var(--sp-lg);
}

.switcher-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-dim);
  margin-bottom: var(--sp-xs);
}

.switcher-options {
  display: flex;
  gap: var(--sp-xs);
  flex-wrap: wrap;
}

.personality-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.personality-btn:hover {
  background: var(--surface-card);
  border-color: var(--accent-coral);
}

.personality-btn.active {
  background: var(--accent-coral);
  color: white;
  border-color: var(--accent-coral);
}

.p-icon {
  font-size: 14px;
}

.p-label {
  font-size: 12px;
}
</style>
