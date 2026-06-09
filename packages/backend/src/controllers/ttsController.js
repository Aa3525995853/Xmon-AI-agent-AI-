/**
 * @file ttsController.js
 * @description TTS 业务逻辑控制器，处理文字转语音相关的核心业务逻辑，
 *              包括普通TTS、流式TTS、批量TTS等功能
 * @module controllers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { getCurrentTTSProvider } = require('../services/tts_registry');
const textCleaner = require('../services/text_cleaner');
const textProcessor = require('../utils/textProcessor');

// 导入配置
const {
    AUDIO_CONFIG,
    STREAMING_CONFIG,
    DEFAULT_OPTIONS,
    FALLBACK_TEXT,
    LOG_CONFIG
} = require('../config/ttsConfig');

// ============================================================
// 模块名称：TTS 服务获取
// 功能说明：获取当前 TTS 提供商实例和名称
// ============================================================

/**
 * @description 获取当前 TTS 服务实例（延迟加载，避免模块加载时初始化问题）
 * @returns {Object} TTS 服务提供者实例
 */
function getTTS() {
    return getCurrentTTSProvider();
}

/**
 * @description 获取当前 TTS 提供商名称
 * @returns {string} TTS 提供商名称，默认为 'mimo'
 */
function getTTSProviderName() {
    return process.env.TTS_PROVIDER || 'mimo';
}

// ============================================================
// 模块名称：TTS 核心功能
// 功能说明：文本转语音、流式生成、批量生成等核心功能
// ============================================================

/**
 * @description 将文本转换为语音，支持方言音色配置
 * @param {string} text - 要转换的文本
 * @param {Object} options - TTS 选项，可包含 dialect（方言）、emotion（情感）等
 * @param {string} [options.dialect] - 方言类型，如 taiwan、dongbei 等
 * @returns {Promise<Object>} 包含音频 buffer 和格式的对象 { buffer: Buffer, format: string }
 * @throws {Error} 语音生成失败时抛出异常
 */
async function textToSpeech(text, options = {}) {
    console.log('[TTS] 正在生成小梦的声音...');

    try {
        const tts = getTTS();
        // 空文本使用回退文本，避免 TTS 服务报错
        const cleanedText = text || FALLBACK_TEXT.empty;

        // 如果有方言参数，加载对应的音色配置并合并到 options
        if (options.dialect) {
        const voiceConfig = require('../config/voiceConfig');
            const provider = process.env.TTS_PROVIDER || 'mimo';
            const dialectConfig = voiceConfig.getVoiceConfig(options.dialect, provider);

            console.log(`[TTS] 使用方言音色: ${options.dialect}`, dialectConfig);

          // 合并方言配置到 options，方言配置优先级更高
        options = {
       ...options,
                ...dialectConfig
            };
        }

        // 优先使用 generateVoiceWav（WAV 格式音质更好），否则使用通用 generateVoice
        if (tts.generateVoiceWav) {
            const audioBuffer = await tts.generateVoiceWav(cleanedText, options);
            return { buffer: audioBuffer, format: AUDIO_CONFIG.defaultFormat };
        }

        const audioBuffer = await tts.generateVoice(cleanedText, options);
        return { buffer: audioBuffer, format: AUDIO_CONFIG.fallbackFormat };
    } catch (error) {
        console.error('[TTS] 语音生成失败:', error.message);
        throw new Error(`语音生成失败: ${error.message}`);
    }
}

/**
 * @description 获取 TTS 服务状态信息，包括提供商名称、可用性、语音列表和风格标签
 * @returns {Object} TTS 服务状态对象，包含 provider、name、available、voices、styleTags、info 等字段
 */
function getTTSStatus() {
    const tts = getTTS();
    const status = {
        provider: getTTSProviderName(),
        name: tts.name,
        available: tts.isAvailable(),
        voices: tts.getVoiceList ? tts.getVoiceList() : []
    };

    if (tts.getStyleTags) {
        status.styleTags = tts.getStyleTags();
    }

    if (tts.getInfo) {
        status.info = tts.getInfo();
    }

    return status;
}

/**
 * @description 流式生成语音，支持多种 TTS 提供商的流式接口
 *              按优先级尝试：情感流式 → 回调流式 → 缓冲流式 → 非流式回退
 * @param {string} text - 要转换的文本
 * @param {Function} sendSSE - 发送 SSE 事件的回调函数，签名为 (eventType: string, data: Object) => void
 * @param {Object} options - TTS 选项，可包含 emotion（情感标签）等
 * @param {string} [options.emotion] - 情感标签，如 happy、sad、calm 等
 * @returns {Promise<void>} 无返回值，通过 sendSSE 回调发送音频数据
 */
