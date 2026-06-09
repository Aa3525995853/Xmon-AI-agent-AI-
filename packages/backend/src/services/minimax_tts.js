/**
 * @file minimax_tts.js
 * @description MiniMax TTS 语音合成服务，封装 MiniMax 语音合成 API，
 *              支持文本转语音、多音色选择和服务可用性检测
 * @module services/minimax_tts
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');

// ============================================================
// 模块名称：MiniMaxTTSService 类
// 功能说明：MiniMax 语音合成服务核心实现
// ============================================================

/** MiniMax TTS API 默认采样率 */
const DEFAULT_SAMPLE_RATE = 32000;

/** MiniMax TTS API 默认比特率 */
const DEFAULT_BITRATE = 128000;

/** MiniMax TTS API 默认音频格式 */
const DEFAULT_AUDIO_FORMAT = 'mp3';

/** MiniMax TTS API 默认声道数 */
const DEFAULT_CHANNEL_COUNT = 1;

class MiniMaxTTSService {
    /**
     * @description 构造函数，初始化 MiniMax TTS API 配置和默认音色
     */
    constructor() {
        this.name = 'MiniMax TTS';
        this.apiUrl = 'https://api.minimax.chat/v1/t2a_v2';
        this.apiKey = process.env.MINIMAX_API_KEY;

        // 默认音色配置：少女音色，语速 0.85
        this.defaultVoice = {
            voice_id: 'female-shaonv',
            speed: 0.85,
            vol: 1.0,
            pitch: 0
        };
    }

    /**
     * @description 将文本转换为语音音频
     * @param {string} text - 要转换的文本
     * @param {Object} options - 可选音色配置，会与默认配置合并
     * @param {string} options.voice_id - 音色 ID
     * @param {number} options.speed - 语速
     * @param {number} options.vol - 音量
     * @param {number} options.pitch - 音调
     * @returns {Promise<Buffer>} 音频数据（MP3 格式）
     * @throws {Error} API Key 未配置或 API 调用失败时抛出异常
     */
    async generateVoice(text, options = {}) {
        console.log(`[${this.name}] 生成语音: ${text.substring(0, 50)}...`);

        if (!this.apiKey) {
            throw new Error('MiniMax API Key 未配置');
        }

        try {
            const voiceConfig = { ...this.defaultVoice, ...options };
            
            const response = await axios.post(
                this.apiUrl,
                {
                    model: 'speech-01-turbo',
                    text: text,
                    stream: false,
                    voice_setting: voiceConfig,
                    audio_setting: {
                        sample_rate: DEFAULT_SAMPLE_RATE,
                        bitrate: DEFAULT_BITRATE,
                        format: DEFAULT_AUDIO_FORMAT,
                        channel: DEFAULT_CHANNEL_COUNT
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    responseType: 'json',
                    proxy: false
                }
            );

            // MiniMax 返回 base64 编码的音频
            if (response.data && response.data.data && response.data.data.audio) {
                const audioBase64 = response.data.data.audio;
                const audioBuffer = Buffer.from(audioBase64, 'base64');
                console.log(`[${this.name}] 音频生成成功！大小: ${audioBuffer.length} bytes`);
                return audioBuffer;
            } else {
                console.error(`[${this.name}] 返回格式错误:`, response.data);
                throw new Error('API 返回格式错误');
            }
        } catch (error) {
            console.error(`[${this.name}] 调用失败:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * @description 获取可用的音色列表
     * @returns {Array<{id: string, name: string, language: string, gender: string}>} 音色列表
     */
    getVoiceList() {
        return [
            { id: 'female-shaonv', name: '少女', language: '中文', gender: '女' },
            { id: 'female-yujie', name: '御姐', language: '中文', gender: '女' },
            { id: 'male-qingnian', name: '青年', language: '中文', gender: '男' },
        ];
    }

    /**
     * @description 检查 MiniMax TTS 服务是否可用（API Key 是否已配置）
     * @returns {boolean} 是否可用
     */
    isAvailable() {
        return !!this.apiKey;
    }
}

// ============================================================
// 模块名称：模块导出
// 功能说明：导出 MiniMaxTTSService 单例实例
// ============================================================

module.exports = new MiniMaxTTSService();
