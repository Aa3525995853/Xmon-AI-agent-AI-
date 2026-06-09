/**
 * @file summarizer.js
 * @description 文档摘要器，提供基于 LLM 的智能摘要生成、文档问答、
 *              关键信息提取（数字/日期/邮箱/URL）和关键段落提取功能
 * @module services/document_pipeline
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义
// 功能说明：摘要器核心配置常量，控制内容截取长度和提取数量上限
// ============================================================

/** 发送给 LLM 的文档内容最大长度（字符数），超出部分将被截断以避免超出 Token 限制 */
const MAX_CONTENT_LENGTH = 8000;

/** 摘要提示词中文档内容的最大长度（字符数），比 MAX_CONTENT_LENGTH 更短以留出提示词空间 */
const PROMPT_CONTENT_LENGTH = 6000;

/** 默认摘要最大长度（字符数），控制 LLM 生成摘要的篇幅 */
const DEFAULT_SUMMARY_LENGTH = 500;

/** 提取数字信息的最大数量，防止数字过多导致结果冗余 */
const MAX_NUMBERS_COUNT = 20;

/** 关键段落的最小长度阈值，低于此长度的段落被视为无意义片段而被过滤 */
const MIN_PARAGRAPH_LENGTH = 20;

/** 默认提取关键段落的数量 */
const DEFAULT_KEY_PARAGRAPH_COUNT = 5;

// ============================================================
// 文档摘要器类
// 功能说明：基于 LLM 的文档摘要生成、问答、关键信息提取
// ============================================================

