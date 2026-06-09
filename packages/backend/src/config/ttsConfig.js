/**
 * @file ttsConfig.js
 * @description TTS 控制器配置，集中管理 TTS 相关的硬编码常量，
 *              包括音频参数、流式传输参数、默认选项、回退文本和日志配置
 * @module config/ttsConfig
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

// ================= 音频配置 ==============
const AUDIO_CONFIG = {
    sampleRate: getEnvNumber('TTS_SAMPLE_RATE', 24000),
    format: getEnvString('TTS_FORMAT', 'pcm16'),
    defaultFormat: getEnvString('TTS_DEFAULT_FORMAT', 'wav'),
    fallbackFormat: getEnvString('TTS_FALLBACK_FORMAT', 'mp3')
};

// ================= 流式传输配置 ==============
const STREAMING_CONFIG = {
    chunkSize: getEnvNumber('TTS_CHUNK_SIZE', 4800),        // PCM 流式块大小
    fallbackChunkSize: getEnvNumber('TTS_FALLBACK_CHUNK_SIZE', 8192)  // 非流式回退块大小
};

// ============================================================
// 模块名称：默认选项
// 功能说明：TTS 请求的默认情绪和增强选项
// ============================================================
const DEFAULT_OPTIONS = {
    emotion: getEnvString('TTS_DEFAULT_EMOTION', 'neutral'),
    enhance: false  // 默认不增强
};

// ================= 回退文本 ==========
const FALLBACK_TEXT = {
    empty: getEnvString('TTS_FALLBACK_TEXT', '嗯……'),
    test: getEnvString('TTS_TEST_TEXT', '你好')
};

// ============================================================
// 模块名称：日志配置
// 功能说明：TTS 相关的日志前缀和消息模板
// ============================================================
const LOG_CONFIG = {
    prefixes: {
        TTS: '[TTS]'
    },
    messages: {
        generating: '正在生成小梦的声音...',
        starting: '开始生成',
        completed: '生成完成',
        failed: '语音生成失败',
        streamError: '流式生成错误',
        sentenceFailed: '句子生成失败',
        testFailed: '测试失败'
    }
};
module.exports = {
    AUDIO_CONFIG,
    STREAMING_CONFIG,
    DEFAULT_OPTIONS,
    FALLBACK_TEXT,
    LOG_CONFIG
};
