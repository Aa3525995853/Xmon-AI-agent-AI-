/**
 * @file url_processor.js
 * @description URL 处理器 - 抓取网页内容并使用 LLM 进行分析，
 *              支持网页内容处理和纯文本内容处理
 * @module info_digest
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');
const { logger } = require('../../../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** URL 内容最大截取字符数 */
const URL_MAX_CONTENT_LENGTH = 8000;

/** 纯文本内容最大截取字符数 */
const TEXT_MAX_CONTENT_LENGTH = 10000;

/** URL 抓取超时时间（毫秒） */
const FETCH_TIMEOUT = 10000;

// ============================================================
// 核心类：UrlProcessor
// 功能说明：网页抓取、HTML 清理和 LLM 分析
// ============================================================

class UrlProcessor {

    /**
     * @description 处理 URL 网页内容，抓取后由 LLM 分析
     * @param {string} url - 网页 URL
     * @param {string} question - 用户问题
     * @param {Object} llmService - LLM 服务实例
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object, message?: string}>} 处理结果
     */
    async process(url, question, llmService) {
        try {
            // 抓取网页内容
            const content = await this._fetchUrl(url);

            if (!content) {
                return { success: false, message: '无法获取网页内容' };
            }

            // 截取前 URL_MAX_CONTENT_LENGTH 字符，避免超出 LLM 上下文限制
            const truncatedContent = content.substring(0, URL_MAX_CONTENT_LENGTH);
            const wasTruncated = content.length > URL_MAX_CONTENT_LENGTH;

            // 构建提示词
            const prompt = this._buildPrompt(truncatedContent, question, {
                url,
                wasTruncated
            });

            // 调用 LLM
            const result = await llmService.generateReply(prompt, '');

            return {
                success: true,
                type: 'url',
                content: result.text || result,
                metadata: { url, wasTruncated }
            };

        } catch (error) {
            logger.error('[URL处理] 失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * @description 处理纯文本内容，由 LLM 分析
     * @param {string} text - 文本内容
     * @param {string} question - 用户问题
     * @param {Object} llmService - LLM 服务实例
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object, message?: string}>} 处理结果
     */
    async processText(text, question, llmService) {
        try {
            // 截取前 TEXT_MAX_CONTENT_LENGTH 字符
            const truncatedText = text.substring(0, TEXT_MAX_CONTENT_LENGTH);
            const wasTruncated = text.length > TEXT_MAX_CONTENT_LENGTH;

            // 构建提示词
            const prompt = this._buildPrompt(truncatedText, question, { wasTruncated });

            // 调用 LLM
            const result = await llmService.generateReply(prompt, '');

            return {
                success: true,
                type: 'text',
                content: result.text || result,
                metadata: { wasTruncated }
            };

        } catch (error) {
            logger.error('[文本处理] 失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * @description 抓取 URL 对应的网页内容
     * @param {string} url - 网页 URL
     * @returns {Promise<string|null>} 提取的文本内容，失败时返回 null
     * @private
     */
    async _fetchUrl(url) {
        if (process.env.NODE_ENV === 'test') {
            return `Test page content for ${url}`;
        }

        try {
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                proxy: false
            });

            // 简单清理 HTML
            return this._extractText(response.data);

        } catch (error) {
            logger.warn('[URL抓取] 失败:', error.message);
            return null;
        }
    }

    /**
     * @description 从 HTML 中提取纯文本，移除脚本/样式标签并清理 HTML 实体
     * @param {string} html - 原始 HTML 字符串
     * @returns {string} 清理后的纯文本内容
     * @private
     */
    _extractText(html) {
        if (!html) return '';

        // 移除 script 和 style 标签及其内容，避免注入噪声
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

        // 移除所有 HTML 标签，替换为空格保持词语分隔
        text = text.replace(/<[^>]+>/g, ' ');

        // 清理多余空白和 HTML 实体
        text = text
            .replace(/\s+/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();

        return text;
    }

    /**
     * @description 构建 LLM 分析用的提示词，包含来源信息和截断提示
     * @param {string} content - 网页/文本内容
     * @param {string} question - 用户问题，为空时生成总结提示
     * @param {Object} metadata - 附加元数据
     * @param {string} [metadata.url] - 网页来源 URL
     * @param {boolean} [metadata.wasTruncated] - 内容是否被截断
     * @returns {string} 构建好的提示词
     * @private
     */
    _buildPrompt(content, question, metadata = {}) {
        let prompt = '以下是网页内容：\n\n' + content;

        // 添加来源 URL 信息
        if (metadata.url) {
            prompt = `来源: ${metadata.url}\n\n` + prompt;
        }

        // 根据是否有问题决定提示词方向
        if (question) {
            prompt += '\n\n请根据以上内容回答问题：' + question;
        } else {
            prompt += '\n\n请总结这个网页的主要内容。';
        }

        // 截断时提醒 LLM 注意信息不完整
        if (metadata.wasTruncated) {
            prompt += '\n\n注意：内容已被截断。';
        }

        return prompt;
    }
}

module.exports = new UrlProcessor();
