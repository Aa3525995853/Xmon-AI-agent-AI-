/**
 * @file 计划状态管理
 * @description 管理用户保存的计划（旅行规划、待办事项等），支持增删改查
 * @module stores/plan
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** 计划类型枚举 */
export type PlanType = 'travel' | 'general' | 'custom'

/** 计划数据结构 */
export interface Plan {
  id: string
  title: string
  content: string
  type: PlanType
  description: string
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

/** 计划列表项（不含完整内容） */
export interface PlanListItem {
  id: string
  title: string
  type: PlanType
  description: string
  createdAt: number
  updatedAt: number
}

/** 计划折叠面板状态 */
export type PlanPanelState = 'collapsed' | 'expanded'

/** 默认面板宽度占比 */
const DEFAULT_PLAN_RATIO = 0.4

/** 最大计划数量 */
const MAX_PLANS = 100

/**
 * 计划 Store
 * 管理计划的列表、详情、增删改查
 */
export const usePlanStore = defineStore('plan', () => {
  // ============================================================
  // 面板状态
  // ============================================================

  /** 计划面板状态：折叠/展开 */
  const panelState = ref<PlanPanelState>('collapsed')

  // ============================================================
  // 数据状态
  // ============================================================

  /** 计划列表 */
  const plans = ref<PlanListItem[]>([])

  /** 当前选中的计划 */
  const currentPlan = ref<Plan | null>(null)

  /** 加载状态 */
  const loading = ref(false)

  /** 错误信息 */
  const error = ref<string | null>(null)

  // ============================================================
  // 计算属性
  // ============================================================

  /** 面板是否展开 */
  const isExpanded = computed(() => panelState.value === 'expanded')

  /** 是否有计划 */
  const hasPlans = computed(() => plans.value.length > 0)

  /** 按类型分组的计划 */
  const plansByType = computed(() => {
    const grouped: Record<string, PlanListItem[]> = {}
    for (const plan of plans.value) {
      const type = plan.type || 'other'
      if (!grouped[type]) grouped[type] = []
      grouped[type].push(plan)
    }
    return grouped
  })

  // ============================================================
  // 方法
  // ============================================================

  /**
   * 切换面板展开/折叠
   */
  function togglePanel() {
    panelState.value = panelState.value === 'collapsed' ? 'expanded' : 'collapsed'
  }

  /**
   * 展开计划面板
   */
  function expandPanel() {
    panelState.value = 'expanded'
  }

  /**
   * 折叠计划面板
   */
  function collapsePanel() {
    panelState.value = 'collapsed'
  }

  /**
   * 从后端加载计划列表
   * @param {PlanType} [type] - 可选的类型过滤
   * @returns {Promise<void>}
   */
  async function loadPlans(type?: PlanType) {
    loading.value = true
    error.value = null

    try {
      const url = type ? `/api/plan/list?type=${type}` : '/api/plan/list'
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`加载计划失败: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        plans.value = data.plans || []
      } else {
        throw new Error(data.error || '加载计划失败')
      }
    } catch (e: any) {
      error.value = e.message
      console.error('[PlanStore] 加载计划失败:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载单个计划详情
   * @param {string} planId - 计划ID
   * @returns {Promise<Plan|null>}
   */
  async function loadPlan(planId: string): Promise<Plan | null> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/plan/${planId}`)

      if (!response.ok) {
        throw new Error(`加载计划失败: ${response.status}`)
      }

      const data = await response.json()

      if (data.success && data.plan) {
        currentPlan.value = data.plan
        return data.plan
      } else {
        throw new Error(data.error || '计划不存在')
      }
    } catch (e: any) {
      error.value = e.message
      console.error('[PlanStore] 加载计划详情失败:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存新计划
   * @param {Object} planData - 计划数据
   * @param {string} planData.title - 计划标题
   * @param {string} planData.content - 计划内容
   * @param {PlanType} [planData.type='travel'] - 计划类型
   * @param {string} [planData.description] - 计划描述
   * @param {Object} [planData.metadata] - 额外元数据
   * @returns {Promise<Plan|null>}
   */
  async function savePlan(planData: {
    title: string
    content: string
    type?: PlanType
    description?: string
    metadata?: Record<string, unknown>
  }): Promise<Plan | null> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: planData.title,
          content: planData.content,
          type: planData.type || 'travel',
          description: planData.description || '',
          metadata: planData.metadata || {}
        })
      })