class DocumentSummarizer {
    /**
     * @description 生成文档摘要，支持多种摘要类型（总结/要点/摘要）
     * @param {string} content - 文档文本内容
     * @param {Object} [options={}] - 摘要选项
     * @param {number} [options.maxLength=500] - 摘要最大长度（字符数）
     * @param {string} [options.type='summary'] - 摘要类型，可选 'summary'/'key_points'/'abstract'
     * @param {Object} llmService - LLM 服务实例，需提供 generateReply 方法
     * @returns {Promise<Object>} 摘要结果，包含 success、summary、type 字段；
     *                            LLM 不可用时返回 success=false 并附带降级说明
     * @throws {Error} 当 LLM 调用过程发生异常时（内部捕获并返回失败结果）
     */
    async summarize(content, options = {}, llmService) {
        const { maxLength = DEFAULT_SUMMARY_LENGTH, type = 'summary' } = options;

        try {
            // 截取内容以避免超出 LLM Token 限制
            const truncated = content.substring(0, MAX_CONTENT_LENGTH);

            // 使用 LLM 生成摘要
            if (llmService && llmService.generateReply) {
                const prompt = this._buildSummarizePrompt(truncated, maxLength, type);
                const result = await llmService.generateReply(prompt, '');

                return {
                    success: true,
                    summary: result.text || result,
                    type
                };
            }

            // LLM 服务不可用时不能假装生成成功，必须明确告知用户
            return {
                success: false,
                message: '摘要生成失败：LLM 服务不可用，无法生成 AI 摘要',
                type: 'degraded',
                degradedNote: '当前仅支持 AI 摘要模式，请确保 LLM 服务已配置'
            };

        } catch (error) {
            logger.error('[摘要] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 基于文档内容回答用户问题，利用 LLM 进行语义理解
     * @param {string} content - 文档文本内容
     * @param {string} question - 用户提出的问题
     * @param {Object} llmService - LLM 服务实例，需提供 generateReply 方法
     * @returns {Promise<Object>} 问答结果，包含 success 和 answer/message 字段；
     *                            LLM 不可用时返回 success=false
     * @throws {Error} 当 LLM 调用过程发生异常时（内部捕获并返回失败结果）
     */
    async answer(content, question, llmService) {
        try {
            // 截取内容以避免超出 LLM Token 限制
            const truncated = content.substring(0, MAX_CONTENT_LENGTH);

            if (llmService && llmService.generateReply) {
                const prompt = `基于以下文档内容回答问题。

文档内容：
${truncated}

问题：${question}

请给出简洁、准确的回答。`;

                const result = await llmService.generateReply(prompt, '');

                return {
                    success: true,
                    answer: result.text || result
                };
            }

            // LLM 不可用时无法进行语义问答
            return {
                success: false,
                message: 'LLM 服务不可用'
            };

        } catch (error) {
            logger.error('[问答] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 从文档内容中提取关键信息（数字、日期、邮箱、URL），
     *              使用正则表达式进行模式匹配
     * @param {string} content - 文档文本内容
     * @param {string} [type='all'] - 提取类型，可选 'numbers'/'dates'/'emails'/'urls'/'all'
     * @returns {Object|Array} type 为 'all' 时返回包含所有类型的对象 {numbers, dates, emails, urls}，
     *                         否则返回对应类型的数组
     */
    extractKeyInfo(content, type = 'all') {
        const info = {
            numbers: [],
            dates: [],
            emails: [],
            urls: []
        };

        // 提取数字（含小数和千分位分隔符），限制数量防止冗余
        const numberMatches = content.match(/\d+[\d,.]*/g);
        if (numberMatches) {
            info.numbers = numberMatches.slice(0, MAX_NUMBERS_COUNT);
        }

        // 提取日期（支持 YYYY-MM-DD、YYYY/MM/DD、YYYY年MM月DD日 格式）
        const dateMatches = content.match(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?/g);
        if (dateMatches) {
            info.dates = dateMatches;
        }

        // 提取邮箱地址，使用 Set 去重
        const emailMatches = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        if (emailMatches) {
            info.emails = [...new Set(emailMatches)];
        }

        // 提取 URL 地址，使用 Set 去重
        const urlMatches = content.match(/https?:\/\/[^\s]+/g);
        if (urlMatches) {
            info.urls = [...new Set(urlMatches)];
        }

        return type === 'all' ? info : info[type] || [];
    }

    /**
     * @description 从文档内容中提取关键段落，按段落长度降序排列后取前 N 个。
     *              假设较长的段落包含更丰富的信息量
     * @param {string} content - 文档文本内容
     * @param {number} [count=5] - 需要提取的段落数量
     * @returns {Array<string>} 关键段落数组，按长度降序排列
     */
    extractKeyParagraphs(content, count = DEFAULT_KEY_PARAGRAPH_COUNT) {
        // 按双换行符分割段落，过滤掉过短的片段
        const paragraphs = content
            .split(/\n\n+/)
            .map(p => p.trim())
            .filter(p => p.length > MIN_PARAGRAPH_LENGTH);

        // 按长度降序排序，较长的段落可能包含更重要的信息
        paragraphs.sort((a, b) => b.length - a.length);

        return paragraphs.slice(0, count);
    }

    /**
     * @description 构建摘要生成的 LLM 提示词，根据摘要类型选择不同的指令
     * @param {string} content - 截取后的文档内容
     * @param {number} maxLength - 摘要最大长度（字符数）
     * @param {string} type - 摘要类型，可选 'summary'/'key_points'/'abstract'
     * @returns {string} 完整的 LLM 提示词
     * @private
     */
    _buildSummarizePrompt(content, maxLength, type) {
        /** 摘要类型与对应指令的映射表 */
        const typeInstructions = {
            summary: '请总结文档的主要内容，提取关键信息。',
            key_points: '请提取文档的关键要点。',
            abstract: '请生成一个简洁的摘要。'
        };

        const instruction = typeInstructions[type] || typeInstructions.summary;

        return `请对以下文档内容进行摘要。

要求：
- 摘要长度不超过 ${maxLength} 字符
- 提取核心要点
- 保持原文的含义

${instruction}

文档内容：
${content.substring(0, PROMPT_CONTENT_LENGTH)}

摘要：`;
    }
}

module.exports = new DocumentSummarizer();
