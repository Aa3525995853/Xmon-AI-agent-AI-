/**
 * 配置验证模块
 * 验证配置值的类型和范围
 */
const { logger } = require('../utils/logger');

/**
 * 验证数值范围
 */
function validateNumber(value, name, min, max) {
    if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`配置错误: ${name} 必须是数字，当前值: ${value}`);
    }
    if (min !== undefined && value < min) {
        throw new Error(`配置错误: ${name} 不能小于 ${min}，当前值: ${value}`);
    }
    if (max !== undefined && value > max) {
        throw new Error(`配置错误: ${name} 不能大于 ${max}，当前值: ${value}`);
    }
    return true;
}

/**
 * @description 验证字符串是否在允许的枚举值列表中
 * @param {string} value - 待验证的字符串
 * @param {string} name - 配置项名称（用于错误提示）
 * @param {string[]} allowedValues - 允许的值列表
 * @returns {boolean} 验证通过返回 true
 * @throws {Error} 值不是字符串或不在允许列表中时抛出错误
 */
function validateEnum(value, name, allowedValues) {
    if (typeof value !== 'string') {
        throw new Error(`配置错误: ${name} 必须是字符串，当前值: ${value}`);
    }
    if (!allowedValues.includes(value)) {
        throw new Error(`配置错误: ${name} 必须是以下值之一: ${allowedValues.join(', ')}，当前值: ${value}`);
    }
    return true;
}

/**
 * 验证正则表达式
 */
function validateRegex(value, name) {
    if (!(value instanceof RegExp)) {
        throw new Error(`配置错误: ${name} 必须是正则表达式，当前值: ${value}`);
    }
    return true;
}

/**
 * 验证对象
 */
function validateObject(value, name) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`配置错误: ${name} 必须是对象，当前值: ${value}`);
    }
    return true;
}

// ============================================================
// 模块名称：流式聊天配置验证
// 功能说明：验证完整的流式聊天配置对象，检查各配置项的类型和范围
// ============================================================

/**
 * @description 验证流式聊天配置的完整性和合法性
 * @param {Object} config - 流式聊天配置对象
 * @param {Object} config.BACKPRESSURE_CONFIG - 背压控制配置
 * @param {Object} config.AUDIO_CONFIG - 音频配置
 * @param {Object} config.LLM_CONFIG - LLM 配置
 * @param {Object} config.SENTENCE_CONFIG - 句子处理配置
 * @param {Object} config.EMOTION_CONFIG - 情绪配置
 * @param {Object} config.SYSTEM_CONTROL_CONFIG - 系统控制配置
 * @param {Object} config.CONVERSATION_CONFIG - 对话历史配置
 * @returns {{valid: boolean, errors: string[]}} 验证结果，valid 为是否通过，errors 为错误列表
 */
