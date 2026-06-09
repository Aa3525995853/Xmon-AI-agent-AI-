/**
 * @file search_engines.js
 * @description 搜索引擎模块 - 支持 Bing 和 DuckDuckGo 多源搜索
 * @module services/webSearchService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');
const { logger } = require('../../utils/logger');

/** 搜索请求超时时间（毫秒） */
const SEARCH_TIMEOUT = 15000;
/** 通用请求头，模拟浏览器访问 */
const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

/** 搜索类型对应的查询前缀，用于优化搜索结果 */
const QUERY_PREFIXES = {
    flight: '携程 去哪儿 机票 ',
    hotel: '携程 美团 酒店 ',
    news: '最新新闻 '
};

class SearchEngines {
    /**
     * @description 多源搜索 - 依次尝试带前缀的Bing、DuckDuckGo、原始Bing
     * @param {string} query - 搜索关键词
     * @param {string} type - 搜索类型（web/flight/hotel/news）
     * @returns {Promise<Array<Object>>} 搜索结果列表
     */
    async search(query, type = 'web') {
        const searchQuery = QUERY_PREFIXES[type] ? QUERY_PREFIXES[type] + query : query;

        const methods = [
            () => this.searchBing(searchQuery, type),
            () => this.searchDuckDuckGoHTML(searchQuery),
            () => this.searchBing(query, type),
        ];

        for (const method of methods) {
            try {
                const results = await method();
                logger.info(`[SearchEngines] 返回 ${results?.length || 0} 条结果`);
                if (results && results.length > 0) return results;
            } catch (e) {
                logger.warn(`[SearchEngines] 搜索失败: ${e.message}`);
            }
        }

        return [];
    }

    /**
     * @description Bing 搜索 - 抓取 Bing HTML 页面并解析结果
     * @param {string} query - 搜索关键词
     * @param {string} type - 搜索类型
     * @returns {Promise<Array<Object>>} 搜索结果列表
     */
    async searchBing(query, type = 'web') {
        const searchQuery = type === 'news' ? `${query} 最新新闻` : query;
        const url = `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}&setlang=zh-CN&cc=cn`;

        const response = await axios.get(url, { timeout: SEARCH_TIMEOUT, headers: COMMON_HEADERS, proxy: false });
        return this.parseBingResults(response.data);
    }

    /**
     * @description 解析 Bing 搜索结果 HTML
     * @param {string} html - Bing 页面 HTML
     * @returns {Array<Object>} 解析后的搜索结果
     */
    parseBingResults(html) {
        const results = [];
        const liRegex = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
        let liMatch;

        while ((liMatch = liRegex.exec(html)) !== null && results.length < 10) {
            const block = liMatch[1];
            let title = '', url = '', snippet = '';

            const h2Match = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
            if (h2Match) {
                const h2Content = h2Match[1];
                const aMatch = h2Content.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
                if (aMatch) {
                    url = aMatch[1];
                    title = this.stripHtml(aMatch[2]).trim();
                }
            }

            if (!title) {
                const aMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
                if (aMatch) {
                    url = aMatch[1];
                    const rawTitle = aMatch[2].replace(/<cite[^>]*>[\s\S]*?<\/cite>/gi, '');
                    title = this.stripHtml(rawTitle).trim();
                }
            }

            const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
            if (pMatch) snippet = this.stripHtml(pMatch[1]).trim();

            if (title && url && url.startsWith('http') && !url.includes('bing.com') && !url.includes('microsoft.com')) {
                results.push({ title, url, snippet });
            }
        }

        return results.length > 0 ? results : this.fallbackParseLinks(html);
    }

    /**
     * @description 备用链接解析 - 当标准解析失败时提取页面中的链接
     * @param {string} html - 页面 HTML
     * @returns {Array<Object>} 链接列表
     */
    fallbackParseLinks(html) {
        const results = [];
        const linkRegex = /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
            const url = match[1];
            const rawTitle = match[2].replace(/<cite[^>]*>[\s\S]*?<\/cite>/gi, '');
            const title = this.stripHtml(rawTitle).trim();

            if (title.length > 5 && title.length < 200 &&
                !url.includes('bing.com') && !url.includes('microsoft.com') &&
                !url.includes('duckduckgo.com')) {
                results.push({ title, url, snippet: '' });
            }
        }

        return results;
    }

    /**
     * @description DuckDuckGo HTML 搜索 - 抓取 DuckDuckGo HTML 版页面
     * @param {string} query - 搜索关键词
     * @returns {Promise<Array<Object>>} 搜索结果列表
     */
    async searchDuckDuckGoHTML(query) {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await axios.get(url, { timeout: SEARCH_TIMEOUT, headers: COMMON_HEADERS, proxy: false });
        return this.parseDDGHTMLResults(response.data);
    }

    /**
     * @description 解析 DuckDuckGo HTML 搜索结果
     * @param {string} html - DuckDuckGo 页面 HTML
     * @returns {Array<Object>} 解析后的搜索结果
     */
    parseDDGHTMLResults(html) {
        const results = [];
        const resultRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
            const url = match[1];
            const title = this.stripHtml(match[2]).trim();

            if (title && url && url.startsWith('http')) {
                const snippetMatch = html.substring(match.index, match.index + 2000).match(/class="result__snippet"[^>]*>([\s\S]*?)<\/[at]/i);
                const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]).trim() : '';
                results.push({ title, url, snippet });
            }
        }

        return results;
    }

    /**
     * @description 去除 HTML 标签和实体，提取纯文本
     * @param {string} html - HTML 文本
     * @returns {string} 纯文本
     */
    stripHtml(html) {
        return html
            .replace(/<[^>]+>/g, '')
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

module.exports = new SearchEngines();