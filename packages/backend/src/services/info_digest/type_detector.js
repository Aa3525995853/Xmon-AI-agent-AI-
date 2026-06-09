/**
 * @file type_detector.js
 * @description 文件类型检测器 - 基于文件扩展名和 MIME 类型检测内容类型，
 *              支持图片、PDF、Excel、CSV、Word、音频、视频和文本等类型
 * @module info_digest
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const path = require('path');

// ============================================================
// 常量定义：内容类型枚举与映射表
// ============================================================

/** 内容类型枚举 */
const ContentType = {
    IMAGE: 'image',
    PDF: 'pdf',
    EXCEL: 'excel',
    CSV: 'csv',
    WORD: 'word',
    AUDIO: 'audio',
    VIDEO: 'video',
    URL: 'url',
    TEXT: 'text'
};

/** 文件扩展名到内容类型的映射 */
const EXT_MAP = {
    '.jpg': ContentType.IMAGE,
    '.jpeg': ContentType.IMAGE,
    '.png': ContentType.IMAGE,
    '.gif': ContentType.IMAGE,
    '.webp': ContentType.IMAGE,
    '.bmp': ContentType.IMAGE,
    '.pdf': ContentType.PDF,
    '.xlsx': ContentType.EXCEL,
    '.xls': ContentType.EXCEL,
    '.csv': ContentType.CSV,
    '.docx': ContentType.WORD,
    '.doc': ContentType.WORD,
    '.mp3': ContentType.AUDIO,
    '.wav': ContentType.AUDIO,
    '.ogg': ContentType.AUDIO,
    '.m4a': ContentType.AUDIO,
    '.mp4': ContentType.VIDEO,
    '.avi': ContentType.VIDEO,
    '.mkv': ContentType.VIDEO,
    '.webm': ContentType.VIDEO,
    '.txt': ContentType.TEXT,
    '.md': ContentType.TEXT,
    '.html': ContentType.TEXT,
    '.htm': ContentType.TEXT
};

/** MIME 类型到内容类型的映射 */
const MIME_MAP = {
    'image/jpeg': ContentType.IMAGE,
    'image/png': ContentType.IMAGE,
    'image/gif': ContentType.IMAGE,
    'image/webp': ContentType.IMAGE,
    'application/pdf': ContentType.PDF,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ContentType.EXCEL,
    'application/vnd.ms-excel': ContentType.EXCEL,
    'text/csv': ContentType.CSV,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ContentType.WORD,
    'audio/mpeg': ContentType.AUDIO,
    'audio/mp3': ContentType.AUDIO,
    'audio/wav': ContentType.AUDIO,
    'audio/wave': ContentType.AUDIO,
    'audio/ogg': ContentType.AUDIO,
    'audio/webm': ContentType.AUDIO,
    'video/mp4': ContentType.VIDEO,
    'video/mpeg': ContentType.VIDEO,
    'video/webm': ContentType.VIDEO,
    'video/ogg': ContentType.VIDEO
};

/** 各类型文件的最大允许大小（字节） */
const FILE_SIZE_LIMITS = {
    [ContentType.IMAGE]: 10 * 1024 * 1024,   // 10MB
    [ContentType.PDF]: 50 * 1024 * 1024,     // 50MB
    [ContentType.EXCEL]: 10 * 1024 * 1024,   // 10MB
    [ContentType.CSV]: 5 * 1024 * 1024,      // 5MB
    [ContentType.WORD]: 20 * 1024 * 1024,    // 20MB
    [ContentType.AUDIO]: 50 * 1024 * 1024,   // 50MB
    [ContentType.VIDEO]: 100 * 1024 * 1024   // 100MB
};

/** 默认最大文件大小（字节） */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================
// 核心类：TypeDetector
// 功能说明：文件类型检测与大小限制查询
// ============================================================

class TypeDetector {

    /**
     * @description 检测文件类型，优先使用 MIME 类型，其次使用扩展名，默认返回文本类型
     * @param {string} filename - 文件名
     * @param {string} mimeType - MIME 类型
     * @returns {string} 内容类型标识
     */
    detect(filename, mimeType) {
        // 1. 优先从 MIME 类型检测
        if (mimeType && MIME_MAP[mimeType]) {
            return MIME_MAP[mimeType];
        }

        // 2. 从扩展名检测
        const ext = path.extname(filename || '').toLowerCase();
        if (ext && EXT_MAP[ext]) {
            return EXT_MAP[ext];
        }

        // 3. 默认返回文本
        return ContentType.TEXT;
    }

    /**
     * @description 获取各类型支持的 MIME 类型列表
     * @returns {Object<string, string[]>} 按类型分组的 MIME 列表
     */
    getSupportedTypes() {
        return {
            image: Object.keys(MIME_MAP).filter(m => m.startsWith('image/')),
            document: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            spreadsheet: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
            audio: Object.keys(MIME_MAP).filter(m => m.startsWith('audio/')),
            video: Object.keys(MIME_MAP).filter(m => m.startsWith('video/'))
        };
    }

    /**
     * @description 检查指定文件类型是否受支持
     * @param {string} filename - 文件名
     * @param {string} mimeType - MIME 类型
     * @returns {boolean} 是否受支持
     */
    isSupported(filename, mimeType) {
        const type = this.detect(filename, mimeType);
        return type !== ContentType.TEXT || !!filename;
    }

    /**
     * @description 获取指定类型的最大文件大小限制
     * @param {string} type - 内容类型标识
     * @returns {number} 最大文件大小（字节）
     */
    getMaxFileSize(type) {
        return FILE_SIZE_LIMITS[type] || DEFAULT_MAX_FILE_SIZE;
    }
}

module.exports = new TypeDetector();