/**
 * @file volcano_tts.js
 * @description 火山引擎 TTS 服务，基于字节跳动语音合成 API 提供语音合成功能
 * @module services/volcano_tts
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');

// ============================================================
// 常量配置：火山引擎 TTS 相关参数
// ============================================================

/** 火山引擎 TTS API 地址 */
const VOLCANO_TTS_API_URL = 'https://openspeech.bytedance.com/api/v1/tts';

/** 默认用户ID（火山引擎 API 要求） */
const DEFAULT_USER_UID = 'user_001';

/** 默认音色配置：傲娇女友音色 */
const DEFAULT_VOICE_CONFIG = {
    voice_type: 'ICL_zh_female_aojiaonvyou_tob',
    encoding: 'mp3',
    speed_ratio: 0.85,
    volume_ratio: 1.0,
    pitch_ratio: 1.0
};

// ============================================================
// 火山引擎 TTS 服务类
// ============================================================

class VolcanoTTSService {
    /**
     * @description 构造函数，初始化 API 配置和默认音色
     */
    constructor() {
        this.name = 'Volcano TTS';
        this.apiUrl = VOLCANO_TTS_API_URL;
        this.apiKey = process.env.VOLCANO_API_KEY;
        this.appId = process.env.VOLCANO_APP_ID || '';

        // 默认音色配置
        this.defaultVoice = { ...DEFAULT_VOICE_CONFIG };
    }

    /**
     * @description 调用火山引擎 TTS API 生成语音
     * @param {string} text - 要转换的文本
     * @param {Object} [options={}] - 可选音色配置，会覆盖默认配置
     * @returns {Promise<Buffer>} 音频数据（MP3 格式）
     * @throws {Error} API Key 未配置、返回格式错误或请求失败时抛出错误
     */
    async generateVoice(text, options = {}) {
        console.log(`[${this.name}] 生成语音: ${text.substring(0, 50)}...`);

        if (!this.apiKey) {
            throw new Error('火山引擎 API Key 未配置');
        }

        try {
            const voiceConfig = { ...this.defaultVoice, ...options };
            
            const response = await axios.post(
                this.apiUrl,
                {
                    app: {
                        appid: this.appId,
                        token: this.apiKey,
                        cluster: 'volcano_tts'
                    },
                    user: {
                        uid: DEFAULT_USER_UID
                    },
                    audio: voiceConfig,
                    request: {
                        reqid: Date.now().toString(),
                        text: text,
                        text_type: 'plain',
                        operation: 'query'
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

            // 火山引擎返回 base64 编码的音频
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
     * @description 获取可用音色列表
     * @returns {Array<Object>} 音色列表，每项包含 id/name/language/gender
     */
    getVoiceList() {
        return [
            { id: 'ICL_zh_female_aojiaonvyou_tob', name: '傲娇女友', language: '中文', gender: '女' },
            { id: 'BV001_streaming', name: '标准女声', language: '中文', gender: '女' },
            { id: 'BV002_streaming', name: '标准男声', language: '中文', gender: '男' },
        ];
    }

    /**
     * @description 检查服务是否可用（API Key 已配置即视为可用）
     * @returns {boolean} 是否可用
     */
    isAvailable() {
        return !!this.apiKey;
    }
}

module.exports = new VolcanoTTSService();
