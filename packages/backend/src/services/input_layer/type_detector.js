/**
 * @file type_detector.js
 * @description 输入类型检测器 - 自动识别用户输入的类型（文本/图片/音频/文件/URL/混合）
 * @module input_layer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const InputType = require('./index').InputType || {
    TEXT: 'text',
    IMAGE: 'image',
    AUDIO: 'audio',
    FILE: 'file',
    MIXED: 'mixed',
    URL: 'url'
};

class TypeDetector {
    constructor() {
        /** 文件扩展名到类型的映射表 */
        this.fileExtensions = {
            image: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'],
            document: ['.pdf', '.doc', '.docx', '.txt', '.md'],
            spreadsheet: ['.xlsx', '.xls', '.csv'],
            presentation: ['.pptx', '.ppt'],
            audio: ['.mp3', '.wav', '.m4a', '.ogg', '.webm']
        };
    }

    /**
     * @description 检测输入类型 - 支持数组、对象和字符串三种输入格式
     * @param {*} input - 用户输入（字符串、对象或数组）
     * @returns {string} 检测到的输入类型（InputType 枚举值）
     */
    detect(input) {
        // 数组/混合输入
        if (Array.isArray(input)) {
            const types = input.map(i => this.detect(i));
            if (types.some(t => t !== InputType.TEXT)) {
                return InputType.MIXED;
            }
            return InputType.TEXT;
        }

        // 对象输入
        if (typeof input === 'object') {
            if (input.type) return input.type;
            if (input.imageBase64 || input.imageUrl || input.imagePath) return InputType.IMAGE;
            if (input.audioBase64 || input.audioUrl || input.audioPath) return InputType.AUDIO;
            if (input.filePath || input.fileUrl || input.fileBuffer) return InputType.FILE;
            if (input.url) return InputType.URL;
        }

        // 字符串输入
        if (typeof input === 'string') {
            // URL检测
            if (/^https?:\/\//i.test(input)) {
                return InputType.URL;
            }

            // 文件路径检测
            if (/^[A-Za-z]:\\|^\/|^\.\//.test(input)) {
                if (this._isFilePath(input)) {
                    return InputType.FILE;
                }
                return InputType.URL;
            }

            // Base64 图片检测
            if (/^data:image\//.test(input)) {
                return InputType.IMAGE;
            }

            // Base64 音频检测
            if (/^data:audio\//.test(input)) {
                return InputType.AUDIO;
            }
        }

        return InputType.TEXT;
    }

    /**
     * @description 判断字符串是否为文件路径（通过扩展名检测）
     * @param {string} str - 待检测字符串
     * @returns {boolean} 是否为文件路径
     */
    _isFilePath(str) {
        return /\.(pdf|doc|docx|xlsx?|pptx?|txt|md)$/i.test(str);
    }
}

module.exports = new TypeDetector();