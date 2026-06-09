/**
 * @file chatConfig.js
 * @description 聊天控制器配置，集中管理聊天相关的硬编码常量，
 *              包括默认响应参数、意图类型、系统控制类型、短期记忆配置和日志配置
 * @module config/chatConfig
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：环境变量辅助函数
// 功能说明：从环境变量读取数值和字符串，带默认值和类型校验
// ============================================================

/**
 * @description 从环境变量读取数值，支持默认值和无效值警告
 * @param {string} key - 环境变量名称
 * @param {number} defaultValue - 默认值
 * @returns {number} 环境变量值或默认值
 */
const getEnvNumber = (key, defaultValue) => {
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
};

// 辅助函数：从环境变量读取字符串，带默认值
const getEnvString = (key, defaultValue) => {
    const value = process.env[key];
    return (value !== undefined && value !== '') ? value : defaultValue;
};

// ================= 默认响应参数 =========
const DEFAULT_RESPONSE = {
    emotion: getEnvString('CHAT_DEFAULT_EMOTION', 'calm'),
    speechRate: getEnvNumber('CHAT_DEFAULT_SPEECH_RATE', 0.9),
    volume: getEnvNumber('CHAT_DEFAULT_VOLUME', 0.7),
    action: getEnvString('CHAT_DEFAULT_ACTION', 'none')
};

// ================= 意图类型 ============
const INTENT_TYPES = {
    CODING: 'coding',
    CHAT: 'chat'
};

// ============================================================
// 模块名称：系统控制类型
// 功能说明：定义系统控制意图的分类常量
// ============================================================
const SYSTEM_CONTROL_TYPES = {
    SYSTEM_CONTROL: 'system_control',
    SYSTEM_CONTROL_CONFIRM: 'system_control_confirm',
    SYSTEM_CONTROL_CANCELLED: 'system_control_cancelled'
};

// ============================================================
// 模块名称：短期记忆配置
// 功能说明：定义短期记忆的命名空间和待执行命令的超时时间
// ============================================================
const SHORT_TERM_MEMORY = {
    namespace: getEnvString('MEMORY_NAMESPACE', 'default'),
    pendingCommandKey: 'pending_system_command',
    commandTimeout: getEnvNumber('PENDING_COMMAND_TIMEOUT', 60000)  // 60秒超时
};

// ================= 日志配置 ==============
const LOG_CONFIG = {
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
};

// ============================================================
// 模块名称：错误消息
// 功能说明：定义用户输入为空时的友好提示消息
// ============================================================
const ERROR_MESSAGES = {
    EMPTY_MESSAGE: '主人，你没输入内容呀！',
    AUDIO_REQUIRED: '主人，你没有上传音频文件呀！'
};

module.exports = {
    DEFAULT_RESPONSE,
    INTENT_TYPES,
    SYSTEM_CONTROL_TYPES,
    SHORT_TERM_MEMORY,
    LOG_CONFIG,
    ERROR_MESSAGES
};