      const data = await response.json()

      if (data.success && data.plan) {
        // 更新列表
        await loadPlans()
        return data.plan
      } else {
        throw new Error(data.error || '保存计划失败')
      }
    } catch (e: any) {
      error.value = e.message
      console.error('[PlanStore] 保存计划失败:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新计划
   * @param {string} planId - 计划ID
   * @param {Object} updates - 要更新的字段
   * @returns {Promise<Plan|null>}
   */
  async function updatePlan(
    planId: string,
    updates: { title?: string; content?: string; description?: string; metadata?: Record<string, unknown> }
  ): Promise<Plan | null> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/plan/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      const data = await response.json()

      if (data.success && data.plan) {
        // 更新列表
        await loadPlans()
        // 如果当前查看的是这个计划，更新它
        if (currentPlan.value?.id === planId) {
          currentPlan.value = data.plan
        }
        return data.plan
      } else {
        throw new Error(data.error || '更新计划失败')
      }
    } catch (e: any) {
      error.value = e.message
      console.error('[PlanStore] 更新计划失败:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 删除计划
   * @param {string} planId - 计划ID
   * @returns {Promise<boolean>}
   */
  async function deletePlan(planId: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/plan/${planId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        // 更新列表
        await loadPlans()
        // 如果当前查看的是这个计划，清空
        if (currentPlan.value?.id === planId) {
          currentPlan.value = null
        }
        return true
      } else {
        throw new Error(data.error || '删除计划失败')
      }
    } catch (e: any) {
      error.value = e.message
      console.error('[PlanStore] 删除计划失败:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 快速保存任务结果为计划（从工作区直接保存）
   * @param {Object} taskResult - 任务结果
   * @param {string} taskResult.title - 计划标题
   * @param {string} taskResult.content - 计划内容
   * @param {string} [taskResult.type='travel'] - 计划类型
   * @param {Object} [taskResult.metadata] - 额外元数据
   * @returns {Promise<Plan|null>}
   */
  async function saveFromTaskResult(taskResult: {
    title: string
    content: string
    type?: PlanType
    metadata?: Record<string, unknown>
  }): Promise<Plan | null> {
    return savePlan({
      title: taskResult.title,
      content: taskResult.content,
      type: taskResult.type || 'travel',
      metadata: taskResult.metadata
    })
  }

  /**
   * 格式化日期
   * @param {number} timestamp - 时间戳
   * @returns {string} 格式化后的日期字符串
   */
  function formatDate(timestamp: number): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    // 今天
    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
      return '今天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    // 昨天
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) {
      return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    // 一周内
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString('zh-CN', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
    }

    // 其他
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  /**
   * 获取计划类型图标
   * @param {PlanType} type - 计划类型
   * @returns {string} FontAwesome 图标类名
   */
  function getTypeIcon(type: PlanType): string {
    const icons: Record<PlanType, string> = {
      travel: 'fa-plane',
      general: 'fa-list-alt',
      custom: 'fa-star'
    }
    return icons[type] || 'fa-file-alt'
  }

  /**
   * 获取计划类型标签
   * @param {PlanType} type - 计划类型
   * @returns {string} 中文标签
   */
  function getTypeLabel(type: PlanType): string {
    const labels: Record<PlanType, string> = {
      travel: '旅行',
      general: '通用',
      custom: '自定义'
    }
    return labels[type] || '其他'
  }

  return {
    // 面板状态
    panelState,
    isExpanded,

    // 数据状态
    plans,
    currentPlan,
    loading,
    error,

    // 计算属性
    hasPlans,
    plansByType,

    // 方法
    togglePanel,
    expandPanel,
    collapsePanel,
    loadPlans,
    loadPlan,
    savePlan,
    updatePlan,
    deletePlan,
    saveFromTaskResult,
    formatDate,
    getTypeIcon,
    getTypeLabel
  }
})