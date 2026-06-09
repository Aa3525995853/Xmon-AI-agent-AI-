/**
 * @file 认证状态
 * @description 从旧版HTML的认证函数提取，管理用户登录、注册、退出等认证状态
 * @module stores/auth
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, AuthResponse } from '../types'

/**
 * 认证状态 Store
 * 管理用户认证令牌、登录状态、认证请求头等
 */
export const useAuthStore = defineStore('auth', () => {
  // === 状态 ===
  /** 认证令牌（从 localStorage 恢复） */
  const token = ref<string | null>(localStorage.getItem('authToken'))
  /** 当前用户信息（从 localStorage 恢复） */
  const currentUser = ref<User | null>(loadSavedUser())
  /** 登录加载中 */
  const loading = ref(false)
  /** 错误信息 */
  const error = ref<string | null>(null)

  // === 计算属性 ===
  /** 是否已认证 */
  const isAuthenticated = computed(() => !!token.value && !!currentUser.value)

  // === 方法 ===

  /**
   * 获取认证请求头
   * @returns 包含 Authorization 的请求头对象
   */
  function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token.value) {
      headers['Authorization'] = `Bearer ${token.value}`
    }
    return headers
  }

  /**
   * 用户登录
   * @param username - 用户名
   * @param password - 密码
   * @returns 是否登录成功
   */
  async function login(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data: AuthResponse = await response.json()

      if (data.success && data.token) {
        token.value = data.token
        currentUser.value = data.user || null
        localStorage.setItem('authToken', data.token)
        if (data.user) {
          localStorage.setItem('currentUser', JSON.stringify(data.user))
        }
        return true
      } else {
        error.value = data.error || '登录失败'
        return false
      }
    } catch (e) {
      error.value = '网络错误，请稍后重试'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 用户注册
   * @param username - 用户名
   * @param password - 密码
   * @returns 是否注册成功
   */
  async function register(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data: AuthResponse = await response.json()

      if (data.success && data.token) {
        token.value = data.token
        currentUser.value = data.user || null
        localStorage.setItem('authToken', data.token)
        if (data.user) {
          localStorage.setItem('currentUser', JSON.stringify(data.user))
        }
        return true
      } else {
        error.value = data.error || '注册失败'
        return false
      }
    } catch (e) {
      error.value = '网络错误，请稍后重试'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 退出登录
   */
  async function logout(): Promise<void> {
    try {
      if (token.value) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: getAuthHeaders()
        })
      }
    } catch {
      // 忽略退出请求错误
    }

    // 清除本地状态
    token.value = null
    currentUser.value = null
    localStorage.removeItem('authToken')
    localStorage.removeItem('currentUser')
  }

  /**
   * 清除错误信息
   */
  function clearError() {
    error.value = null
  }

  return {
    // 状态
    token,
    currentUser,
    loading,
    error,

    // 计算属性
    isAuthenticated,

    // 方法
    getAuthHeaders,
    login,
    register,
    logout,
    clearError
  }
})

/**
 * 从 localStorage 恢复已保存的用户信息
 * @returns 用户对象或null
 */
function loadSavedUser(): User | null {
  const userJson = localStorage.getItem('currentUser')
  if (!userJson) return null

  try {
    return JSON.parse(userJson) as User
  } catch {
    localStorage.removeItem('currentUser')
    localStorage.removeItem('authToken')
    return null
  }
}
