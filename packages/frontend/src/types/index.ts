/**
 * @file 类型定义
 * @description 小梦前端核心类型定义，包含消息、任务、大脑状态、人格等
 * @module types
 */

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 消息接口 */
export interface Message {
  /** 唯一标识 */
  id: string
  /** 消息角色 */
  role: MessageRole
  /** 消息文本内容 */
  text: string
  /** 情绪标签 */
  emotion?: string
  /** 时间戳 */
  timestamp: number
  /** 是否为打字指示器 */
  isTyping?: boolean
  /** 附件图片 */
  image?: {
    base64: string
    mimeType: string
  }
}

/** 任务状态 */
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'degraded'

/** 任务接口 */
export interface Task {
  /** 任务ID */
  id: string
  /** 执行命令 */
  command: string
  /** 任务状态 */
  status: TaskStatus
  /** 执行时长（毫秒） */
  duration?: number
  /** 错误信息 */
  error?: string
  /** 降级原因 */
  reason?: string
}

/** 任务步骤 */
export interface TaskStep {
  /** 任务ID */
  taskId: string
  /** 步骤索引 */
  stepIndex: number
  /** 执行动作 */
  action?: string
  /** 步骤描述 */
  desc?: string
  /** 步骤状态 */
  status: 'starting' | 'running' | 'completed' | 'asking' | 'thinking'
  /** 步骤结果 */
  result?: string
  /** 总步骤数 */
  totalSteps?: number
  /** 澄清问题 */
  question?: string
  /** 选项列表 */
  options?: string[]
  /** 输入参数 */
  params?: Record<string, unknown>
}

/** 任务进度 */
export interface TaskProgress {
  /** 当前步骤 */
  current: number
  /** 总步骤数 */
  total: number
}

/** 大脑状态枚举 */
export type BrainState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'chatting'
  | 'working'
  | 'speaking'
  | 'degraded'
  | 'error'

/** 大脑状态转换事件 */
export type BrainEvent =
  | 'listen'
  | 'think'
  | 'chat'
  | 'work'
  | 'speak'
  | 'stop'
  | 'done'
  | 'degrade'
  | 'error'
  | 'recover'
  | 'reset'
  | 'cancel'

/** 大脑状态配置 */
export interface BrainStateConfig {
  /** 对应情绪 */
  emotion: string
  /** 对应动作 */
  action: 'none' | 'tilt' | 'nod' | 'shake' | 'sigh'
  /** 状态标签 */
  label: string
  /** 状态图标 */
  icon: string
}

/** 人格类型 */
export type Personality = 'normal' | 'tsundere' | 'gentle' | 'lively'

/** 应用模式 */
export type AppMode = 'idle' | 'listening' | 'processing' | 'speaking'

/** 情绪配置 */
export interface EmotionConfig {
  /** 情绪图标 */
  icon: string
  /** 情绪颜色 */
  color: string
  /** 情绪标签 */
  label: string
}

/** Live2D 表情预设参数 */
export type ExpressionPreset = Record<string, number>

/** 用户信息 */
export interface User {
  /** 用户名 */
  username: string
  /** 用户ID */
  id?: string
}

/** 认证响应 */
export interface AuthResponse {
  /** 是否成功 */
  success: boolean
  /** 认证令牌 */
  token?: string
  /** 用户信息 */
  user?: User
  /** 错误信息 */
  error?: string
}

/** 关系阶段 */
export type RelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close_friend'
  | 'intimate'

/** 关系状态 */
export interface Relationship {
  /** 关系阶段 */
  relationshipStage: RelationshipStage
  /** 亲密度 (0-1) */
  intimacy: number
  /** 信任度 (0-1) */
  trust: number
}

/** 主动消息类型 */
export type ProactiveType =
  | 'morning'
  | 'evening'
  | 'night'
  | 'emotion_care'
  | 'milestone'
  | 'streak'
  | 'stage_transition'

/** 主动消息 */
export interface ProactiveMessage {
  /** 消息文本 */
  text: string
  /** 消息类型 */
  type: ProactiveType
  /** 情绪标签 */
  emotion?: string
  /** 附加数据 */
  data?: Record<string, unknown>
}

/** 危险操作确认 */
export interface DangerConfirm {
  /** 任务ID */
  taskId: string
  /** 工具名 */
  tool: string
  /** 提示消息 */
  message: string
  /** 警告级别 */
  warningLevel: string
}

/** 澄清对话 */
export interface ClarificationData {
  /** 任务ID */
  taskId: string
  /** 步骤索引 */
  stepIndex: number
  /** 澄清问题 */
  question: string
  /** 选项列表 */
  options: string[]
}

/** SSE 事件数据 */
export interface SSEEventData {
  /** 事件类型 */
  event: string
  /** 文本内容 */
  text?: string
  /** 情绪标签 */
  emotion?: string
  /** PCM 音频数据（Base64） */
  pcm?: string
  /** 任务ID */
  taskId?: string
  /** 消息类型 */
  type?: string
  /** 消息内容 */
  message?: string
  /** TTS 文本 */
  ttsText?: string
}

// ============================================================
// 工作区类型：小牛（牛马）状态管理
// 功能说明：定义工作区面板、小牛状态、任务日志等类型
// ============================================================

/** 小牛（牛马）工作状态 */
export type WorkerStatus = 'idle' | 'starting' | 'working' | 'stuck' | 'done'

/** 小牛动画状态 */
export type WorkerAnimation = 'sleep' | 'stretch' | 'typing' | 'headscratch' | 'celebrate' | 'packup' | 'wave'

/** 工作区面板状态 */
export type WorkerPanelState = 'collapsed' | 'expanded'

/** 任务日志条目 */
export interface WorkerLogEntry {
  /** 日志时间戳 */
  time: string
  /** 日志消息 */
  message: string
  /** 日志级别 */
  level?: 'info' | 'warn' | 'error' | 'success'
  /** 日志分类（用于样式区分） */
  category?: 'intent' | 'llm' | 'tool' | 'result' | 'error' | 'info'
  /** LLM 提供商 */
  provider?: string
  /** 模型名称 */
  model?: string
  /** Token 数量 */
  tokens?: number
  /** 工具名称 */
  toolName?: string
  /** 执行时长（毫秒） */
  duration?: number
  /** 是否成功 */
  success?: boolean
}

/** 工作区任务结果 */
export interface WorkerTaskResult {
  /** 结果类型 */
  type: 'file' | 'text' | 'table' | 'chart' | 'travel_plan'
  /** 结果内容 */
  content: string
  /** 文件路径（type为file时） */
  path?: string
  /** 预览信息 */
  preview?: string
  /** 旅行规划专用：Markdown格式的行程计划 */
  plan?: string
  /** 任务元数据（如旅行规划的目的地、天数等） */
  metadata?: Record<string, unknown>
}

/** 小梦插嘴状态 */
export interface ChimeInState {
  /** 是否正在插嘴（显示气泡） */
  active: boolean
  /** 插嘴台词文本 */
  text: string
  /** 插嘴触发的工作区状态 */
  triggerStatus: WorkerStatus
  /** 插嘴时间戳 */
  timestamp: number
}
