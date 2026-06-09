/**
 * @file 侧边栏
 * @description 应用侧边栏组件，只包含：Live2D头像区、角色信息、通话按钮、新对话按钮
 * @module components/sidebar/AppSidebar
 */

<template>
  <aside class="sidebar">
    <!-- 头部：品牌 + 认证 -->
    <div class="sidebar-header">
      <div class="sidebar-logo">🌙</div>
      <div class="sidebar-brand-group">
        <div class="sidebar-brand">小梦</div>
        <div class="sidebar-brand-sub">COMPANION</div>
      </div>
      <div class="sidebar-auth">
        <template v-if="isAuthenticated">
          <div class="auth-user-info">
            <i class="fas fa-user"></i>
            <span class="username">{{ currentUser?.username }}</span>
            <button class="auth-logout-btn" @click="handleLogout" title="退出登录">
              <i class="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </template>
        <template v-else>
          <button class="auth-btn auth-login-btn" @click="$emit('openAuth')">
            <i class="fas fa-sign-in-alt"></i> 登录
          </button>
        </template>
      </div>
    </div>

    <!-- Live2D 头像区域 -->
    <div class="avatar-container">
      <slot name="avatar"></slot>
    </div>

    <!-- 底部：通话/新对话按钮 -->
    <div class="sidebar-bottom">
      <!-- 操作按钮 -->
      <div class="sidebar-actions">
        <button
          :class="['call-btn', { active: isListening }]"
          @click="$emit('toggleVoice')"
        >
          <i :class="['fas', isListening ? 'fa-stop' : 'fa-microphone']"></i>
          {{ isListening ? '停止' : '语音通话' }}
        </button>
        <button class="new-chat-btn" @click="$emit('newChat')">
          <i class="fas fa-plus"></i> 新对话
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia' // 导入Pinia状态管理工具
import { useAppStore } from '../../stores/app' // 导入应用状态管理
import { useAuthStore } from '../../stores/auth' // 导入认证状态管理

/** 组件事件定义 */
defineEmits<{
  (e: 'openAuth'): void // 打开认证弹窗
  (e: 'toggleVoice'): void // 切换语音通话
  (e: 'newChat'): void // 创建新对话
}>()

/** 应用状态管理实例 */
const appStore = useAppStore()
/** 认证状态管理实例 */
const authStore = useAuthStore()

/** 从认证store解构响应式状态 */
const { isAuthenticated, currentUser } = storeToRefs(authStore)
/** 从应用store解构响应式状态 */
const { isListening } = storeToRefs(appStore)

/**
 * 处理退出登录
 */
async function handleLogout() {
  await authStore.logout() // 调用store的logout方法
}
</script>

<style scoped>
.sidebar {
  width: 400px;
  min-width: 400px;
  max-width: 400px;
  background: var(--surface-soft);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* --- 头部 --- */
.sidebar-header {
  width: 100%;
  height: 72px;
  display: flex;
  align-items: center;
  gap: var(--sp-md);
  padding: 0 var(--sp-xl);
  background: var(--surface-canvas);
  flex-shrink: 0;
  z-index: 10;
}

.sidebar-logo {
  width: 40px;
  height: 40px;
  background: var(--surface-dark);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--on-dark);
  font-size: 16px;
  flex-shrink: 0;
}

.sidebar-brand-group {
  display: flex;
  flex-direction: column;
}

.sidebar-brand {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 400;
  letter-spacing: -0.5px;
  color: var(--text-primary);
  line-height: 1;
}

.sidebar-brand-sub {
  font-family: var(--font-main);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-top: 2px;
}

.sidebar-auth {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--sp-xs);
}

.auth-btn {
  padding: 4px 12px;
  border: none;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.auth-login-btn {
  background: var(--accent-coral);
  color: white;
}

.auth-login-btn:hover {
  background: var(--accent-coral-active);
}

.auth-user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: var(--surface-card);
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--text-secondary);
}

.auth-user-info .username {
  font-weight: 500;
  color: var(--text-primary);
}

.auth-logout-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  transition: all var(--transition-fast);
}

.auth-logout-btn:hover {
  background: rgba(198, 69, 69, 0.1);
  color: #c64545;
}

/* --- Live2D 头像区域 --- */
.avatar-container {
  position: relative;
  width: 100%;
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 0;
  background: var(--surface-canvas);
  overflow: hidden;
}

.avatar-container::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(transparent, var(--surface-canvas));
  pointer-events: none;
  z-index: 2;
}

.avatar-wrapper {
  width: 100%;
  height: 100%;
  border-radius: 0;
  overflow: hidden;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

/* --- 底部区域 --- */
.sidebar-bottom {
  width: 100%;
  padding: var(--sp-lg) var(--sp-xl) var(--sp-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-md);
  background: var(--surface-canvas);
  flex-shrink: 0;
}

/* --- 操作按钮 --- */
.sidebar-actions {
  display: flex;
  gap: var(--sp-sm);
  width: 100%;
}

.call-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-xs);
  padding: 0 20px;
  height: 48px;
  background: var(--accent-coral);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  font-family: var(--font-main);
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);
}

.call-btn:hover {
  background: var(--accent-coral-active);
  transform: translateY(-1px);
}

.call-btn:active {
  transform: translateY(0);
}

.call-btn.active {
  background: #c64545;
  animation: pulse-call 1.5s infinite;
}

@keyframes pulse-call {
  0%, 100% { box-shadow: 0 0 0 0 rgba(198, 69, 69, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(198, 69, 69, 0); }
}

.new-chat-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-xs);
  padding: 0 20px;
  height: 48px;
  background: var(--surface-canvas);
  color: var(--text-primary);
  border: 1px solid rgba(230, 223, 216, 0.6);
  border-radius: var(--radius-lg);
  font-family: var(--font-main);
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);
}

.new-chat-btn:hover {
  background: var(--surface-card);
  transform: translateY(-1px);
}

.new-chat-btn:active {
  transform: translateY(0);
}
</style>