async function streamTextToSpeech(text, sendSSE, options = {}) {
    // 文本已在 chatController 中处理，直接使用
    const ttsText = text || FALLBACK_TEXT.empty;
    // 如果未指定情感，从文本中自动提取
    const emotion = options.emotion || textProcessor.extractEmotion(text);

    console.log('[TTS] 开始生成, 长度:', ttsText.length, '内容:', ttsText.substring(0, 60));

    try {
        const tts = getTTS();
        // 优先级1：支持情感标签的流式生成（音质最好，带情感表达）
        if (tts.generateWithEmotionStream) {
            await tts.generateWithEmotionStream(ttsText, emotion, (pcmBuffer) => {
                sendSSE('audio', { 
                    pcm: pcmBuffer.toString('base64'), 
                    sampleRate: AUDIO_CONFIG.sampleRate, 
                    format: AUDIO_CONFIG.format 
                });
            }, { ...options, enhance: false });
            console.log('[TTS] 生成完成');
        // 优先级2：支持回调的流式生成（逐块输出，延迟低）
        } else if (tts.generateVoiceStreamCallback) {
            await tts.generateVoiceStreamCallback(ttsText, (pcmBuffer) => {
                sendSSE('audio', { 
                    pcm: pcmBuffer.toString('base64'), 
                    sampleRate: AUDIO_CONFIG.sampleRate, 
                    format: AUDIO_CONFIG.format 
                });
            }, { ...options, enhance: false });
            console.log('[TTS] 生成完成');
        // 优先级3：缓冲流式生成（一次性生成后分块发送）
        } else if (tts.generateVoiceStream) {
            const pcmBuffer = await tts.generateVoiceStream(ttsText, { ...options, enhance: false });
            const CHUNK_SIZE = STREAMING_CONFIG.chunkSize;
            for (let offset = 0; offset < pcmBuffer.length; offset += CHUNK_SIZE) {
                sendSSE('audio', { 
                    pcm: pcmBuffer.slice(offset, offset + CHUNK_SIZE).toString('base64'), 
                    sampleRate: AUDIO_CONFIG.sampleRate, 
                    format: AUDIO_CONFIG.format 
                });
            }
            console.log('[TTS] 生成完成');
        } else {
            // 优先级4：非流式回退（兼容不支持流式的 TTS 提供商）
            const { buffer: audioBuffer, format } = await textToSpeech(ttsText, options);
            const CHUNK_SIZE = STREAMING_CONFIG.fallbackChunkSize;
            for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
                sendSSE('audio', { 
                    data: audioBuffer.slice(offset, offset + CHUNK_SIZE).toString('base64'), 
                    format: format 
                });
            }
        }
        
        sendSSE('audio_end', {});
    } catch (err) {
        console.error('[TTS] 流式生成错误:', err.message);
        sendSSE('error', { message: '语音生成失败: ' + err.message });
    }
}

/**
 * @description 批量生成语音（用于句子切分后的批量处理），
 *              会先合并短句以减少 TTS 调用次数，提高效率
 * @param {string[]} sentences - 句子数组
 * @param {Function} sendSSE - 发送 SSE 事件的回调函数
 * @param {Object} options - TTS 选项
 * @returns {Promise<void>} 无返回值，通过 sendSSE 回调发送音频数据
 */
async function batchTextToSpeech(sentences, sendSSE, options = {}) {
    // 合并短句，避免对过短的文本单独调用 TTS（短句合成效果差且浪费资源）
    const mergedSentences = textProcessor.mergeShortSentences(sentences);
    
    for (const sentence of mergedSentences) {
        try {
            const { buffer: audioBuffer, format } = await textToSpeech(sentence, options);
            sendSSE('audio', {
                data: audioBuffer.toString('base64'),
                format: format,
                text: sentence
            });
        } catch (error) {
            console.error('[TTS] 句子生成失败:', sentence, error.message);
        }
    }
    
    sendSSE('audio_end', { totalSentences: mergedSentences.length });
}

// ============================================================
// 模块名称：TTS 信息查询
// 功能说明：获取语音列表、风格标签、测试 TTS 可用性
// ============================================================

/**
 * @description 获取当前 TTS 提供商支持的语音列表
 * @returns {Array} 语音列表，若提供商不支持则返回空数组
 */
function getVoiceList() {
    const tts = getTTS();
    if (tts.getVoiceList) {
        return tts.getVoiceList();
    }
    return [];
}

/**
 * @description 获取当前 TTS 提供商支持的语音风格标签（如开心、悲伤等情感标签）
 * @returns {Array} 风格标签列表，若提供商不支持则返回空数组
 */
function getStyleTags() {
    const tts = getTTS();
    if (tts.getStyleTags) {
        return tts.getStyleTags();
    }
    return [];
}

/**
 * @description 测试 TTS 服务是否可用，通过实际生成一段测试音频来验证
 * @returns {Promise<boolean>} TTS 服务是否可用，true 表示可用
 */
async function testTTS() {
    try {
        const tts = getTTS();
        if (!tts.isAvailable()) {
            return false;
        }
        
        // 尝试生成一个简短的测试音频，验证端到端可用性
        const testText = FALLBACK_TEXT.test;
        await textToSpeech(testText, { emotion: 'neutral' });
        return true;
    } catch (error) {
        console.error('[TTS] 测试失败:', error.message);
        return false;
    }
}

module.exports = {
    textToSpeech,
    getTTSStatus,
    streamTextToSpeech,
    batchTextToSpeech,
    getVoiceList,
    getStyleTags,
    testTTS
};
