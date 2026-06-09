/**
 * @file tts_processor.js
 * @description TTS 队列处理器，管理串行 TTS 任务
 * @module services
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */
const { logger } = require('../utils/logger');
const { getCurrentTTSProvider } = require('../services/tts_registry');
const { AUDIO_CONFIG, SENTENCE_CONFIG } = require('../config/streamChatConfig');
const textProcessor = require('../utils/textProcessor');

/**
 * @description 获取 TTS 服务实例
 * @returns {Object} TTS 服务提供者
 */
function getTTS() {
    return getCurrentTTSProvider();
}

/**
 * @description 逐句 TTS 处理
 * @param {string} sentence - 待转换句子
 * @param {string} text - 用户原始输入
 * @param {Function} sendSSE - SSE 发送函数
 * @param {string} personality - 性格模式
 * @param {string|null} dialect - 方言模式
 * @param {Object} voiceConfig - 音色配置
 * @returns {Promise<void>}
 */
async function processSentenceTTS(sentence, text, sendSSE, personality, dialect, voiceConfig) {
    if (!sentence || sentence.trim().length < SENTENCE_CONFIG.minLength) return;
    const cleanSentence = textProcessor.cleanForTTS(sentence) || sentence;
    const ttsText = cleanSentence.trim().length > 0 ? cleanSentence : sentence.trim();
    if (ttsText.length < SENTENCE_CONFIG.minLength) return;

    logger.debug('[逐句TTS] 处理', { text: ttsText.substring(0, 30) });
    const tts = getTTS();
    const emotion = extractEmotion(sentence);
    const ttsOptions = { userMessage: text, emotion, enhance: false, ...voiceConfig };

    if (tts.generateVoiceStreamCallback) {
        await tts.generateVoiceStreamCallback(ttsText, (pcmBuffer) => {
            sendSSE('audio', { pcm: pcmBuffer.toString('base64'), sampleRate: AUDIO_CONFIG.sampleRate, format: AUDIO_CONFIG.format });
        }, ttsOptions);
    }
}

/**
 * @description 从文本提取情感标签
 * @param {string} text - 待提取情感的文本
 * @returns {string} 情感标签
 */
function extractEmotion(text) {
    const { EMOTION_CONFIG } = require('../config/streamChatConfig');
    const styleMatch = text.match(/<style>(.*?)<\/style>/);
    if (styleMatch) return EMOTION_CONFIG.emotionMap[styleMatch[1]] || EMOTION_CONFIG.defaultEmotion;
    for (const [emotion, pattern] of Object.entries(EMOTION_CONFIG.keywords)) {
        if (pattern.test(text)) return emotion;
    }
    return EMOTION_CONFIG.defaultEmotion;
}

/**
 * @description 创建 TTS 任务处理器
 * @param {string} text - 用户原始输入
 * @param {Function} sendSSE - SSE 发送函数
 * @param {string} personality - 性格模式
 * @param {string|null} dialect - 方言模式
 * @returns {Object} { enqueueSentences, waitForDrain, markAllQueued, stopProcessing }
 */
function createTTSProcessor(text, sendSSE, personality, dialect) {
    const pendingTTS = [];
    let ttsProcessing = false;
    let allTTSQueued = false;
    let ttsDrainResolve = null;
    const ttsDrainPromise = new Promise(r => { ttsDrainResolve = r; });
    const sentSentences = new Set();

    async function processPendingTTS() {
        if (ttsProcessing) return;
        ttsProcessing = true;
        try {
            while (pendingTTS.length > 0) {
                const item = pendingTTS.shift();
                try {
                    await processSentenceTTS(item.sentence, text, sendSSE, personality, dialect, item.voiceConfig);
                } catch (e) {
                    logger.error('[TTS异步] 处理失败', { error: e.message });
                }
            }
        } finally {
            ttsProcessing = false;
            if (pendingTTS.length > 0) processPendingTTS();
            else if (allTTSQueued && ttsDrainResolve) { ttsDrainResolve(); ttsDrainResolve = null; }
        }
    }

    return {
        enqueueSentences: (sentences) => {
            for (const s of sentences) {
                const key = s.trim().substring(0, 50);
                if (sentSentences.has(key)) continue;
                sentSentences.add(key);
                pendingTTS.push({ sentence: s });
            }
            processPendingTTS();
        },
        waitForDrain: () => ttsDrainPromise,
        markAllQueued: () => {
            allTTSQueued = true;
            if (pendingTTS.length === 0 && !ttsProcessing && ttsDrainResolve) { ttsDrainResolve(); ttsDrainResolve = null; }
        },
        stopProcessing: () => {
            pendingTTS.length = 0;
            allTTSQueued = true;
            if (ttsDrainResolve) { ttsDrainResolve(); ttsDrainResolve = null; }
        }
    };
}

module.exports = { createTTSProcessor, processSentenceTTS, extractEmotion };