/**
 * 聊天控制器配置
 * 集中管理聊天相关的硬编码常量
 */

/**
 * 从环境变量读取数值，带默认值
 */
function getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined || value === '') {
      return defaultValue;
    }
    const num = Number(value);
    if (isNaN(num)) {
        console.warn(`[配置警告] 环境变量 ${key}="${value}" 不是有效数字，使用默认值 ${defaultValue}`);
        return defaultValue;
    }
    return num;
}

/**
 * 从环境变量读取字符串，带默认值
 */
function getEnvString(key: string, defaultValue: string): string {
    const value = process.env[key];
    return (value !== undefined && value !== '') ? value : defaultValue;
}

/**
 * 默认响应参数
 */
export const DEFAULT_RESPONSE = {
    emotion: getEnvString('CHAT_DEFAULT_EMOTION', 'calm'),
    speechRate: getEnvNumber('CHAT_DEFAULT_SPEECH_RATE', 0.9),
    volume: getEnvNumber('CHAT_DEFAULT_VOLUME', 0.7),
    action: getEnvString('CHAT_DEFAULT_ACTION', 'none')
} as const;

/**
 * 意图类型
 */
export const INTENT_TYPES = {
    CODING: 'coding',
    CHAT: 'chat'
} as const;

/**
 * 系统控制类型
 */
export const SYSTEM_CONTROL_TYPES = {
    SYSTEM_CONTROL: 'system_control',
    SYSTEM_CONTROL_CONFIRM: 'system_control_confirm',
    SYSTEM_CONTROL_CANCELLED: 'system_control_cancelled'
} as const;

/**
 * 短期记忆配置
 */
export const SHORT_TERM_MEMORY = {
    namespace: getEnvString('MEMORY_NAMESPACE', 'default'),
    pendingCommandKey: 'pending_system_command',
    commandTimeout: getEnvNumber('PENDING_COMMAND_TIMEOUT', 60000)  // 60秒超时
} as const;

/**
 * 日志配置
 */
export const LOG_CONFIG = {
    prefixes: {
     USER: '[主人说]',
        ASSISTANT: '[小梦说]',
        INTENT: '[意图识别]',
        SYSTEM_CONTROL: '[系统控制]',
        LLM: '[LLM]'
    },
    intentEmojis: {
        coding: '📝 写代码',
        chat: '💬 日常闲聊'
    }
} as const;

/**
 * 错误消息
 */
export const ERROR_MESSAGES = {
    EMPTY_MESSAGE: '主人，你没输入内容呀！',
    AUDIO_REQUIRED: '主人，你没有上传音频文件呀！'
} as const;
