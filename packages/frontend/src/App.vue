<template>
  <div class="app-container" ref="appContainerRef">
    <!-- ============================================================ -->
    <!-- 侧边栏：保持不变，包含Live2D头像、品牌、认证、通话按钮 -->
    <!-- ============================================================ -->
    <AppSidebar @openAuth="showAuthModal = true">
      <template #avatar>
        <Live2DAvatar />
      </template>
    </AppSidebar>

    <!-- ============================================================ -->
    <!-- 主内容区域：闲聊区 + 分隔条 + 工作区 -->
    <!-- ============================================================ -->
    <div class="main-content">
      <!-- 闲聊区（左侧） -->
      <main
        class="chat-area"
        :style="chatAreaStyle"
      >
        <ChatHeader
          @upload-click="openImagePicker"
          @clear-chat="handleClearChat"
          @open-growth="showGrowthModal = true"
          @open-tasks="showTaskCenter = true"
          @open-plans="showPlans = true"
          @open-memory="showMemoryPanel = true"
          @open-history="showHistoryPanel = true"
          @system-control="showSystemControl = true"
        />
        <ChatMessages @suggest="handleSend" @upload="handleUploadFromWelcome" />
        <FileUpload ref="fileUploadRef" @image-selected="handleImageSelected" @image-cleared="handleImageCleared" @code-selected="handleCodeSelected" />
        <TextInput @send="handleSend" @image-btn-click="openImagePicker" />
      </main>

      <!-- 可拖拽分隔条（闲聊区与工作区之间） -->
      <DragDivider :containerWidth="mainContentWidth" />

      <!-- 工作区面板（右侧，小牛工作台） -->
      <WorkPanel />
    </div>
  </div>

  <!-- ============================================================ -->
  <!-- 弹窗组件 -->
  <!-- ============================================================ -->
  <TaskCenter v-if="showTaskCenter" :visible="true" @close="showTaskCenter = false" />
  <GrowthModal v-if="showGrowthModal" :visible="true" @close="showGrowthModal = false" />
  <MemoryPanel v-if="showMemoryPanel" :visible="true" @close="showMemoryPanel = false" />
  <SystemControlPanel v-if="showSystemControl" :visible="true" @close="showSystemControl = false" />
  <HistoryPanel
    v-if="showHistoryPanel"
    :visible="true"
    @close="showHistoryPanel = false"
    @select="handleHistorySelect"
    @new="handleNewChat"
  />

  <!-- 计划面板（固定在右侧） -->
  <PlanPanel v-if="showPlans" :visible="showPlans" @close="showPlans = false" />

  <!-- 确认对话框 -->
  <ConfirmDialog ref="confirmDialogRef" />

  <!-- 认证弹窗 -->
  <Teleport to="body">
    <div v-if="showAuthModal" class="auth-overlay" @click.self="showAuthModal = false">
      <div class="auth-modal">
        <div class="auth-modal-header">
          <h3>{{ isRegister ? '注册' : '登录' }}</h3>
          <button class="close-btn" @click="showAuthModal = false">✕</button>
        </div>
        <div class="auth-tabs">
          <button
            :class="['auth-tab', { active: !isRegister }]"
            @click="isRegister = false"
          >登录</button>
          <button
            :class="['auth-tab', { active: isRegister }]"
            @click="isRegister = true"
          >注册</button>
        </div>
        <form @submit.prevent="handleAuth" class="auth-form">
          <input
            v-model="authUsername"
            type="text"
            placeholder="用户名"
            required
          />
          <input
            v-model="authPassword"
            type="password"
            placeholder="密码"
            required
          />
          <input
            v-if="isRegister"
            v-model="authPasswordConfirm"
            type="password"
            placeholder="确认密码"
            required
          />
          <p v-if="authError" class="auth-error">{{ authError }}</p>
          <button type="submit" class="auth-submit" :disabled="authLoading">
            {{ authLoading ? '...' : (isRegister ? '注册' : '登录') }}
          </button>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @file 根组件
 * @description 小梦前端根组件，实现双区布局：侧边栏 | 闲聊区 | 可拖拽分隔条 | 工作区
 *              侧边栏保持不变，闲聊区和工作区宽度可通过分隔条拖拽调整
 * @module App
 * @version 2.1.0
 * @date 2026-06-06
 */

