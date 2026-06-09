/**
 * 全局类型定义
 */

// ==================== 配置类型 ====================

export interface BackpressureConfig {
  highWaterMark: number;
  lowWaterMark: number;
  maxQueueSize: number;
}

export interface AudioConfig {
  sampleRate: number;
  format: string;
  encoding: string;
}

export interface LLMConfig {
  defaultModel: string;
  temperature: number;
  topP: number;
  presencePenalty: number;
  frequencyPenalty: number;
  timeout: {
    [key: string]: number;
  };
  streamTimeout: number;
  thinking: {
    type: string;
  };
}

export interface SentenceConfig {
  boundary: RegExp;
  maxLength: number;
  minLength: number;
  mergeThreshold: number;
}

export interface EmotionConfig {
  emotionMap: {
    [key: string]: string;
  };
  defaultEmotion: string;
  keywords: {
    [key: string]: RegExp;
  };
  availableEmotions: string[];
}

export interface SystemControlConfig {
  toolNames: {
    [key: string]: string;
  };
  successTemplate: (displayName: string) => string;
  errorTemplate: (message: string) => string;
  fallbackError: string;
  networkError: string;
  defaultFallback: string;
}

export interface ConversationConfig {
  maxHistoryLength: number;
  maxTokens: {
    short: number;
    normal: number;
    long: number;
  };
}

// ==================== 请求/响应类型 ====================

export interface ChatRequest {
  message: string;
  personality?: 'normal' | 'bad';
}

export interface ChatResponse {
  message: string;
  ttsText?: string;
  emotion: string;
  speech_rate: number;
  volume: number;
  action: string;
  silence?: boolean;
  relationship?: {
    stage: string;
    intimacy: number;
    trust: number;
  };
}

export interface VoiceChatRequest {
  audio: Express.Multer.File;
}

export interface VoiceChatResponse {
  text: string;
  ttsText?: string;
  emotion: string;
  speech_rate: number;
  volume: number;
  action: string;
  silence: boolean;
  type?: string;
  isSystemControl?: boolean;
}

// ==================== LLM 类型 ====================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  emotion?: string;
  speech_rate?: number;
  volume?: number;
  action?: string;
  silence?: boolean;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

// ================= TTS 类型 ====================

export interface TTSOptions {
  emotion?: string;
  enhance?: boolean;
  userMessage?: string;
}

export interface TTSResult {
  buffer: Buffer;
  format: string;
}

export interface TTSProvider {
  name: string;
  isAvailable: () => boolean;
  generateVoice?: (text: string, options?: TTSOptions) => Promise<Buffer>;
  generateVoiceWav?: (text: string, options?: TTSOptions) => Promise<Buffer>;
  generateVoiceStream?: (text: string, options?: TTSOptions) => Promise<Buffer>;
  generateVoiceStreamCallback?: (
    text: string,
    callback: (buffer: Buffer) => void,
    options?: TTSOptions
  ) => Promise<void>;
  generateWithEmotionStream?: (
    text: string,
    emotion: string,
    callback: (buffer: Buffer) => void,
    options?: TTSOptions
  ) => Promise<void>;
  getVoiceList?: () => string[];
  getStyleTags?: () => string[];
  getInfo?: () => any;
}

// ================= 系统控制类型 ================

export interface SystemIntent {
  type: string;
  params?: any;
}

export interface SystemControlResult {
  success: boolean;
  message: string;
  intent?: SystemIntent;
  requireConfirm?: boolean;
}

// ======== 健康检查类型 ===============

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  version?: string;
}

export interface DetailedHealthStatus extends HealthStatus {
  memory: NodeJS.MemoryUsage;
  cpu?: {
    usage: number;
  };
  services: {
    [key: string]: 'ok' | 'degraded' | 'error';
  };
}

// ============= 日志类型 =============

export interface LoggerOptions {
  level: 'error' | 'warn' | 'info' | 'debug';
  filename?: string;
  maxFiles?: number;
  maxSize?: string;
}

// =============== SSE 类型 ===============

export type SSEEventType = 'text' | 'audio' | 'audio_end' | 'done' | 'config' | 'sentence_complete' | 'error';

export interface SSEEvent {
  type: SSEEventType;
  data: any;
}

// ============ 工具函数类型 ====================

export type IntentType = 'coding' | 'chat';

export interface TextProcessorResult {
  cleaned: string;
  emotion?: string;
  intent?: IntentType;
}

// ================== Express 扩展 ====================

declare global {
  namespace Express {
    interface Request {
      startTime?: number;
    }
  }
}

// ============= 环境变量类型 ================

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';

      // API Keys
      KIMI_API_KEY: string;
      KIMI_API_URL: string;
      KIMI_MODEL: string;
      MIMO_API_KEY: string;
      MIMO_API_URL: string;
      MIMO_MODEL: string;
      MIMO_TTS_API_KEY: string;
      MIMO_TTS_API_URL: string;

      // TTS Provider
    TTS_PROVIDER: 'mimo' | 'volcano' | 'minimax' | 'edge' | 'mock';

      // Persona
      PERSONA_MODE: 'gentle' | 'tsundere';

      // Config Validation
      VALIDATE_CONFIG?: 'true' | 'false';

    // Optional Config Overrides
      LLM_TEMPERATURE?: string;
      LLM_TOP_P?: string;
      LLM_STREAM_TIMEOUT?: string;
      SENTENCE_MAX_LENGTH?: string;
      CHAT_DEFAULT_EMOTION?: string;
      TTS_SAMPLE_RATE?: string;
      CONVERSATION_MAX_HISTORY?: string;
    }
  }
}

export {};
