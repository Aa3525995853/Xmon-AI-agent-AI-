/**
 * @file 成长旅程
 * @description 成长旅程弹窗，从后端API获取关系阶段、里程碑、解锁内容等数据并展示
 * @module components/common/GrowthModal
 * @version 2.0.0
 * @date 2026-06-08
 */

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">
            <i class="fas fa-heart"></i>
            <span>成长旅程</span>
          </div>
          <button class="modal-close" @click="handleClose">✕</button>
        </div>
        <div class="modal-body">
          <!-- 加载状态 -->
          <div v-if="loading" class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">加载中...</div>
          </div>

          <!-- 错误状态 -->
          <div v-else-if="error" class="error-state">
            <div class="error-icon">⚠️</div>
            <div class="error-text">{{ error }}</div>
            <button class="btn btn-secondary" @click="fetchGrowthData">重试</button>
          </div>

          <template v-else>
            <!-- 当前阶段 -->
            <div class="stage-card" :class="`stage-${growthStatus.stage}`">
              <div class="stage-icon">{{ stageIcon }}</div>
              <div class="stage-info">
                <div class="stage-name">{{ growthStatus.stageName }}</div>
                <div class="stage-desc">{{ stageDesc }}</div>
                <div class="stage-progress">
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      :style="{ width: progressPercent + '%' }"
                    ></div>
                  </div>
                  <div class="progress-text">{{ growthStatus.points }} 积分</div>
                </div>
              </div>
            </div>

            <!-- 称呼信息 -->
            <div class="address-card" v-if="addressText">
              <div class="address-label">小梦叫你</div>
              <div class="address-value">{{ addressText }}</div>
            </div>

            <!-- 里程碑 -->
            <div class="milestone-section">
              <div class="section-title">里程碑</div>
              <div class="milestone-list">
                <div
                  v-for="ms in milestoneList"
                  :key="ms.id"
                  class="milestone-item"
                  :class="{ unlocked: isMilestoneAchieved(ms.id), locked: !isMilestoneAchieved(ms.id) }"
                >
                  <div class="milestone-icon">{{ getMilestoneIcon(ms.type) }}</div>
                  <div class="milestone-info">
                    <div class="milestone-name">{{ ms.name }}</div>
                    <div class="milestone-points">{{ ms.points }} 积分</div>
                  </div>
                  <i v-if="isMilestoneAchieved(ms.id)" class="fas fa-check-circle milestone-check"></i>
                  <i v-else class="fas fa-lock milestone-lock"></i>
                </div>
              </div>
            </div>

            <!-- 解锁内容 -->
            <div class="unlock-section" v-if="unlockedList.length > 0">
              <div class="section-title">已解锁</div>
              <div class="unlock-list">
                <div
                  v-for="item in unlockedList"
                  :key="item.id"
                  class="unlock-item"
                >
                  <div class="unlock-icon">✨</div>
                  <div class="unlock-info">
                    <div class="unlock-name">{{ item.name }}</div>
                    <div class="unlock-desc">{{ item.description }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 下一个里程碑提示 -->
            <div class="next-milestone" v-if="growthStatus.nextMilestone">
              <div class="next-label">下一个目标</div>
              <div class="next-name">{{ growthStatus.nextMilestone.name }}</div>
              <div class="next-progress">
                还需 {{ growthStatus.nextMilestone.points - growthStatus.points }} 积分
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

/** 组件属性 - 控制弹窗显示 */
const props = defineProps<{ visible: boolean }>()
/** 组件事件 */
const emit = defineEmits<{ (e: 'close'): void }>()

/** 加载状态 */
const loading = ref(false)
/** 错误信息 */
const error = ref('')

/** 成长状态数据 */
const growthStatus = ref<any>({
  stage: 'stranger',
  stageName: '陌生人',
  level: 0,
  points: 0,
  nextMilestone: null,
  unlocked: []
})

/** 里程碑定义列表 */
const milestoneList = ref<any[]>([])

/** 解锁内容列表 */
const unlockedList = ref<any[]>([])

/** 称呼文本 */
const addressText = ref('')

/** 已达成的里程碑ID集合 */
const achievedMilestoneIds = ref<Set<string>>(new Set())

/** 阶段图标映射 */
const STAGE_ICONS: Record<string, string> = {
  stranger: '👋',
  acquaintance: '😊',
  friend: '🤝',
  good_friend: '🌙',
  intimate: '💖'
}

/** 阶段描述映射 */
const STAGE_DESCS: Record<string, string> = {
  stranger: '初次相遇，还不了解彼此',
  acquaintance: '已经认识，开始熟悉起来',
  friend: '成为朋友，互相关心',
  good_friend: '关系亲密，无话不谈',
  intimate: '最亲密的伙伴，彼此信赖'
}

/** 阶段积分阈值（用于计算进度百分比） */
const STAGE_THRESHOLDS: Record<string, number> = {
  stranger: 0,
  acquaintance: 50,
  friend: 150,
  good_friend: 300,
  intimate: 500
}

/** 里程碑类型图标映射 */
const MILESTONE_ICONS: Record<string, string> = {
  meet: '👋',
  voice: '🎙️',
  chat: '💬',
  deep: '💭',
  happy: '😄',
  comfort: '🤗',
  streak: '🔥',
  personal: '🎁'
}

/** 当前阶段图标 */
const stageIcon = computed(() => STAGE_ICONS[growthStatus.value.stage] || '👋')

/** 当前阶段描述 */
const stageDesc = computed(() => STAGE_DESCS[growthStatus.value.stage] || '')

/** 进度百分比（当前阶段到下一阶段的进度） */
const progressPercent = computed(() => {
  const stages = Object.entries(STAGE_THRESHOLDS)
  const currentStage = growthStatus.value.stage
  const currentPoints = growthStatus.value.points

  // 找到当前阶段和下一阶段的阈值
  let currentThreshold = 0
  let nextThreshold = 500
  for (let i = 0; i < stages.length; i++) {
    if (stages[i][0] === currentStage) {
      currentThreshold = stages[i][1]
      nextThreshold = i + 1 < stages.length ? stages[i + 1][1] : stages[i][1]
      break
    }
  }

  // 计算当前阶段内的进度百分比
  const range = nextThreshold - currentThreshold
  if (range <= 0) return 100
  const progress = ((currentPoints - currentThreshold) / range) * 100
  return Math.min(Math.max(progress, 0), 100)
})

/**
 * 关闭弹窗
 */
function handleClose() {
  emit('close')
}

/**
 * 判断里程碑是否已达成
 * @param id - 里程碑ID
 * @returns 是否已达成
 */
function isMilestoneAchieved(id: string): boolean {
  return achievedMilestoneIds.value.has(id)
}

/**
 * 获取里程碑类型对应的图标
 * @param type - 里程碑类型
 * @returns 图标字符串
 */
function getMilestoneIcon(type: string): string {
  return MILESTONE_ICONS[type] || '🏆'
}

/**
 * 从后端API获取成长数据
 */
async function fetchGrowthData() {
  loading.value = true
  error.value = ''

  try {
    // 并行请求成长状态、里程碑、称呼、解锁内容
    const [statusRes, milestonesRes, addressRes, unlocksRes] = await Promise.all([
      fetch('/api/growth/status'),
      fetch('/api/growth/milestones'),
      fetch('/api/growth/address'),
      fetch('/api/growth/unlocks')
    ])

    // 解析成长状态
    if (statusRes.ok) {
      const statusData = await statusRes.json()
      if (statusData.success) {
        growthStatus.value = statusData
        // 从状态中提取已达成的里程碑ID
        // 后端 getStatus 不直接返回 milestones 列表，需要从状态文件中获取
        // 通过 unlocked 间接判断
      }
    }

    // 解析里程碑列表
    if (milestonesRes.ok) {
      const milestonesData = await milestonesRes.json()
      if (milestonesData.success) {
        milestoneList.value = milestonesData.milestones || []
      }
    }

    // 解析称呼信息（后端返回字符串或对象）
    if (addressRes.ok) {
      const addressData = await addressRes.json()
      if (addressData.success) {
        // getAddress() 可能返回字符串或对象，统一处理
        const addr = addressData.address
        addressText.value = typeof addr === 'string' ? addr : (addr?.casual || addr?.xiaomengCallUser || '')
      }
    }

    // 解析解锁内容
    if (unlocksRes.ok) {
      const unlocksData = await unlocksRes.json()
      if (unlocksData.success) {
        unlockedList.value = unlocksData.unlocks || []
      }
    }

    // 根据积分判断已达成哪些里程碑
    const currentPoints = growthStatus.value.points || 0
    const achieved = new Set<string>()
    for (const ms of milestoneList.value) {
      if (currentPoints >= ms.points) {
        achieved.add(ms.id)
      }
    }
    achievedMilestoneIds.value = achieved

  } catch (e: any) {
    console.error('[GrowthModal] 获取成长数据失败:', e)
    error.value = '获取成长数据失败，请检查网络连接'
  } finally {
    loading.value = false
  }
}

// 弹窗显示时自动加载数据
watch(() => props.visible, (newVal) => {
  if (newVal) {
    fetchGrowthData()
  }
})

// 组件挂载时若已可见，立即加载数据（v-if 重建组件时 watch 不会触发初始回调）
onMounted(() => {
  if (props.visible) {
    fetchGrowthData()
  }
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(24, 23, 21, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlayFade 0.2s ease;
}

@keyframes overlayFade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background: var(--surface-canvas);
  border-radius: var(--radius-xl);
  width: 90%;
  max-width: 520px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(24, 23, 21, 0.2);
  animation: modalEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes modalEnter {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp-lg) var(--sp-xl);
  border-bottom: 1px solid var(--border-color);
}

.modal-title {
  display: flex;
  align-items: center;
  gap: var(--sp-xs);
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: -0.3px;
  color: var(--text-primary);
}

.modal-title i {
  color: var(--accent-coral);
}

.modal-close {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--surface-card);
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

.modal-body {
  padding: var(--sp-xl);
  overflow-y: auto;
  max-height: calc(80vh - 72px);
}

/* 加载状态 */
.loading-state {
  text-align: center;
  padding: var(--sp-xxl) 0;
  color: var(--text-dim);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-coral);
  border-radius: 50%;
  margin: 0 auto var(--sp-md);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
}

/* 错误状态 */
.error-state {
  text-align: center;
  padding: var(--sp-xxl) 0;
  color: var(--text-dim);
}

.error-icon {
  font-size: 40px;
  margin-bottom: var(--sp-md);
  opacity: 0.6;
}

.error-text {
  font-size: 14px;
  margin-bottom: var(--sp-md);
  color: var(--text-secondary);
}

/* 阶段卡片 */
.stage-card {
  background: var(--surface-dark);
  border-radius: var(--radius-lg);
  padding: var(--sp-xl);
  margin-bottom: var(--sp-lg);
  display: flex;
  align-items: flex-start;
  gap: var(--sp-md);
  color: var(--on-dark);
}

.stage-icon {
  font-size: 40px;
  flex-shrink: 0;
}

.stage-info {
  flex: 1;
  min-width: 0;
}

.stage-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 400;
  color: var(--on-dark);
  margin-bottom: 4px;
}