// 导入Vue核心API
import { ref, computed, onMounted, onUnmounted } from 'vue'
// 导入状态管理Store
import { useAppStore } from './stores/app'
import { useAuthStore } from './stores/auth'
import { useChatStore } from './stores/chat'
import { useWorkerStore } from './stores/worker'
// 导入组合式函数
import { useTaskStream } from './composables/useTaskStream'
import { useWebSocket } from './composables/useWebSocket'

// 导入侧边栏组件
import AppSidebar from './components/sidebar/AppSidebar.vue'
import Live2DAvatar from './components/sidebar/Live2DAvatar.vue'
// 导入聊天区域组件
import ChatHeader from './components/chat/ChatHeader.vue'
import ChatMessages from './components/chat/ChatMessages.vue'
import TextInput from './components/chat/TextInput.vue'
import FileUpload from './components/chat/FileUpload.vue'
// 导入工作区组件
import DragDivider from './components/work/DragDivider.vue'
import WorkPanel from './components/work/WorkPanel.vue'
// 导入通用弹窗组件
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import TaskCenter from './components/common/TaskCenter.vue'
import GrowthModal from './components/common/GrowthModal.vue'
import MemoryPanel from './components/common/MemoryPanel.vue'
import HistoryPanel from './components/common/HistoryPanel.vue'
import SystemControlPanel from './components/common/SystemControlPanel.vue'
import PlanPanel from './components/plan/PlanPanel.vue'

// 初始化状态管理Store
const appStore = useAppStore() // 应用全局状态
const authStore = useAuthStore() // 认证状态
const chatStore = useChatStore() // 聊天状态
const workerStore = useWorkerStore() // 工作区状态
// 初始化任务流处理
const { sendStreamText } = useTaskStream()

// 初始化 WebSocket 连接，监听任务事件并驱动工作区面板
useWebSocket({
  /** 任务排队：展开工作区，显示"开工"状态 */
  onTaskQueued(task) {
    workerStore.startTask(task.id, task.command)
    workerStore.addLog(`任务已排队: ${task.command}`, 'info')
  },
  /** 任务开始：切换到"工作中"状态 */
  onTaskStarted(task) {
    workerStore.setWorkerStatus('working')
    workerStore.addLog(`小牛开始干活: ${task.command}`, 'info')
  },
  /** 任务完成：显示结果 */
  onTaskCompleted(task) {
    // useWebSocket 会优先把后端返回的 task.result 写进工作区。
    // 这里仅在后端没有返回结果时显示兜底文案，避免把真实文件路径、
    // 下载链接或错误详情覆盖成泛化的“已完成”。
    if (!task.result && !workerStore.taskResult) {
      workerStore.setTaskResult({
        type: 'text',
        content: task.command + ' 已完成'
      })
    }
    workerStore.addLog(`任务完成，耗时 ${task.duration}ms`, 'success')
  },
  /** 任务失败 */
  onTaskFailed(task) {
    workerStore.setWorkerStatus('stuck')
    workerStore.addLog(`任务失败: ${task.error}`, 'error')
  },
  /** 任务降级 */
  onTaskDegraded(task) {
    workerStore.addLog(`任务降级: ${task.reason}`, 'warn')
  },
  /** 步骤进度更新 */
  onTaskStepProgress(step) {
    if (typeof step.stepIndex !== 'number') {
      return
    }

    const statusMap: Record<string, string> = {
      starting: '启动中',
      running: '执行中',
      completed: '已完成',
      asking: '等待确认',
      thinking: '思考中'
    }
    const label = statusMap[step.status] || step.status
    workerStore.addLog(`${step.action || step.desc || `步骤${step.stepIndex + 1}`}: ${label}`, 'info')
    // 更新进度
    if (typeof step.totalSteps === 'number' && step.totalSteps > 0) {
      const pct = Math.round(((step.stepIndex + 1) / step.totalSteps) * 100)
      workerStore.updateProgress(pct)
    }
  },
  /** 任务进度更新 */
  onTaskProgress(progress) {
    const pct = Math.round((progress.current / progress.total) * 100)
    workerStore.updateProgress(pct)
  }
})

