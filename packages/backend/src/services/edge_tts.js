/**
 * @file edge_tts.js
 * @description 微软 Edge 浏览器 TTS 服务（免费），通过 edge-tts 命令行工具
 *              将文本转换为语音，支持多种中文音色和语速/音量调节
 * @module services/edge_tts
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { spawn } = require('child_process');
const path = require('path');

// ============================================================
// 常量定义：Edge TTS 默认配置
// ============================================================

/** 默认中文女声音色标识 */
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

/** 默认语速倍率 */
const DEFAULT_SPEED = 0.85;

/** 默认音量倍率 */
const DEFAULT_VOLUME = 1.0;

/** 语速/音量转换为百分比的基数 */
const PERCENTAGE_BASE = 100;

// ============================================================
// 模块：Edge TTS 服务
// 功能说明：封装 edge-tts 命令行工具，提供文本转语音能力
// ============================================================

class EdgeTTSService {
    constructor() {
        this.name = 'Edge TTS';
        this.defaultVoice = DEFAULT_VOICE;
    }

    /**
     * @description 将文本转换为语音音频数据
     * @param {string} text - 要转换的文本内容
     * @param {Object} options - 可选配置
     * @param {string} [options.voice] - 音色标识，默认 zh-CN-XiaoxiaoNeural
     * @param {number} [options.speed] - 语速倍率，默认 0.85
     * @param {number} [options.volume] - 音量倍率，默认 1.0
     * @returns {Promise<Buffer>} 音频数据的 Buffer 对象
     * @throws {Error} edge-tts 进程执行失败时抛出错误
     */
    async generateVoice(text, options = {}) {
        console.log(`[${this.name}] 生成语音: ${text.substring(0, 50)}...`);

        const voice = options.voice || this.defaultVoice;
        
        return new Promise((resolve, reject) => {
            const chunks = [];
            
            // 使用 edge-tts 命令行工具，通过 stdout 输出音频流
            const edgeTTS = spawn('edge-tts', [
                '--voice', voice,
                '--text', text,
                '--write-media', '-',  // 输出到 stdout
                '--rate', `${(options.speed || DEFAULT_SPEED) * PERCENTAGE_BASE}%`,
                '--volume', `${(options.volume || DEFAULT_VOLUME) * PERCENTAGE_BASE}%`
            ]);

            edgeTTS.stdout.on('data', (data) => {
                chunks.push(data);
            });

            edgeTTS.stderr.on('data', (data) => {
                console.error(`[${this.name}] ${data}`);
            });

            edgeTTS.on('close', (code) => {
                if (code === 0) {
                    const audioBuffer = Buffer.concat(chunks);
                    console.log(`[${this.name}] 音频生成成功！大小: ${audioBuffer.length} bytes`);
                    resolve(audioBuffer);
                } else {
                    reject(new Error(`Edge TTS 进程退出码: ${code}`));
                }
            });

            edgeTTS.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * @description 获取可用的中文音色列表
     * @returns {Array<Object>} 音色信息数组，每项包含 id/name/language/gender
     */
    getVoiceList() {
        return [
            { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', language: '中文', gender: '女' },
            { id: 'zh-CN-YunyangNeural', name: '云扬', language: '中文', gender: '男' },
            { id: 'zh-CN-YunxiNeural', name: '云希', language: '中文', gender: '男' },
            { id: 'zh-CN-XiaoyiNeural', name: '晓伊', language: '中文', gender: '女' },
            { id: 'zh-HK-HiuMaanNeural', name: '晓曼', language: '中文(粤语)', gender: '女' },
            { id: 'zh-TW-HsiaoChenNeural', name: '晓臻', language: '中文(台湾)', gender: '女' },
        ];
    }

    /**
     * @description 检查 Edge TTS 服务是否可用
     * @returns {boolean} 始终返回 true，Edge TTS 不需要 API Key，只需网络连接
     */
    isAvailable() {
        return true;
    }
}

module.exports = new EdgeTTSService();
