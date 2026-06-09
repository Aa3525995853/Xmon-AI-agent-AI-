/**
 * @file input_layer.js
 * @description 输入解析层 - 检测并处理各种类型的用户输入（文本/URL/图片/文件/语音）
 * @module services/executor
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class InputLayer {
    /**
     * @description 处理各种类型的输入，自动检测类型并路由到对应处理器
     * @param {string|Object} input - 用户输入，可以是文本字符串或包含特定属性的对象
     * @returns {Promise<{text: string, type: string, [url]?: string, [path]?: string, [description]?: string}>} 解析后的输入
     */
    async process(input) {
        // 检测输入类型
        const type = this._detectType(input);

        switch (type) {
            case 'text':
                return { text: input, type: 'text' };

            case 'url':
                return await this._processUrl(input);

            case 'image':
                return await this._processImage(input);

            case 'file':
                return await this._processFile(input);

            case 'voice':
                return await this._processVoice(input);

            default:
                return { text: String(input), type: 'unknown' };
        }
    }

    /**
     * @description 检测输入类型，根据格式特征判断为 text/url/image/file/voice
     * @param {string|Object} input - 用户输入
     * @returns {string} 输入类型：text/url/image/file/voice/unknown
     * @private
     */
    _detectType(input) {
        if (typeof input !== 'string') {
            if (input.buffer || input.audio) return 'voice';
            if (input.image || input.url?.startsWith('data:')) return 'image';
            if (input.path || input.file) return 'file';
            return 'unknown';
        }

        // 检测 URL
        if (/^https?:\/\//i.test(input)) return 'url';

        // 检测图片数据
        if (/^data:image/i.test(input)) return 'image';

        // 检测文件路径
        if (/^[A-Za-z]:\\|^\//.test(input) && /\.(pdf|doc|docx|xlsx|txt)$/i.test(input)) {
            return 'file';
        }

        return 'text';
    }

    /**
     * @description 处理URL输入，根据域名判断为视频/代码/普通网页
     * @param {string} url - URL地址
     * @returns {Promise<{text: string, type: string, url: string}>} 解析结果
     * @private
     */
    async _processUrl(url) {
        // 判断 URL 类型
        if (url.includes('youtube') || url.includes('bilibili')) {
            return { text: `播放视频: ${url}`, type: 'video', url };
        }

        if (url.includes('github')) {
            return { text: `查看代码: ${url}`, type: 'code', url };
        }

        return { text: `打开网页: ${url}`, type: 'url', url };
    }

    /**
     * @description 处理图片输入，调用视觉理解服务分析图片内容
     * @param {string} imageData - 图片数据（Base64或URL）
     * @returns {Promise<{text: string, type: string, description: string}>} 解析结果
     * @private
     */
    async _processImage(imageData) {
        // 使用视觉理解服务
        const visionService = require('../vision_service');
        const description = await visionService.analyze(imageData);

        return {
            text: description,
            type: 'image',
            description
        };
    }

    /**
     * @description 处理文件输入，根据扩展名路由到对应服务（txt/pdf/excel）
     * @param {string} filePath - 文件路径
     * @returns {Promise<{text: string, type: string, path: string}>} 解析结果
     * @private
     */
    async _processFile(filePath) {
        const fs = require('fs');
        const path = require('path');

        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.txt') {
            const content = fs.readFileSync(filePath, 'utf-8');
            return { text: content, type: 'text', path: filePath };
        }

        if (ext === '.pdf') {
            const pdfService = require('../document_pipeline');
            const content = await pdfService.extractText(filePath);
            return { text: content, type: 'document', path: filePath };
        }

        if (ext === '.xlsx' || ext === '.xls') {
            const excelService = require('../excel_intelligence');
            const content = await excelService.read(filePath);
            return { text: content, type: 'spreadsheet', path: filePath };
        }

        return { text: `处理文件: ${filePath}`, type: 'file', path: filePath };
    }

    /**
     * @description 处理语音输入，调用ASR服务将音频转为文本
     * @param {Buffer|Object} audioBuffer - 音频数据
     * @returns {Promise<{text: string, type: string}>} 解析结果
     * @private
     */
    async _processVoice(audioBuffer) {
        // 使用 ASR 服务
        const asrService = require('../asr_service');
        const text = await asrService.transcribe(audioBuffer);

        return { text, type: 'voice' };
    }
}

module.exports = new InputLayer();