// ============================================================
// 布局响应式计算
// ============================================================

/** 应用容器DOM引用 */
const appContainerRef = ref<HTMLElement | null>(null)

/** 主内容区域宽度（= 容器总宽 - 侧边栏400px） */
const mainContentWidth = ref(window.innerWidth - 400)

/**
 * 计算闲聊区样式
 * 工作区折叠时占满，展开时用flex分配空间
 */
const chatAreaStyle = computed(() => {
  if (!workerStore.isExpanded) {
    // 折叠时占满全部空间
    return { flex: '1 1 100%' }
  }
  // 展开时按比例分配，使用 flex-grow 控制
  // chatRatio 范围 0.3~0.7，对应 flex-grow 值
  return { flex: `${workerStore.chatRatio} 1 0%` }
})

/**
 * 监听窗口大小变化，更新主内容区域宽度
 * 用于分隔条拖拽时计算正确的占比
 */
function handleResize() {
  if (appContainerRef.value) {
    // 主内容宽度 = 容器总宽 - 侧边栏宽度(400px)
    mainContentWidth.value = appContainerRef.value.offsetWidth - 400
  }
}

// 组件挂载时添加resize监听，并初始化会话
onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize)
  // 初始化会话（与后端同步历史消息）
  chatStore.initSession()
})

// 组件卸载时移除resize监听
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// ============================================================
// 组件引用与弹窗状态
// ============================================================

const confirmDialogRef = ref<InstanceType<typeof ConfirmDialog> | null>(null) // 确认对话框引用
const fileUploadRef = ref<InstanceType<typeof FileUpload> | null>(null) // 文件上传组件引用

// 弹窗显示状态
const showAuthModal = ref(false) // 显示认证弹窗
const showTaskCenter = ref(false) // 显示任务中心
const showGrowthModal = ref(false) // 显示成长旅程
const showMemoryPanel = ref(false) // 显示记忆面板
const showHistoryPanel = ref(false) // 显示历史记录
const showSystemControl = ref(false) // 显示电脑控制
const showPlans = ref(false) // 显示计划面板
// 认证表单状态
const isRegister = ref(false) // 是否为注册模式
const authUsername = ref('') // 用户名输入
const authPassword = ref('') // 密码输入
const authPasswordConfirm = ref('') // 确认密码输入
const authError = ref('') // 认证错误信息
const authLoading = ref(false) // 认证加载状态

/** 待发送的图片数据 */
let pendingImage: { base64: string; mimeType: string; name: string } | null = null

// ============================================================
// 事件处理函数
// ============================================================

/**
 * 处理发送消息
 * @param text - 用户输入的文本内容
 */
function handleSend(text: string) {
  // 先添加用户消息到聊天记录
  chatStore.addMessage('user', text)
  // 调用流式API发送消息
  sendStreamText(text, {
    image: pendingImage || undefined
  })
  // 发送后清除待发送图片
  pendingImage = null
}

/**
 * 处理图片选择事件
 * @param image - 选择的图片数据
 */
function handleImageSelected(image: { base64: string; mimeType: string; name: string }) {
  pendingImage = image
}

/**
 * 处理图片清除事件
 */
function handleImageCleared() {
  pendingImage = null
}

/**
 * 处理代码文件选择事件
 * @param code - 代码文件内容
 * @param extension - 文件扩展名
 */
function handleCodeSelected(code: string, extension: string) {
  // 超长代码截断显示
  const display = code.length > 800
    ? code.slice(0, 560) + '\n... (内容过长已截断) ...\n' + code.slice(-240)
    : code
  // 构造发送文本
  const text = `请分析这个代码文件\n\n\`\`\`${extension}\n${display}\n\`\`\``
  chatStore.addMessage('user', text)
  sendStreamText(text)
}

/**
 * 打开图片选择器
 */