.stage-desc {
  font-size: 14px;
  color: var(--on-dark-soft);
  margin-bottom: var(--sp-sm);
}

.stage-progress {
  margin-top: var(--sp-sm);
}

.progress-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-coral), var(--accent-amber));
  border-radius: 3px;
  transition: width 0.5s ease;
}

.progress-text {
  font-size: 12px;
  color: var(--on-dark-soft);
}

/* 称呼卡片 */
.address-card {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: var(--sp-md);
  background: var(--surface-card);
  border-radius: var(--radius-md);
  margin-bottom: var(--sp-lg);
  border: 1px solid var(--border-color);
}

.address-label {
  font-size: 13px;
  color: var(--text-dim);
}

.address-value {
  font-size: 15px;
  font-weight: 500;
  color: var(--accent-coral);
}

/* 分区标题 */
.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: var(--sp-md);
}

/* 里程碑列表 */
.milestone-list {
  display: flex;
  flex-direction: column;
}

.milestone-item {
  display: flex;
  align-items: center;
  gap: var(--sp-md);
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.milestone-item:last-child {
  border-bottom: none;
}

.milestone-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.milestone-item.unlocked .milestone-icon {
  background: linear-gradient(135deg, var(--accent-coral), var(--accent-amber));
}

.milestone-item.locked .milestone-icon {
  background: var(--surface-card);
  color: var(--text-dim);
  opacity: 0.6;
}

.milestone-info {
  flex: 1;
  min-width: 0;
}

.milestone-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.milestone-item.locked .milestone-name {
  color: var(--text-dim);
}

.milestone-points {
  font-size: 12px;
  color: var(--text-dim);
}

.milestone-check {
  color: var(--accent-coral);
  font-size: 16px;
  margin-left: auto;
  flex-shrink: 0;
}

.milestone-lock {
  color: var(--text-dim);
  font-size: 14px;
  margin-left: auto;
  opacity: 0.4;
  flex-shrink: 0;
}

/* 解锁内容列表 */
.unlock-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
  margin-bottom: var(--sp-lg);
}

.unlock-item {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  padding: var(--sp-sm) var(--sp-md);
  background: var(--surface-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

.unlock-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.unlock-info {
  flex: 1;
  min-width: 0;
}

.unlock-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.unlock-desc {
  font-size: 12px;
  color: var(--text-dim);
}

/* 下一个里程碑 */
.next-milestone {
  padding: var(--sp-md);
  background: linear-gradient(135deg, rgba(232, 121, 89, 0.1), rgba(247, 197, 159, 0.1));
  border-radius: var(--radius-md);
  border: 1px dashed var(--accent-coral);
  text-align: center;
}

.next-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.next-name {
  font-size: 16px;
  font-weight: 500;
  color: var(--accent-coral);
  margin-bottom: 2px;
}

.next-progress {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-xs);
  padding: var(--sp-sm) var(--sp-lg);
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-secondary {
  background: var(--surface-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--surface-cream);
  border-color: var(--accent-amber);
  transform: translateY(-1px);
}
</style>
