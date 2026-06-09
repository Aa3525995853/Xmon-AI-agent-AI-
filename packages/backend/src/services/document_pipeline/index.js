/**
 * @file index.js
 * @description 文档分析管道主入口服务，负责文档解析、智能摘要和问答系统的编排调度。
 *              解决用户痛点："帮我看看这个报告说了什么"。
 *              核心能力：1.文档解析（PDF/Word/HTML/TXT/URL）2.智能摘要 3.问答系统
 * @module services/document_pipeline
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义
// 功能说明：文档管道的核心配置常量
// ============================================================

/** 文件大小上限（10MB），超过此大小的文件将拒绝解析以避免内存溢出 */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** 文档内容预览长度，用于返回给前端展示的截断内容 */
const CONTENT_PREVIEW_LENGTH = 500;

/** 过期文档默认最大保留时间（1小时），超过此时间的缓存文档将被清理 */
const DEFAULT_MAX_AGE_MS = 3600000;

// ============================================================
// 延迟加载子模块
// 功能说明：通过懒加载避免循环依赖，仅在首次使用时才加载对应解析器
// ============================================================

let _pdfParser = null;
let _wordParser = null;
let _htmlParser = null;
let _urlParser = null;
let _summarizer = null;

/**
 * @description 懒加载 PDF 解析器模块
 * @returns {Object} PDF 解析器实例
 */
function getPdfParser() {
    if (!_pdfParser) _pdfParser = require('./parsers/pdf_parser');
    return _pdfParser;
}

/**
 * @description 懒加载 Word 解析器模块
 * @returns {Object} Word 解析器实例
 */
function getWordParser() {
    if (!_wordParser) _wordParser = require('./parsers/word_parser');
    return _wordParser;
}

/**
 * @description 懒加载 HTML 解析器模块
 * @returns {Object} HTML 解析器实例
 */
function getHtmlParser() {
    if (!_htmlParser) _htmlParser = require('./parsers/html_parser');
    return _htmlParser;
}

/**
 * @description 懒加载 URL 解析器模块
 * @returns {Object} URL 解析器实例
 */
function getUrlParser() {
    if (!_urlParser) _urlParser = require('./parsers/url_parser');
    return _urlParser;
}

/**
 * @description 懒加载文档摘要器模块
 * @returns {Object} DocumentSummarizer 单例实例
 */
function getSummarizer() {
    if (!_summarizer) _summarizer = require('./summarizer');
    return _summarizer;
}

// ============================================================
// 文档管道服务类
// 功能说明：文档解析、摘要生成、问答系统的核心编排服务
// ============================================================

class DocumentPipelineService {
    /**
     * @description 初始化文档管道服务，设置已解析文档缓存和文件类型映射
     */
    constructor() {
        /** 已解析文档的缓存映射，键为文档ID，值为文档信息对象 */
        this.analyzedDocuments = new Map();

        /** 文档ID自增计数器，用于生成唯一文档标识 */
        this.documentIdCounter = 0;

        /** LLM 服务实例，延迟加载以避免循环依赖 */
        this.llmService = null;

        /** 支持的文件类型与扩展名映射表 */
        this.supportedTypes = {
            pdf: ['.pdf'],
            word: ['.docx', '.doc'],
            html: ['.html', '.htm'],
            text: ['.txt', '.md', '.json', '.xml']
        };

        /** 文件大小上限（字节），超过此大小的文件将拒绝解析 */
        this.maxFileSize = MAX_FILE_SIZE_BYTES;
    }

    /**
     * @description 获取 LLM 服务实例（延迟加载），避免模块初始化时的循环依赖
     * @returns {Object|null} LLM 服务实例，加载失败时返回 null
     */
    _getLLMService() {
        if (!this.llmService) {
            try {
                this.llmService = require('../llm_service');
            } catch (e) {
                logger.warn('[文档管道] LLM服务未加载');
            }
        }
        return this.llmService;
    }

