/**
 * @file page_fetch.js
 * @description 页面抓取模块 - 抓取搜索结果的网页正文内容
 * @module services/webSearchService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');
const { logger } = require('../../utils/logger');

/** 页面抓取超时时间（毫秒） */
const FETCH_TIMEOUT = 8000;
/** 最大抓取页面数量 */
const MAX_FETCH_PAGES = 3;
/** 单页最大内容长度（字符数） */
const MAX_CONTENT_LENGTH = 3000;

/** 通用请求头，模拟浏览器访问 */
const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

class PageFetch {
    /**
     * @description 批量抓取搜索结果页面并补充正文内容
     * @param {Array<Object>} results - 搜索结果列表
     * @param {number} count - 抓取前N个结果的页面
     * @returns {Promise<Array<Object>>} 补充了 content 字段的结果列表
     */
    async enrichResults(results, count = MAX_FETCH_PAGES) {
        const enriched = [];

        // 抓取前 N 个结果
        for (const result of results.slice(0, count)) {
            const content = await this.fetchPageContent(result.url);
            enriched.push({ ...result, content: content || result.snippet || '' });
        }

        // 剩余结果保持原样
        for (const result of results.slice(count)) {
            enriched.push(result);
        }

        return enriched;
    }

    /**
     * @description 抓取单个页面内容，清理 HTML 后返回纯文本
     * @param {string} url - 页面URL
     * @returns {Promise<string>} 页面正文内容
     */
    async fetchPageContent(url) {
        if (!url || !url.startsWith('http')) return '';

        try {
            const response = await axios.get(url, {
                timeout: FETCH_TIMEOUT,
                headers: COMMON_HEADERS,
                maxRedirects: 3,
                validateStatus: (status) => status < 400,
                proxy: false
            });

            let text = response.data;
            if (typeof text !== 'string') return '';

            text = this.cleanHtml(text);

            if (text.length > MAX_CONTENT_LENGTH) {
                text = text.substring(0, MAX_CONTENT_LENGTH) + '...';
            }

            return text;
        } catch (e) {
            logger.debug(`[PageFetch] 抓取页面失败: ${url}`, { error: e.message });
            return '';
        }
    }

    /**
     * @description 清理 HTML - 移除脚本、样式、导航等非正文标签，提取纯文本
     * @param {string} html - 原始 HTML
     * @returns {string} 清理后的纯文本
     */
    cleanHtml(html) {
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#\d+;/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

module.exports = new PageFetch();