function openImagePicker() {
  fileUploadRef.value?.openImagePicker()
}

/**
 * 清空当前对话
 */
function handleClearChat() {
  chatStore.clearMessages()
}

/**
 * 处理欢迎页的上传按钮点击
 * @param type - 上传类型（image/pdf等）
 */
function handleUploadFromWelcome(type: string) {
  if (type === 'image') {
    openImagePicker()
  } else {
    // Guardrail: unsupported upload types must not be advertised as "coming
    // soon". Put an explicit unavailable state into the chat so users do not
    // assume a real parser/executor exists behind this button.
    chatStore.addMessage('assistant', `"分析${type.toUpperCase()}" 暂不可用：当前只接入了图片和代码文件处理。`)
  }
}

/**
 * 处理历史记录选择（切换到指定会话）
 * @param id - 会话ID
 */
async function handleHistorySelect(id: string) {
  await chatStore.switchSession(id)
}

/**
 * 创建新对话
 */
async function handleNewChat() {
  await chatStore.createNewSession()
}

/**
 * 处理认证表单提交（登录/注册）
 */
async function handleAuth() {
  authError.value = ''

  // 验证必填项
  if (!authUsername.value || !authPassword.value) {
    authError.value = '请填写用户名和密码'
    return
  }

  // 注册模式验证确认密码
  if (isRegister.value && authPassword.value !== authPasswordConfirm.value) {
    authError.value = '两次输入的密码不一致'
    return
  }

  authLoading.value = true
  // 根据模式调用注册或登录
  const success = isRegister.value
    ? await authStore.register(authUsername.value, authPassword.value)
    : await authStore.login(authUsername.value, authPassword.value)
  authLoading.value = false

  if (success) {
    // 认证成功，关闭弹窗并清空表单
    showAuthModal.value = false
    authUsername.value = ''
    authPassword.value = ''
    authPasswordConfirm.value = ''
  } else {
    // 认证失败，显示错误信息
    authError.value = authStore.error || (isRegister.value ? '注册失败' : '登录失败')
  }
}
</script>

<style>
/* 全局样式重置 */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-main), var(--font-emoji);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.55;
  background: var(--surface-canvas);
  color: var(--text-body);
  height: 100vh;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* emoji 专用样式（不干扰 FontAwesome 图标） */
.emoji {
  font-family: var(--font-emoji);
}
</style>

<style scoped>
/* === 应用容器：侧边栏 + 主内容区域 === */
.app-container {
  display: flex;
  height: 100vh;
  background: var(--surface-canvas);
}

/* === 主内容区域：闲聊区 + 分隔条 + 工作区 === */
.main-content {
  flex: 1;
  display: flex;
  min-width: 0;
  position: relative;
}

/* === 闲聊区 === */
.chat-area {
  display: flex;
  flex-direction: column;
  min-width: 280px;
  /* flex 值由 chatAreaStyle 计算属性控制 */
  transition: flex 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 认证弹窗 */
.auth-overlay {
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
}

.auth-modal {
  background: var(--surface-canvas);
  border-radius: var(--radius-xl);
  padding: var(--sp-lg);
  width: 360px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.auth-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-md);
}

.auth-modal-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-dim);
  cursor: pointer;
}

.auth-tabs {
  display: flex;
  gap: var(--sp-xs);
  margin-bottom: var(--sp-md);
}

.auth-tab {
  flex: 1;
  padding: var(--sp-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.auth-tab.active {
  background: var(--accent-coral);
  color: white;
  border-color: var(--accent-coral);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
}

.auth-form input {
  padding: var(--sp-sm) var(--sp-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 14px;
  outline: none;
  background: var(--surface-soft);
  color: var(--text-primary);
}

.auth-form input:focus {
  border-color: var(--accent-coral);
}

.auth-error {
  color: #c64545;
  font-size: 13px;
  margin: 0;
}

.auth-submit {
  padding: var(--sp-sm) var(--sp-lg);
  background: var(--accent-coral);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.auth-submit:hover:not(:disabled) {
  background: var(--accent-coral-active);
}

.auth-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
