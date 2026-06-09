/**
 * @file rss_fetcher.js
 * @description RSS 获取器 - 从 RSS 源抓取新闻数据，支持缓存、XML 解析和 IP 地理位置查询
 * @module services/newsService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');

// ============================================================
// 常量定义
// ============================================================

/** HTTP 请求通用请求头 */
const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
    'Accept': 'application/xml,application/xhtml+xml,text/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

/** RSS 请求超时时间（毫秒），15秒 */
const SEARCH_TIMEOUT = 15000;

/** 禁用代理配置 */
const NO_PROXY_CONFIG = { proxy: false };

/** RSS 缓存有效期（毫秒），10分钟 */
const RSS_CACHE_TTL = 10 * 60 * 1000;

/** 每个 RSS 源最多解析的条目数 */
const MAX_ITEMS_PER_FEED = 20;

/** IP 地理位置查询超时时间（毫秒），5秒 */
const LOCATION_TIMEOUT = 5000;

class RssFetcher {
    /**
     * @description 构造函数，初始化 RSS 缓存和位置缓存
     */
    constructor() {
        /** RSS 数据缓存，键为缓存键，值为 {data, time} */
        this._rssCache = new Map();
        /** IP 地理位置缓存 */
        this._locationCache = null;
    }

    /**
     * @description 根据分类列表从 RSS 源映射中选择对应的订阅源
     * @param {Array<string>} categories - 新闻分类列表
     * @param {Object} rssSources - RSS 源映射，键为分类名，值为 URL
     * @returns {Object} 匹配的 RSS 源映射
     */
    selectFeeds(categories, rssSources) {
        const feeds = {};
        for (const cat of categories) {
            if (rssSources[cat]) feeds[cat] = rssSources[cat];
        }
        return feeds;
    }

    /**
     * @description 并发抓取所有 RSS 源，按发布时间降序合并结果
     * @param {Object} feeds - RSS 源映射，键为分类名，值为 URL
     * @returns {Promise<Array<Object>>} 合并后的新闻条目列表
     */
    async fetchFeeds(feeds) {
        const entries = Object.entries(feeds);
        const results = await Promise.allSettled(
            entries.map(([cat, url]) => this._fetchSingleRSS(cat, url))
        );

        const allItems = [];
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value.length > 0) {
                allItems.push(...r.value);
            }
        });

        // 按发布时间降序排列，最新的在前
        allItems.sort((a, b) => {
            const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
            const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
            return tb - ta;
        });

        return allItems;
    }

    /**
     * @description 抓取单个 RSS 源，优先使用缓存
     * @param {string} category - 分类名
     * @param {string} url - RSS URL
     * @returns {Promise<Array<Object>>} 新闻条目列表
     */
    async _fetchSingleRSS(category, url) {
        const cacheKey = `rss_${category}`;
        const cached = this._rssCache.get(cacheKey);
        // 缓存未过期时直接返回
        if (cached && Date.now() - cached.time < RSS_CACHE_TTL) {
            return cached.data;
        }

        try {
            const response = await axios.get(url, { timeout: SEARCH_TIMEOUT, headers: COMMON_HEADERS, ...NO_PROXY_CONFIG });
            const items = this._parseRSSXML(response.data, category);
            this._rssCache.set(cacheKey, { data: items, time: Date.now() });
            return items;
        } catch (error) {
            console.warn(`[NewsService] RSS抓取失败 [${category}]:`, error.message);
            return [];
        }
    }

    /**
     * @description 解析 RSS XML 文本，提取新闻条目
     * @param {string} xml - RSS XML 文本
     * @param {string} category - 分类名
     * @returns {Array<Object>} 解析后的新闻条目列表
     */
    _parseRSSXML(xml, category) {
        const items = [];
        const seenTitles = new Set();
        const itemRegex = /<item[\s\S]*?<\/item>/gi;
        let itemMatch;

        while ((itemMatch = itemRegex.exec(xml)) !== null && items.length < MAX_ITEMS_PER_FEED) {
            const itemXml = itemMatch[0];
            // 同时支持 CDATA 包裹和普通文本两种格式
            const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
            const linkMatch = itemXml.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>|<link>([\s\S]*?)<\/link>/i);
            const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i);
            const dateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

            const title = this._cleanText(titleMatch ? (titleMatch[1] || titleMatch[2]) : '');
            const link = this._cleanText(linkMatch ? (linkMatch[1] || linkMatch[2]) : '');
            const desc = this._cleanText(descMatch ? (descMatch[1] || descMatch[2]) : '');
            const pubDate = dateMatch ? dateMatch[1].trim() : '';

            // 过滤标题过短或重复的条目
            if (!title || title.length < 6 || seenTitles.has(title)) continue;
            seenTitles.add(title);

            items.push({
                title,
                href: link,
                summary: desc.substring(0, 200),
                source: `中新网·${category}`,
                time: pubDate,
                pubDate
            });
        }

        return items;
    }

    /**
     * @description 清理文本中的 HTML 标签和 XML 实体
     * @param {string} text - 待清理的文本
     * @returns {string} 清理后的纯文本
     */
    _cleanText(text) {
        if (!text) return '';
        return text
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * @description 获取当前 IP 的地理位置，优先使用缓存，支持两个备用 API
     * @returns {Promise<{ip: string, city: string, region: string, country: string}|null>} 位置信息
     */
    async getLocation() {
        if (this._locationCache) return this._locationCache;

        try {
            const resp = await axios.get('https://ipapi.co/json/', { timeout: LOCATION_TIMEOUT, ...NO_PROXY_CONFIG });
            this._locationCache = {
                ip: resp.data.ip,
                city: resp.data.city || resp.data.region || '',
                region: resp.data.region || '',
                country: resp.data.country_name || ''
            };
            return this._locationCache;
        } catch {
            // 主 API 失败时使用备用 API
            try {
                const resp = await axios.get('https://api.ip.sb/geoip', { timeout: LOCATION_TIMEOUT, ...NO_PROXY_CONFIG });
                this._locationCache = {
                    ip: resp.data.ip,
                    city: resp.data.city || resp.data.region || '',
                    region: resp.data.region || '',
                    country: resp.data.country || ''
                };
                return this._locationCache;
            } catch {
                return null;
            }
        }
    }
}

module.exports = new RssFetcher();