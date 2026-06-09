/**
 * @file index.js
 * @description MiMo TTS 服务主入口 - 提供 MiMo 语音合成能力，
 *              支持情感标签、风格规范化、PCM 音频处理和流式语音生成
 * @module mimo_tts
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');
const https = require('https');
const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载：子模块按需引入
// ============================================================

/** @type {EmotionAnalyzer|null} 情感分析器延迟加载缓存 */
let _emotionAnalyzer = null;
/** @type {StyleNormalizer|null} 风格规范化器延迟加载缓存 */
let _styleNormalizer = null;

/**
 * @description 延迟加载情感分析器
 * @returns {EmotionAnalyzer} 情感分析器实例
 */
function getEmotionAnalyzer() {
    if (!_emotionAnalyzer) _emotionAnalyzer = require('./emotion_analyzer');
    return _emotionAnalyzer;
}

/**
 * @description 延迟加载风格规范化器
 * @returns {StyleNormalizer} 风格规范化器实例
 */
function getStyleNormalizer() {
    if (!_styleNormalizer) _styleNormalizer = require('./style_normalizer');
    return _styleNormalizer;
}

// ============================================================
// 常量定义
// ============================================================

/** API 请求超时时间（毫秒） */
const API_TIMEOUT = 30000;

/** 默认采样率（Hz） */
const DEFAULT_SAMPLE_RATE = 24000;

/** PCM 淡入采样数 */
const FADE_IN_SAMPLES = 240;

/** PCM 淡出采样数 */
const FADE_OUT_SAMPLES = 480;

/** 尾部静音时长（毫秒） */
const TAIL_SILENCE_MS = 60;

/** 流式处理的数据块大小（字节） */
const STREAM_CHUNK_SIZE = 4096;

/** 中性情感时的默认语速 */
const NEUTRAL_SPEECH_RATE = 0.9;

/** 有情感时的默认语速 */
const EMOTIONAL_SPEECH_RATE = 1.0;

/** 空文本的默认回退值 */
const EMPTY_TEXT_FALLBACK = '嗯';

// ============================================================
// HTTP 客户端与核心类
// ============================================================

/** Axios 实例 - 禁用代理，启用 HTTPS 证书验证 */
const axiosInstance = axios.create({
    proxy: false,
    httpsAgent: new https.Agent({ rejectUnauthorized: true })
});

/**
 * MiMoTTSService - MiMo TTS 语音合成服务
 * 支持情感检测、风格规范化、PCM 音频平滑处理和流式语音生成
 */
class MimoTTSService {
    /**
     * @description 构造函数，初始化 API 配置和默认参数
     */
    constructor() {
        this.name = 'MiMo TTS';
        this.apiUrl = process.env.MIMO_TTS_API_URL || 'https://api.xiaomimimo.com/v1';
        this.apiKey = process.env.MIMO_TTS_API_KEY;

        this.defaultConfig = {
            model: 'mimo-v2-tts',
            voice: 'mimo_default',
            format: 'wav',
            stream: false
        };

        logger.info('[MiMo TTS] 初始化完成');
    }

    /**
     * @description 清理 TTS 输入文本，移除 HTML 标签、代码块、括号注释和 Emoji，
     *              同时保留并规范化 <style> 标签
     * @param {string} text - 原始文本
     * @returns {string} 清理后的文本，空文本返回 '嗯'
     */
    sanitizeTtsText(text) {
        let finalText = String(text || '');
        const stylePlaceholders = [];
        finalText = finalText.replace(/<style>[\s\S]*?<\/style>/gi, (match) => {
            const style = match.replace(/<\/?style[^>]*>/gi, '');
            const normalized = getStyleNormalizer().normalize(style);
            stylePlaceholders.push(normalized ? `<style>${normalized}</style>` : '');
            return `\x00STYLE_${stylePlaceholders.length - 1}\x00`;
        });

        finalText = finalText.replace(/<[^>]+>/g, '');
        finalText = finalText.replace(/```[\s\S]*?```/g, '');
        finalText = finalText.replace(/（[^）]*）/g, '');
        finalText = finalText.replace(/\([^)]*\)/g, '');
        finalText = finalText.replace(/\p{Extended_Pictographic}|[\u{FE00}-\u{FE0F}]|[\u{200D}]|[\u{1F3FB}-\u{1F3FF}]/gu, '');
        finalText = finalText.replace(/\s+/g, ' ').trim();
        finalText = finalText.replace(/\x00STYLE_(\d+)\x00/g, (_, i) => stylePlaceholders[parseInt(i)]);

