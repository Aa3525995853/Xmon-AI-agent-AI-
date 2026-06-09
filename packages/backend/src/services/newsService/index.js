/**
 * @file index.js
 * @description NewsService 主入口 - 新闻服务，整合 RSS 抓取、内容过滤、LLM 结构化和缓存，
 *              提供新闻搜索和格式化输出功能
 * @module services/newsService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块，避免循环依赖
// ============================================================

/** RSS 获取器懒加载实例 */
let _rssFetcher = null;
/** 内容过滤器懒加载实例 */
let _contentFilter = null;
/** LLM 结构化器懒加载实例 */
let _llmStructurer = null;

/**
 * @description 获取 RSS 获取器单例
 * @returns {Object} RssFetcher 实例
 */
function getRssFetcher() {
    if (!_rssFetcher) _rssFetcher = require('./rss_fetcher');
    return _rssFetcher;
}

/**
 * @description 获取内容过滤器单例
 * @returns {Object} ContentFilter 实例
 */
function getContentFilter() {
    if (!_contentFilter) _contentFilter = require('./content_filter');
    return _contentFilter;
}

/**
 * @description 获取 LLM 结构化器单例
 * @returns {Object} LlmStructurer 实例
 */
function getLlmStructurer() {
    if (!_llmStructurer) _llmStructurer = require('./llm_structurer');
    return _llmStructurer;
}

// ============================================================
// 常量定义
// ============================================================

/** 中新网 RSS 源映射 */
const RSS_SOURCES = {
    '要闻': 'https://www.chinanews.com.cn/rss/importnews.xml',
    '时政': 'https://www.chinanews.com.cn/rss/china.xml',
    '国际': 'https://www.chinanews.com.cn/rss/world.xml',
    '社会': 'https://www.chinanews.com.cn/rss/society.xml',
    '财经': 'https://www.chinanews.com.cn/rss/finance.xml',
    '文娱': 'https://www.chinanews.com.cn/rss/culture.xml',
    '体育': 'https://www.chinanews.com.cn/rss/sports.xml',
    '健康': 'https://www.chinanews.com.cn/rss/jk.xml',
    '科技': 'https://www.chinanews.com.cn/rss/life.xml',
    '教育': 'https://www.chinanews.com.cn/rss/edu.xml'
};

/** 新闻搜索结果缓存有效期（毫秒），5分钟 */
const NEWS_CACHE_TTL = 5 * 60 * 1000;

/** 相关新闻最少条数，不足时回退到全量前15条 */
const MIN_RELEVANT_COUNT = 5;

/** 返回给用户的最多新闻条数 */
const MAX_RESULT_COUNT = 20;

class NewsService {
    /**
     * @description 构造函数，初始化子模块和缓存
     */
    constructor() {
        this.rssFetcher = getRssFetcher();
        this.contentFilter = getContentFilter();
        this.llmStructurer = getLlmStructurer();

        /** 新闻搜索结果缓存 */
        this.cache = new Map();
        /** 缓存有效期 */
        this.cacheTTL = NEWS_CACHE_TTL;
        /** IP 地理位置缓存 */
        this._locationCache = null;

        logger.info('[NewsService] 新闻服务初始化完成');
    }

    /**
     * @description 搜索新闻，整合 RSS 抓取、内容过滤、LLM 结构化和缓存
     * @param {string} query - 搜索关键词
     * @param {Object} [options] - 搜索选项
     * @param {boolean} [options.skipLocal] - 是否跳过地理位置查询
     * @param {boolean} [options.includeRaw] - 是否包含原始条目数据
     * @returns {Promise<{success: boolean, query?: string, total?: number, categories?: Array, highlights?: Array, message?: string}>} 搜索结果
     */
    async searchNews(query, options = {}) {
        const cacheKey = `news_${query}_${new Date().toDateString()}`;
        const cached = this.cache.get(cacheKey);
        // 缓存命中且未过期时直接返回
        if (cached && Date.now() - cached.time < this.cacheTTL) {
            return cached.data;
        }

        const today = new Date();
        const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
        // 包含"今天/今日"关键词时，补充日期信息提高搜索精度
        const searchQuery = query.includes('今天') || query.includes('今日')
            ? `${dateStr} 新闻热点`
            : query;

        const categories = this.contentFilter.matchCategories(searchQuery);
        const rssFeeds = this.rssFetcher.selectFeeds(categories, RSS_SOURCES);

        const allItems = await this.rssFetcher.fetchFeeds(rssFeeds);

        // 先按相关性过滤，再去重
        let filtered = allItems.filter(item => this.contentFilter.isRelevant(item, searchQuery));
        filtered = this.contentFilter.deduplicate(filtered);

        const normalizedQuery = searchQuery.replace(/\s+/g, '').replace(/新闻|资讯|最新|热点|今天|今日|[0-9年月日]/g, '');
        const isGenericNewsQuery = normalizedQuery.length === 0;

        // 只有泛新闻查询才回退到全量新闻；明确主题查询不能用无关新闻冒充结果。
        if (filtered.length < MIN_RELEVANT_COUNT && isGenericNewsQuery) {
            filtered = this.contentFilter.deduplicate(allItems).slice(0, 15);
        }

        filtered = filtered.slice(0, MAX_RESULT_COUNT);

        if (filtered.length === 0) {
            return { success: false, message: '暂时没有找到相关新闻，换个关键词试试？', categories: [] };
        }

        const structured = await this.llmStructurer.structure(filtered, searchQuery);

        let location = null;
        if (!options.skipLocal) {
            location = await this.rssFetcher.getLocation();
        }

        const output = {
            success: true,
            query: searchQuery,
            total: filtered.length,
            location,
            categories: structured.categories || [],
            highlights: structured.highlights || [],
            rawItems: options.includeRaw ? filtered : undefined
        };

        this.cache.set(cacheKey, { data: output, time: Date.now() });
        return output;
    }

    /**
     * @description 将搜索结果格式化为用户可读的文本
     * @param {Object} result - 搜索结果对象
     * @returns {string} 格式化的新闻摘要文本
     */
    formatOutput(result) {
        if (!result.success) return result.message;

        let output = `📰 共找到 ${result.total} 条相关新闻\n\n`;

        if (result.highlights && result.highlights.length > 0) {
            output += '🔥 热点速递：\n';
            result.highlights.slice(0, 3).forEach((h, i) => {
                output += `${i + 1}. ${h}\n`;
            });
            output += '\n';
        }

        if (result.categories && result.categories.length > 0) {
            output += '📂 分类概览：\n';
            result.categories.forEach(c => {
                output += `• ${c.name}: ${c.count}条\n`;
            });
            output += '\n';
        }

        if (result.location) {
            output += `📍 当前位置: ${result.location.city || result.location.region || '未知'}\n\n`;
        }

        output += '💡 完整内容可回复"详情"获取';
        return output;
    }
}

const instance = new NewsService();
module.exports = instance;
module.exports.NewsService = NewsService;