function validateStreamChatConfig(config) {
    const errors = [];

    try {
        // 验证背压控制配置
        validateObject(config.BACKPRESSURE_CONFIG, 'BACKPRESSURE_CONFIG');
        validateNumber(config.BACKPRESSURE_CONFIG.highWaterMark, 'highWaterMark', 1024, 10 * 1024 * 1024); // 1KB - 10MB
        validateNumber(config.BACKPRESSURE_CONFIG.lowWaterMark, 'lowWaterMark', 512, config.BACKPRESSURE_CONFIG.highWaterMark);
        validateNumber(config.BACKPRESSURE_CONFIG.maxQueueSize, 'maxQueueSize', 10, 10000);

        // 验证音频配置
        validateObject(config.AUDIO_CONFIG, 'AUDIO_CONFIG');
        validateNumber(config.AUDIO_CONFIG.sampleRate, 'sampleRate', 8000, 48000);
        validateEnum(config.AUDIO_CONFIG.format, 'format', ['pcm16', 'pcm8', 'mp3', 'wav']);
        validateEnum(config.AUDIO_CONFIG.encoding, 'encoding', ['utf-8', 'ascii', 'utf-16']);

        // 验证 LLM 配置
        validateObject(config.LLM_CONFIG, 'LLM_CONFIG');
        validateNumber(config.LLM_CONFIG.temperature, 'temperature', 0, 2);
        validateNumber(config.LLM_CONFIG.topP, 'topP', 0, 1);
      validateNumber(config.LLM_CONFIG.presencePenalty, 'presencePenalty', -2, 2);
        validateNumber(config.LLM_CONFIG.frequencyPenalty, 'frequencyPenalty', -2, 2);
        validateNumber(config.LLM_CONFIG.streamTimeout, 'streamTimeout', 1000, 300000); // 1s - 5min

        // 验证超时配置
        validateObject(config.LLM_CONFIG.timeout, 'LLM_CONFIG.timeout');
     for (const [model, timeout] of Object.entries(config.LLM_CONFIG.timeout)) {
          validateNumber(timeout, `timeout.${model}`, 1000, 300000); // 1s - 5min
        }

      // 验证句子配置
        validateObject(config.SENTENCE_CONFIG, 'SENTENCE_CONFIG');
        validateRegex(config.SENTENCE_CONFIG.boundary, 'boundary');
        validateNumber(config.SENTENCE_CONFIG.maxLength, 'maxLength', 10, 500);
      validateNumber(config.SENTENCE_CONFIG.minLength, 'minLength', 1, config.SENTENCE_CONFIG.maxLength);
        validateNumber(config.SENTENCE_CONFIG.mergeThreshold, 'mergeThreshold', 5, 200);

      // 验证情绪配置
        validateObject(config.EMOTION_CONFIG, 'EMOTION_CONFIG');
        validateObject(config.EMOTION_CONFIG.emotionMap, 'emotionMap');
        validateObject(config.EMOTION_CONFIG.keywords, 'keywords');

        // 验证系统控制配置
      validateObject(config.SYSTEM_CONTROL_CONFIG, 'SYSTEM_CONTROL_CONFIG');
        validateObject(config.SYSTEM_CONTROL_CONFIG.toolNames, 'toolNames');
        // 验证对话配置
        validateObject(config.CONVERSATION_CONFIG, 'CONVERSATION_CONFIG');
        validateNumber(config.CONVERSATION_CONFIG.maxHistoryLength, 'maxHistoryLength', 0, 100);

        logger.info('[配置验证] 所有配置验证通过');
        return { valid: true, errors: [] };

    } catch (error) {
        errors.push(error.message);
        logger.error('[配置验证] 配置验证失败', { error: error.message });
        return { valid: false, errors };
    }
}

// ============================================================
// 模块名称：配置警告检测
// 功能说明：检测可能导致性能问题的配置值，仅记录警告不阻止启动
// ============================================================

/**
 * @description 验证配置并记录警告（不抛出错误），检测可能导致性能问题的配置值
 * @param {Object} config - 流式聊天配置对象
 * @returns {string[]} 警告消息列表
 */
function validateWithWarnings(config) {
    const warnings = [];

    // 检查可能的性能问题
    if (config.BACKPRESSURE_CONFIG.highWaterMark > 1024 * 1024) {
     warnings.push('highWaterMark 超过 1MB，可能导致内存使用过高');
    }

    if (config.LLM_CONFIG.temperature > 1.5) {
        warnings.push('temperature 超过 1.5，可能导致输出不稳定');
    }
    if (config.LLM_CONFIG.streamTimeout < 5000) {
        warnings.push('streamTimeout 小于 5 秒，可能导致请求频繁超时');
    }

    if (config.SENTENCE_CONFIG.maxLength > 200) {
        warnings.push('maxLength 超过 200，可能导致 TTS 延迟增加');
    }

    if (config.CONVERSATION_CONFIG.maxHistoryLength > 20) {
        warnings.push('maxHistoryLength 超过 20，可能导致 token 使用过多');
    }

    if (warnings.length > 0) {
        logger.warn('[配置验证] 发现配置警告', { warnings });
    }

    return warnings;
}

module.exports = {
    validateNumber,
    validateEnum,
    validateRegex,
    validateObject,
    validateStreamChatConfig,
    validateWithWarnings
};