        return finalText || EMPTY_TEXT_FALLBACK;
    }

    /**
     * @description 规范化 PCM16 缓冲区，确保字节长度为偶数（16位对齐）
     * @param {Buffer} buffer - PCM 音频缓冲区
     * @returns {Buffer} 对齐后的缓冲区
     */
    normalizePcm16(buffer) {
        if (!Buffer.isBuffer(buffer)) return Buffer.alloc(0);
        return buffer.length % 2 === 0 ? buffer : buffer.slice(0, buffer.length - 1);
    }

    /**
     * @description 对 PCM16 音频数据进行平滑处理，包括去直流偏移、软限幅、淡入淡出
     * @param {Buffer} buffer - PCM16 音频缓冲区
     * @param {Object} [options={}] - 处理选项
     * @param {number} [options.fadeInSamples=0] - 淡入采样数
     * @param {number} [options.fadeOutSamples=0] - 淡出采样数
     * @param {boolean} [options.removeDc=true] - 是否移除直流偏移
     * @param {boolean} [options.softLimit=true] - 是否启用软限幅
     * @returns {Buffer} 处理后的 PCM16 缓冲区
     */
    smoothPcm16(buffer, options = {}) {
        const {
            fadeInSamples = 0,
            fadeOutSamples = 0,
            removeDc = true,
            softLimit = true
        } = options;

        const pcm = this.normalizePcm16(buffer);
        const output = Buffer.from(pcm);
        const sampleCount = Math.floor(output.length / 2);
        if (sampleCount === 0) return output;

        let dcOffset = 0;
        if (removeDc) {
            for (let i = 0; i < sampleCount; i++) {
                dcOffset += output.readInt16LE(i * 2);
            }
            dcOffset = Math.round(dcOffset / sampleCount);
        }

        let rmsSum = 0;
        let rmsCount = 0;
        if (softLimit) {
            for (let i = 0; i < sampleCount; i++) {
                const val = output.readInt16LE(i * 2) - dcOffset;
                rmsSum += val * val;
                rmsCount++;
            }
        }
        const rms = rmsCount > 0 ? Math.sqrt(rmsSum / rmsCount) : 0;
        const peakThreshold = Math.max(rms * 4, 8000);

        const fadeIn = Math.min(fadeInSamples, sampleCount);
        const fadeOut = Math.min(fadeOutSamples, sampleCount);

        for (let i = 0; i < sampleCount; i++) {
            let sample = output.readInt16LE(i * 2) - dcOffset;

            if (softLimit && rms > 0) {
                const absVal = Math.abs(sample);
                if (absVal > peakThreshold) {
                    const ratio = peakThreshold / absVal;
                    sample = sample * (0.7 + 0.3 * ratio);
                }
            }

            if (fadeIn > 0 && i < fadeIn) {
                sample *= i / fadeIn;
            }

            if (fadeOut > 0 && i >= sampleCount - fadeOut) {
                const pos = i - (sampleCount - fadeOut);
                sample *= (fadeOut - pos - 1) / fadeOut;
            }

            const clamped = Math.max(-32768, Math.min(32767, Math.round(sample)));
            output.writeInt16LE(clamped, i * 2);
        }

        if (fadeOut > 0) {
            output.writeInt16LE(0, (sampleCount - 1) * 2);
        }

        return output;
    }

    /**
     * @description 在 PCM 缓冲区末尾追加静音数据，避免音频突然截断
     * @param {Buffer} buffer - PCM 音频缓冲区
     * @param {number} [sampleRate=24000] - 采样率（Hz）
     * @param {number} [silenceMs=60] - 静音时长（毫秒）
     * @returns {Buffer} 追加静音后的缓冲区
     */
    appendTailSilence(buffer, sampleRate = DEFAULT_SAMPLE_RATE, silenceMs = TAIL_SILENCE_MS) {
        const silenceBytes = Math.round(sampleRate * (silenceMs / 1000)) * 2;
        return Buffer.concat([buffer, Buffer.alloc(silenceBytes)]);
    }

    /**
     * @description 将 PCM 原始音频数据转换为 WAV 格式（添加 44 字节 WAV 头）
     * @param {Buffer} pcmBuffer - PCM 音频缓冲区
     * @param {number} [sampleRate=24000] - 采样率（Hz）
     * @returns {Buffer} WAV 格式的音频缓冲区
     */
    pcmToWav(pcmBuffer, sampleRate = DEFAULT_SAMPLE_RATE) {
        const wavHeader = Buffer.alloc(44);
        const dataSize = pcmBuffer.length;

        wavHeader.write('RIFF', 0);
        wavHeader.writeUInt32LE(36 + dataSize, 4);
        wavHeader.write('WAVE', 8);
        wavHeader.write('fmt ', 12);
        wavHeader.writeUInt32LE(16, 16);
        wavHeader.writeUInt16LE(1, 20);
        wavHeader.writeUInt16LE(1, 22);
        wavHeader.writeUInt32LE(sampleRate, 24);
        wavHeader.writeUInt32LE(sampleRate * 2, 28);
        wavHeader.writeUInt16LE(2, 32);
        wavHeader.writeUInt16LE(16, 34);
        wavHeader.write('data', 36);
        wavHeader.writeUInt32LE(dataSize, 40);

        return Buffer.concat([wavHeader, pcmBuffer]);
    }

    /**
     * @description 调用 MiMo TTS API 生成语音（PCM 格式），自动检测情感和风格
     * @param {string} text - 待合成的文本
     * @param {Object} [options={}] - 合成选项
     * @param {string} [options.voice] - 语音角色
     * @param {string} [options.emotion] - 显式指定的情感
     * @param {string} [options.style] - 显式指定的风格
     * @param {number} [options.speech_rate] - 语速
     * @returns {Promise<Buffer>} PCM 格式的音频缓冲区
     * @throws {Error} API Key 未配置或 API 调用失败时抛出异常
     */
    async generateVoice(text, options = {}) {
        if (!this.apiKey) {
            throw new Error('MiMo TTS API Key 未配置');
        }

        const cleanText = this.sanitizeTtsText(text);
        logger.info(`[${this.name}] 生成语音: ${cleanText.substring(0, 50)}...`);

        const detectedEmotion = getEmotionAnalyzer().detect(text, options.emotion);
        const normalizedStyle = getStyleNormalizer().normalize(options.style || options.emotion || detectedEmotion);

        try {
            const payload = {
                model: this.defaultConfig.model,
                voice: options.voice || this.defaultConfig.voice,
                input: cleanText,
                response_format: 'pcm',
                speed: options.speech_rate || (detectedEmotion && detectedEmotion !== 'neutral' ? EMOTIONAL_SPEECH_RATE : NEUTRAL_SPEECH_RATE)
            };

            if (normalizedStyle) {
                payload.input = `<style>${normalizedStyle}</style>${cleanText}`;
            }

            const response = await axiosInstance.post(
                `${this.apiUrl}/audio/speech`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: API_TIMEOUT
                }
            );

            let audioBuffer = Buffer.from(response.data);

            audioBuffer = this.smoothPcm16(audioBuffer, {
                fadeInSamples: FADE_IN_SAMPLES,
                fadeOutSamples: FADE_OUT_SAMPLES,
                removeDc: true,
                softLimit: true
            });

            audioBuffer = this.appendTailSilence(audioBuffer, DEFAULT_SAMPLE_RATE, TAIL_SILENCE_MS);

            return audioBuffer;
        } catch (error) {
            logger.error(`[${this.name}] 生成失败:`, error.response?.status, error.message);
            throw error;
        }
    }

    /**
     * @description 生成 WAV 格式的语音数据
     * @param {string} text - 待合成的文本
     * @param {Object} [options={}] - 合成选项
     * @returns {Promise<Buffer>} WAV 格式的音频缓冲区
     */
    async generateVoiceWav(text, options = {}) {
        const pcmBuffer = await this.generateVoice(text, options);
        return this.pcmToWav(pcmBuffer);
    }

    /**
     * @description 流式调用 MiMo TTS API 生成语音，返回可读流
     * @param {string} text - 待合成的文本
     * @param {Object} [options={}] - 合成选项
     * @returns {Promise<ReadableStream>} PCM 音频数据流
     * @throws {Error} API Key 未配置或 API 调用失败时抛出异常
     */
    async generateVoiceStream(text, options = {}) {
        if (!this.apiKey) {
            throw new Error('MiMo TTS API Key 未配置');
        }

        const cleanText = this.sanitizeTtsText(text);
        logger.info(`[${this.name}] 流式生成语音: ${cleanText.substring(0, 50)}...`);

        const detectedEmotion = getEmotionAnalyzer().detect(text, options.emotion);
        const normalizedStyle = getStyleNormalizer().normalize(options.style || options.emotion || detectedEmotion);

        try {
            const payload = {
                model: this.defaultConfig.model,
                voice: options.voice || this.defaultConfig.voice,
                input: cleanText,
                response_format: 'pcm',
                speed: options.speech_rate || (detectedEmotion && detectedEmotion !== 'neutral' ? EMOTIONAL_SPEECH_RATE : NEUTRAL_SPEECH_RATE),
                stream: true
            };

            if (normalizedStyle) {
                payload.input = `<style>${normalizedStyle}</style>${cleanText}`;
            }

            // 使用流式响应，边接收边处理
            const response = await axiosInstance.post(
                `${this.apiUrl}/audio/speech`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'stream',
                    timeout: API_TIMEOUT
                }
            );

            return response.data;
        } catch (error) {
            logger.error(`[${this.name}] 流式生成失败:`, error.response?.status, error.message);
            throw error;
        }
    }

    /**
     * @description 流式生成语音并通过回调函数逐块输出，流式失败时自动回退到非流式模式
     * @param {string} text - 待合成的文本
     * @param {Function} callback - 音频数据块回调函数，签名为 (chunk: Buffer) => void
     * @param {Object} [options={}] - 合成选项
     * @returns {Promise<void>} 生成完成后 resolve
     */
    async generateVoiceStreamCallback(text, callback, options = {}) {
        // 尝试流式模式
        try {
            const stream = await this.generateVoiceStream(text, options);
            let buffer = Buffer.alloc(0);
            let isFirstChunk = true;

            return new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    buffer = Buffer.concat([buffer, chunk]);

                    // 达到一定大小或结束时处理
                    if (buffer.length >= STREAM_CHUNK_SIZE || isFirstChunk) {
                        const toSend = buffer.slice(0, STREAM_CHUNK_SIZE);
                        buffer = buffer.slice(STREAM_CHUNK_SIZE);

                        // 应用音频处理（第一个chunk加淡入）
                        const processed = this.smoothPcm16(toSend, {
                            fadeInSamples: isFirstChunk ? FADE_IN_SAMPLES : 0,
                            fadeOutSamples: 0,
                            removeDc: true,
                            softLimit: true
                        });

                        callback(processed);
                        isFirstChunk = false;
                    }
                });

                stream.on('end', () => {
                    // 发送剩余数据 + 尾部静音
                    if (buffer.length > 0) {
                        const processed = this.smoothPcm16(buffer, {
                            fadeInSamples: 0,
                            fadeOutSamples: FADE_OUT_SAMPLES,
                            removeDc: true,
                            softLimit: true
                        });
                        callback(processed);
                    }

                    // 添加尾部静音
                    const silence = Buffer.alloc(Math.round(DEFAULT_SAMPLE_RATE * (TAIL_SILENCE_MS / 1000)) * 2);
                    callback(silence);

                    resolve();
                });

                stream.on('error', (err) => {
                    logger.warn(`[${this.name}] 流式处理错误，回退到非流式:`, err.message);
                    reject(err); // 让调用方处理回退
                });
            });
        } catch (streamError) {
            // 流式失败，回退到非流式模式
            logger.warn(`[${this.name}] 流式模式失败，回退到非流式...`);
            const pcmBuffer = await this.generateVoice(text, options);

            // 第一个chunk加淡入
            if (pcmBuffer.length > 0) {
                const firstChunk = pcmBuffer.slice(0, STREAM_CHUNK_SIZE);
                const processed = this.smoothPcm16(firstChunk, {
                    fadeInSamples: FADE_IN_SAMPLES,
                    fadeOutSamples: 0,
                    removeDc: true,
                    softLimit: true
                });
                callback(processed);
            }

            // 发送剩余chunk
            for (let offset = STREAM_CHUNK_SIZE; offset < pcmBuffer.length; offset += STREAM_CHUNK_SIZE) {
                const chunk = pcmBuffer.slice(offset, offset + STREAM_CHUNK_SIZE);
                callback(chunk);
            }

            // 尾部静音
            const silence = Buffer.alloc(Math.round(24000 * 0.06) * 2);
            callback(silence);
        }
    }

    /**
     * @description 检查 TTS 服务是否可用（API Key 和 URL 已配置）
     * @returns {boolean} 服务是否可用
     */
    isAvailable() {
        return !!(this.apiKey && this.apiUrl);
    }

    /**
     * @description 获取支持的风格标签列表
     * @returns {string[]} 风格标签数组
     */
    getStyleTags() {
        return getStyleNormalizer().getValidStyles();
    }

    /**
     * @description 获取支持的语音角色列表
     * @returns {string[]} 语音角色数组
     */
    getVoiceList() {
        return ['mimo_default'];
    }

    /**
     * @description 获取 TTS 服务信息摘要
     * @returns {{name: string, available: boolean, model: string, voice: string, supportedStyles: string[]}} 服务信息
     */
    getInfo() {
        return {
            name: this.name,
            available: this.isAvailable(),
            model: this.defaultConfig.model,
            voice: this.defaultConfig.voice,
            supportedStyles: this.getStyleTags()
        };
    }
}

module.exports = new MimoTTSService();
