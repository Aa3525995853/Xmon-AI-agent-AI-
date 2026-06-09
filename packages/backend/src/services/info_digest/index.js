/**
 * @file index.js
 * @description InfoDigestService 主入口 - 信息消化服务，让小梦能理解并消化用户分享的各种信息。
 *              支持图片/截图、PDF 文档、Excel/CSV 表格、Word 文档、音频、视频和网页内容
 * @module info_digest
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载：子模块按需引入
// ============================================================

/** @type {TypeDetector|null} 类型检测器延迟加载缓存 */
let _typeDetector = null;
/** @type {ImageProcessor|null} 图片处理器延迟加载缓存 */
let _imageProcessor = null;
/** @type {DocumentProcessor|null} 文档处理器延迟加载缓存 */
let _documentProcessor = null;
/** @type {SpreadsheetProcessor|null} 表格处理器延迟加载缓存 */
let _spreadsheetProcessor = null;
/** @type {MediaProcessor|null} 媒体处理器延迟加载缓存 */
let _mediaProcessor = null;
/** @type {UrlProcessor|null} URL 处理器延迟加载缓存 */
let _urlProcessor = null;

/**
 * @description 延迟加载类型检测器
 * @returns {TypeDetector} 类型检测器实例
 */
function getTypeDetector() {
    if (!_typeDetector) _typeDetector = require('./type_detector');
    return _typeDetector;
}

/**
 * @description 延迟加载图片处理器
 * @returns {ImageProcessor} 图片处理器实例
 */
function getImageProcessor() {
    if (!_imageProcessor) _imageProcessor = require('./processors/image_processor');
    return _imageProcessor;
}

/**
 * @description 延迟加载文档处理器
 * @returns {DocumentProcessor} 文档处理器实例
 */
function getDocumentProcessor() {
    if (!_documentProcessor) _documentProcessor = require('./processors/document_processor');
    return _documentProcessor;
}

/**
 * @description 延迟加载表格处理器
 * @returns {SpreadsheetProcessor} 表格处理器实例
 */
function getSpreadsheetProcessor() {
    if (!_spreadsheetProcessor) _spreadsheetProcessor = require('./processors/spreadsheet_processor');
    return _spreadsheetProcessor;
}

/**
 * @description 延迟加载媒体处理器
 * @returns {MediaProcessor} 媒体处理器实例
 */
function getMediaProcessor() {
    if (!_mediaProcessor) _mediaProcessor = require('./processors/media_processor');
    return _mediaProcessor;
}

/**
 * @description 延迟加载 URL 处理器
 * @returns {UrlProcessor} URL 处理器实例
 */
function getUrlProcessor() {
    if (!_urlProcessor) _urlProcessor = require('./processors/url_processor');
    return _urlProcessor;
}

// ============================================================
// 常量定义
// ============================================================

/** 已存储内容的最大返回条数 */
const MAX_STORED_CONTENT = 20;

// ============================================================
// 核心类：InfoDigestService
// 功能说明：统一的信息消化入口，协调各类型处理器
// ============================================================

class InfoDigestService {

    /**
     * @description 构造函数，初始化内容缓存和 LLM 服务
     */
    constructor() {
        /** @type {Map<number, Object>} 已分析内容的缓存 */
        this.analyzedContent = new Map();
        /** @type {number} 内容 ID 自增计数器 */
        this.contentIdCounter = 0;
        this.llmService = require('../llm_service');
        this.ContentType = InfoDigestService.ContentType;
    }

    /**
     * @description 检测文件类型
     * @param {string} filename - 文件名
     * @param {string} mimeType - MIME 类型
     * @returns {string} 内容类型标识
     */
    detectType(filename, mimeType) {
        return getTypeDetector().detect(filename, mimeType);
    }

    /**
     * @description 处理图片（使用 LLM Vision 能力）
     * @param {Buffer} buffer - 图片数据
     * @param {string} question - 用户问题
     * @param {string} [context=''] - 上下文信息
     * @returns {Promise<{success: boolean, type: string, content?: string, message?: string}>} 处理结果
     */
    async processImage(buffer, question, context = '') {
        return getImageProcessor().process(buffer, question, context, this.llmService);
    }