    /**
     * @description 解析文档（支持本地文件路径和 URL），自动识别类型并调用对应解析器
     * @param {string} source - 文档来源，可以是本地文件路径或 HTTP/HTTPS URL
     * @param {Object} [options={}] - 解析选项（预留扩展）
     * @returns {Promise<Object>} 解析结果，包含 success、docId、content、metadata 等字段
     * @throws {Error} 当文件不存在或解析器执行失败时抛出异常（内部捕获并返回失败结果）
     */
    async parseDocument(source, options = {}) {
        logger.info(`[文档管道] 开始解析: ${source}`);

        try {
            const isUrl = source.startsWith('http://') || source.startsWith('https://');
            let content = '', metadata = {};

            if (isUrl) {
                // URL 类型直接使用 URL 解析器
                const result = await getUrlParser().parse(source);
                content = result.content;
                metadata = result.metadata;
            } else {
                // 本地文件根据扩展名选择解析器
                const ext = path.extname(source).toLowerCase();
                const result = await this._parseFileByExt(source, ext);
                content = result.content;
                metadata = result.metadata;
            }

            // 清理内容中的 HTML 标签和多余空白
            content = this._cleanContent(content);

            // 生成唯一文档ID，包含计数器和时间戳以确保唯一性
            const docId = `doc_${++this.documentIdCounter}_${Date.now()}`;

            // 缓存已解析的文档，供后续摘要和问答使用
            this.analyzedDocuments.set(docId, {
                id: docId,
                source,
                content,
                metadata,
                analyzedAt: Date.now()
            });

            logger.info(`[文档管道] 解析完成: ${content.length} 字符`);

            return {
                success: true,
                docId,
                source,
                content,
                contentLength: content.length,
                metadata,
                preview: content.substring(0, CONTENT_PREVIEW_LENGTH)
            };

        } catch (error) {
            logger.error('[文档管道] 解析失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 根据文件扩展名分发到对应的解析器
     * @param {string} filepath - 文件绝对路径
     * @param {string} ext - 文件扩展名（含点号，如 '.pdf'）
     * @returns {Promise<Object>} 解析结果，包含 content 和 metadata 字段
     */
    async _parseFileByExt(filepath, ext) {
        if (ext === '.pdf') {
            return getPdfParser().parse(filepath);
        } else if (ext === '.docx' || ext === '.doc') {
            return getWordParser().parse(filepath);
        } else if (ext === '.html' || ext === '.htm') {
            return getHtmlParser().parse(filepath);
        } else {
            // 其他格式统一按纯文本处理
            return this._parseTextFile(filepath);
        }
    }

    /**
     * @description 解析本地文件（自动检测扩展名）
     * @param {string} filepath - 文件绝对路径
     * @returns {Promise<Object>} 解析结果，包含 content 和 metadata 字段
     */
    async _parseFile(filepath) {
        const ext = path.extname(filepath).toLowerCase();
        return this._parseFileByExt(filepath, ext);
    }

    /**
     * @description 解析 URL 对应的网页内容
     * @param {string} url - 网页 URL 地址
     * @returns {Promise<Object>} 解析结果，包含 content 和 metadata 字段
     */
    async _parseUrl(url) {
        return getUrlParser().parse(url);
    }

    /**
     * @description 解析 PDF 文件
     * @param {string} filepath - PDF 文件绝对路径
     * @returns {Promise<Object>} 解析结果，包含 content 和 metadata 字段
     */
    async _parsePdf(filepath) {
        return getPdfParser().parse(filepath);
    }

    /**
     * @description 解析 Word 文件（.docx/.doc）
     * @param {string} filepath - Word 文件绝对路径
     * @returns {Promise<Object>} 解析结果，包含 content 和 metadata 字段
     */
    async _parseWord(filepath) {
        return getWordParser().parse(filepath);
    }

    /**
     * @description 解析本地 HTML 文件
     * @param {string} filepath - HTML 文件绝对路径
     * @returns {Promise<Object>} 解析结果，包含 content 和 metadata 字段
     */
    async _parseHtmlFile(filepath) {
        return getHtmlParser().parse(filepath);
    }

    /**
     * @description 解析纯文本文件（.txt/.md/.json/.xml 等），直接读取文件内容
     * @param {string} filepath - 文本文件绝对路径
     * @returns {Object} 解析结果，包含 content 和 metadata 字段
     */
    async _parseTextFile(filepath) {
        const content = fs.readFileSync(filepath, 'utf-8');
        return {
            content,
            metadata: {
                type: 'text',
                size: content.length,
                name: path.basename(filepath)
            }
        };
    }

    /**
     * @description 清理文档内容，移除 HTML 标签、脚本、样式和多余空白
     * @param {string} content - 原始文档内容
     * @returns {string} 清理后的纯文本内容
     */
    _cleanContent(content) {
        return content
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')  // 移除 script 标签，防止脚本内容干扰摘要
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')     // 移除 style 标签，防止样式内容干扰摘要
            .replace(/<[^>]+>/g, ' ')                            // 移除所有 HTML 标签，替换为空格
            .replace(/\s+/g, ' ')                                // 合并连续空白为单个空格
            .replace(/&nbsp;/g, ' ')                             // HTML 实体解码
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
    }

    /**
     * @description 对文档内容生成智能摘要
     * @param {string} content - 文档文本内容
     * @param {Object} [options={}] - 摘要选项，如 maxLength（最大长度）、type（摘要类型）
     * @returns {Promise<Object>} 摘要结果，包含 success、summary、type 等字段
     */
    async summarize(content, options = {}) {
        return getSummarizer().summarize(content, options, this._getLLMService());
    }

    /**
     * @description 基于已解析文档内容回答用户问题
     * @param {string} docId - 文档ID，由 parseDocument 返回
     * @param {string} question - 用户提出的问题
     * @returns {Promise<Object>} 问答结果，包含 success 和 answer/message 字段
     */
    async answerQuestion(docId, question) {
        const doc = this.analyzedDocuments.get(docId);
        if (!doc) {
            return { success: false, message: '文档不存在' };
        }

        return getSummarizer().answer(doc.content, question, this._getLLMService());
    }

    /**
     * @description 从文档内容中提取关键信息（数字、日期、邮箱、URL）
     * @param {string} content - 文档文本内容
     * @param {string} [type='all'] - 提取类型，可选 'numbers'/'dates'/'emails'/'urls'/'all'
     * @returns {Object|Array} type 为 'all' 时返回包含所有类型的对象，否则返回对应类型的数组
     */
    extractKeyInfo(content, type = 'all') {
        const summarizer = getSummarizer();
        return summarizer.extractKeyInfo(content, type);
    }

    /**
     * @description 从文档内容中提取关键段落，按段落长度排序后取前 N 个
     * @param {string} content - 文档文本内容
     * @param {number} [count=5] - 需要提取的段落数量
     * @returns {Array<string>} 关键段落数组
     */
    extractKeyParagraphs(content, count = 5) {
        const summarizer = getSummarizer();
        return summarizer.extractKeyParagraphs(content, count);
    }

    /**
     * @description 完整分析文档：解析 → 摘要 → 提取关键信息 → 提取关键段落
     * @param {string} source - 文档来源（文件路径或 URL）
     * @returns {Promise<Object>} 完整分析结果，包含解析信息、摘要、关键信息和关键段落
     */
    async analyzeComplete(source) {
        const parsed = await this.parseDocument(source);
        if (!parsed.success) {
            return parsed;
        }

        const summary = await this.summarize(parsed.content);
        const keyInfo = this.extractKeyInfo(parsed.content);
        const keyParagraphs = this.extractKeyParagraphs(parsed.content, 5);

        return {
            ...parsed,
            summary,
            keyInfo,
            keyParagraphs
        };
    }

    /**
     * @description 根据文档ID获取已缓存的文档信息
     * @param {string} docId - 文档ID
     * @returns {Object|undefined} 文档信息对象，不存在时返回 undefined
     */
    getDocument(docId) {
        return this.analyzedDocuments.get(docId);
    }

    /**
     * @description 清理超过指定时间的缓存文档，防止内存泄漏
     * @param {number} [maxAge=3600000] - 文档最大保留时间（毫秒），默认1小时
     * @returns {Object} 清理结果，包含 removed（已移除数量）字段
     */
    cleanup(maxAge = DEFAULT_MAX_AGE_MS) {
        const now = Date.now();
        let removed = 0;

        for (const [id, doc] of this.analyzedDocuments) {
            if (now - doc.analyzedAt > maxAge) {
                this.analyzedDocuments.delete(id);
                removed++;
            }
        }

        return { removed };
    }
}

module.exports = DocumentPipelineService;
