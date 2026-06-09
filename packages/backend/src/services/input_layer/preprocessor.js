/**
 * @file preprocessor.js
 * @description 输入预处理器 - 将各种格式的输入（Base64、文件路径、URL）统一转换为可处理的标准格式
 * @module input_layer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

/** 输入类型枚举 */
const InputType = { TEXT: 'text', IMAGE: 'image', AUDIO: 'audio', FILE: 'file', URL: 'url' };

class Preprocessor {
    constructor() {
        /** 临时文件存储目录 */
        this.tempDir = path.join(os.tmpdir(), 'dream-input');
        this._ensureTempDir();
    }

    /**
     * @description 确保临时目录存在
     */
    _ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * @description 预处理输入 - 根据输入类型路由到对应的预处理方法
     * @param {*} input - 原始输入数据
     * @param {string} inputType - 输入类型（InputType 枚举值）
     * @param {Object} options - 预处理选项
     * @returns {Promise<Object>} 预处理结果 { content, size, mimeType, metadata }
     */
    async preprocess(input, inputType, options) {
        const preprocessed = { content: null, size: 0, mimeType: null, metadata: {} };

        switch (inputType) {
            case InputType.TEXT:
                preprocessed.content = typeof input === 'string' ? input : input.content;
                preprocessed.mimeType = 'text/plain';
                break;

            case InputType.IMAGE:
                preprocessed.content = await this._preprocessImage(input);
                preprocessed.mimeType = 'image/png';
                break;

            case InputType.AUDIO:
                preprocessed.content = await this._preprocessAudio(input);
                preprocessed.mimeType = 'audio/webm';
                break;

            case InputType.FILE:
                preprocessed.content = await this._preprocessFile(input);
                break;

            case InputType.URL:
                preprocessed.content = typeof input === 'string' ? input : input.url;
                preprocessed.mimeType = 'text/url';
                break;
        }

        return preprocessed;
    }

    /**
     * @description 预处理图片 - 支持 Base64、文件路径和 URL 三种来源
     * @param {Object} input - 图片输入对象 { imageBase64, imagePath, imageUrl, mimeType }
     * @returns {Promise<Object>} 预处理结果 { base64, mimeType }
     * @throws {Error} 图片文件不存在时抛出错误
     */
    async _preprocessImage(input) {
        let imageData;

        if (input.imageBase64) {
            imageData = input.imageBase64;
            if (imageData.startsWith('data:')) {
                imageData = imageData.split(',')[1];
            }
        } else if (input.imagePath) {
            if (!fs.existsSync(input.imagePath)) throw new Error('图片文件不存在');
            imageData = fs.readFileSync(input.imagePath).toString('base64');
        } else if (input.imageUrl) {
            imageData = await this._downloadImage(input.imageUrl);
        } else if (typeof input === 'string' && !input.startsWith('http')) {
            imageData = input;
        }

        return { base64: imageData, mimeType: input.mimeType || 'image/png' };
    }

    /**
     * @description 预处理音频 - 支持 Base64、文件路径和 URL 三种来源
     * @param {Object} input - 音频输入对象 { audioBase64, audioPath, audioUrl, mimeType, duration }
     * @returns {Promise<Object>} 预处理结果 { base64, mimeType, duration }
     * @throws {Error} 音频文件不存在时抛出错误
     */
    async _preprocessAudio(input) {
        let audioData;

        if (input.audioBase64) {
            audioData = input.audioBase64;
            if (audioData.startsWith('data:')) {
                audioData = audioData.split(',')[1];
            }
        } else if (input.audioPath) {
            if (!fs.existsSync(input.audioPath)) throw new Error('音频文件不存在');
            audioData = fs.readFileSync(input.audioPath).toString('base64');
        } else if (input.audioUrl) {
            audioData = await this._downloadAudio(input.audioUrl);
        }

        return { base64: audioData, mimeType: input.mimeType || 'audio/webm', duration: input.duration };
    }

    /**
     * @description 预处理文件 - 支持 filePath、fileUrl 和 fileBuffer 三种来源
     * @param {Object} input - 文件输入对象 { filePath, fileUrl, fileBuffer, originalName }
     * @returns {Promise<Object>} 预处理结果 { path, buffer, type, originalName }
     */
    async _preprocessFile(input) {
        let filePath;
        let fileBuffer;
        let fileType;

        if (input.filePath) {
            filePath = input.filePath;
            fileType = path.extname(filePath).toLowerCase();
        } else if (input.fileUrl) {
            filePath = await this._downloadFileToTemp(input.fileUrl);
            fileType = path.extname(filePath).toLowerCase();
        } else if (input.fileBuffer) {
            fileBuffer = input.fileBuffer;
        }

        if (!fileType && filePath) {
            fileType = path.extname(filePath).toLowerCase();
        }

        return { path: filePath, buffer: fileBuffer, type: fileType, originalName: input.originalName };
    }

    /**
     * @description 下载图片并转为 Base64
     * @param {string} url - 图片 URL
     * @returns {Promise<string>} Base64 编码的图片数据
     */
    _downloadImage(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const chunks = [];

            client.get(url, (res) => {
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    resolve(buffer.toString('base64'));
                });
                res.on('error', reject);
            }).on('error', reject);
        });
    }

    /**
     * @description 下载音频并转为 Base64（复用图片下载逻辑）
     * @param {string} url - 音频 URL
     * @returns {Promise<string>} Base64 编码的音频数据
     */
    _downloadAudio(url) {
        return this._downloadImage(url);
    }

    /**
     * @description 下载文件到临时目录 - 使用时间戳和随机字节生成唯一文件名
     * @param {string} url - 文件 URL
     * @returns {Promise<string>} 下载后的本地文件路径
     */
    async _downloadFileToTemp(url) {
        const filename = `input_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${path.extname(url)}`;
        const filepath = path.join(this.tempDir, filename);

        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const chunks = [];

            client.get(url, (res) => {
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    fs.writeFileSync(filepath, buffer);
                    resolve(filepath);
                });
                res.on('error', reject);
            }).on('error', reject);
        });
    }
}

module.exports = new Preprocessor();