/**
 * @file url_parser.js
 * @description URL 解析器 - 从网页 URL 抓取内容并提取纯文本，
 *              自动移除脚本、样式和 HTML 标签
 * @module services/document_pipeline/parsers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');
const { logger } = require('../../../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** URL 请求超时时间（毫秒），15秒 */
const URL_FETCH_TIMEOUT = 15000;

class UrlParser {
    /**
     * @description 从 URL 抓取网页内容并提取纯文本
     * @param {string} url - 网页 URL
     * @returns {Promise<{content: string, metadata: {type: string, url: string, status?: number, size?: number, error?: string}}>} 解析结果
     */
    async parse(url) {
        try {
            const response = await axios.get(url, {
                timeout: URL_FETCH_TIMEOUT,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                proxy: false
            });

            const text = this._extractText(response.data);

            return {
                content: text,
                metadata: {
                    type: 'url',
                    url,
                    status: response.status,
                    size: text.length
                }
            };

        } catch (error) {
            logger.error('[URL解析] 失败:', error);
            return {
                content: '',
                metadata: {
                    type: 'url',
                    url,
                    error: error.message
                }
            };
        }
    }

    /**
     * @description 从 HTML 文本中提取纯文本，移除脚本、样式、标签和实体
     * @param {string} html - HTML 文本
     * @returns {string} 纯文本内容
     */
    _extractText(html) {
        if (!html) return '';

        // 移除脚本和样式
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

        // 移除 HTML 标签
        text = text.replace(/<[^>]+>/g, ' ');

        // 清理 HTML 实体
        text = text
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();

        return text;
    }
}

module.exports = new UrlParser();