    /**
     * @description 处理 PDF 文档
     * @param {Buffer} buffer - PDF 数据
     * @param {string} question - 用户问题
     * @param {string} filename - 文件名
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object}>} 处理结果
     */
    async processPDF(buffer, question, filename) {
        return getDocumentProcessor().processPDF(buffer, question, filename, this.llmService);
    }

    /**
     * @description 处理 Word 文档
     * @param {Buffer} buffer - Word 数据
     * @param {string} question - 用户问题
     * @param {string} filename - 文件名
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object}>} 处理结果
     */
    async processWord(buffer, question, filename) {
        return getDocumentProcessor().processWord(buffer, question, filename, this.llmService);
    }

    /**
     * @description 处理 Excel/CSV 表格
     * @param {Buffer} buffer - 表格数据
     * @param {string} question - 用户问题
     * @param {string} filename - 文件名
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object}>} 处理结果
     */
    async processExcel(buffer, question, filename) {
        return getSpreadsheetProcessor().process(buffer, question, filename, this.llmService);
    }

    /**
     * @description 处理音频文件（ASR 转文字后由 LLM 分析）
     * @param {Buffer} buffer - 音频数据
     * @param {string} question - 用户问题
     * @param {string} filename - 文件名
     * @returns {Promise<{success: boolean, type: string, transcript?: string, content?: string}>} 处理结果
     */
    async processAudio(buffer, question, filename) {
        return getMediaProcessor().processAudio(buffer, question, filename, this.llmService);
    }

    /**
     * @description 处理视频文件
     * @param {Buffer} buffer - 视频数据
     * @param {string} question - 用户问题
     * @param {string} filename - 文件名
     * @returns {Promise<{success: boolean, message?: string}>} 处理结果
     */
    async processVideo(buffer, question, filename) {
        return getMediaProcessor().processVideo(buffer, question, filename, this.llmService);
    }

    /**
     * @description 处理 URL 网页内容
     * @param {string} url - 网页 URL
     * @param {string} question - 用户问题
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object}>} 处理结果
     */
    async processURL(url, question) {
        return getUrlProcessor().process(url, question, this.llmService);
    }

    /**
     * @description 处理纯文本内容
     * @param {string} text - 文本内容
     * @param {string} question - 用户问题
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object}>} 处理结果
     */
    async processText(text, question) {
        return getUrlProcessor().processText(text, question, this.llmService);
    }

    /**
     * @description 基于已存储的分析内容回答问题
     * @param {number} contentId - 内容 ID
     * @param {string} question - 用户问题
     * @returns {Promise<{success: boolean, answer?: string, message?: string}>} 回答结果
     */
    async answerAboutContent(contentId, question) {
        const content = this.analyzedContent.get(contentId);
        if (!content) {
            return { success: false, message: '内容不存在' };
        }

        const prompt = `请根据以下内容回答问题。

内容类型: ${content.type}
内容: ${content.text || content.summary}

问题: ${question}

请给出简洁、准确的回答。`;

        const result = await this.llmService.generateReply(prompt, '');
        return { success: true, answer: result.text || result };
    }

    /**
     * @description 存储已分析的内容到缓存
     * @param {string} type - 内容类型
     * @param {string} content - 内容文本
     * @param {string} filename - 文件名
     * @returns {number} 分配的内容 ID
     */
    storeContent(type, content, filename) {
        const id = ++this.contentIdCounter;
        this.analyzedContent.set(id, {
            id,
            type,
            content,
            filename,
            timestamp: Date.now()
        });
        return id;
    }

    /**
     * @description 获取已存储的内容列表，按时间倒序排列
     * @returns {Array<Object>} 已存储内容列表
     */
    getStoredContent() {
        return Array.from(this.analyzedContent.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_STORED_CONTENT);
    }

    /**
     * @description 提取内容摘要，超长内容截断并添加省略号
     * @param {string} content - 原始内容
     * @param {number} [maxLength=200] - 最大长度
     * @returns {string} 摘要文本
     */
    extractSummary(content, maxLength = 200) {
        if (!content) return '';
        if (content.length <= maxLength) return content;
        return content.substring(0, maxLength) + '...';
    }
}

/** 内容类型枚举 */
InfoDigestService.ContentType = {
    IMAGE: 'image',
    PDF: 'pdf',
    EXCEL: 'excel',
    CSV: 'csv',
    WORD: 'word',
    AUDIO: 'audio',
    VIDEO: 'video'
};

module.exports = InfoDigestService;
