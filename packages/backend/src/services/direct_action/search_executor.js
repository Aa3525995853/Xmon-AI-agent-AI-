/**
 * @file search_executor.js
 * @description 搜索执行器 - 执行各类搜索操作，包括网页搜索、天气查询等，
 *              严格保留上游失败状态，不会将不可用的搜索集成包装为 success:true
 * @module services/direct_action
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 搜索类型定义
// ============================================================

/** 搜索类型元数据映射，包含名称、图标和分类 */
const SEARCH_TYPES = {
    web: { name: 'Web search', icon: 'fa-globe', category: 'search' },
    image: { name: 'Image search', icon: 'fa-image', category: 'search' },
    video: { name: 'Video search', icon: 'fa-video', category: 'search' },
    news: { name: 'News search', icon: 'fa-newspaper', category: 'search' },
    music: { name: 'Music search', icon: 'fa-music', category: 'search' },
    weather: { name: 'Weather query', icon: 'fa-cloud-sun', category: 'info' },
    news_search: { name: 'News search', icon: 'fa-newspaper', category: 'search' },
    wikipedia: { name: 'Wikipedia query', icon: 'fa-book', category: 'info' }
};

/** 快捷搜索入口列表，用于前端展示 */
const QUICK_SEARCHES = [
    { id: 'web', name: '网页', icon: 'fa-globe', category: '搜索' },
    { id: 'image', name: '图片', icon: 'fa-image', category: '搜索' },
    { id: 'video', name: '视频', icon: 'fa-video', category: '搜索' },
    { id: 'news', name: '新闻', icon: 'fa-newspaper', category: '搜索' },
    { id: 'music', name: '音乐', icon: 'fa-music', category: '搜索' },
    { id: 'weather', name: '天气', icon: 'fa-cloud-sun', category: '生活' },
    { id: 'wikipedia', name: '百科', icon: 'fa-book', category: '知识' }
];

class SearchExecutor {
    /**
     * @description 构造函数，初始化搜索类型和快捷搜索列表
     */
    constructor() {
        /** 搜索类型元数据 */
        this.types = SEARCH_TYPES;
        /** 快捷搜索入口列表 */
        this.quickSearches = QUICK_SEARCHES;
    }

    /**
     * @description 执行搜索操作，根据搜索类型分发到对应的搜索方法
     * @param {string} searchType - 搜索类型（weather/wikipedia/web/image/video/news/music）
     * @param {string} query - 搜索查询关键词
     * @returns {Promise<{success: boolean, query?: string, type?: string, results?: Array, message?: string}>} 搜索结果
     */
    async execute(searchType, query) {
        try {
            switch (searchType) {
                case 'weather':
                    return await this._searchWeather(query);
                case 'wikipedia':
                    // Wikipedia 搜索暂无真实提供商集成，返回不可用状态
                    return this._unavailable(searchType, query, 'Wikipedia search has no real provider integration');
                default:
                    return await this._searchWeb(searchType || 'web', query);
            }
        } catch (error) {
            logger.error('[SearchExecutor] search failed:', error);
            return { success: false, message: error.message, type: searchType, query };
        }
    }

    /**
     * @description 执行网页搜索，调用增强搜索服务获取结果
     * @param {string} type - 搜索类型
     * @param {string} query - 搜索关键词
     * @returns {Promise<{success: boolean, query: string, type: string, results?: Array, total?: number, message?: string}>} 搜索结果
     */
    async _searchWeb(type, query) {
        if (!query) return { success: false, message: 'Missing search query', type };

        const searchService = require('../enhancedSearchService');
        const result = await searchService.search(query, 'baidu');
        if (!result.success) {
            return {
                success: false,
                message: result.message || 'Search failed',
                query,
                type
            };
        }

        return {
            success: true,
            query,
            type,
            results: result.results || [],
            total: result.total || 0
        };
    }

    /**
     * @description 执行天气查询，调用天气搜索服务获取当前天气
     * @param {string} query - 城市/地点名称
     * @returns {Promise<{success: boolean, query: string, type: string, result?: Object, message?: string}>} 天气查询结果
     */
    async _searchWeather(query) {
        if (!query) return { success: false, message: 'Missing weather query', type: 'weather' };

        const weatherSearch = require('../weather_search');
        const result = await weatherSearch.getCurrentWeather(query);
        return { success: true, query, type: 'weather', result };
    }

    /**
     * @description 返回不可用状态，用于未集成的搜索类型
     * @param {string} type - 搜索类型
     * @param {string} query - 查询关键词
     * @param {string} message - 不可用原因
     * @returns {{success: false, query: string, type: string, message: string}} 不可用结果
     */
    _unavailable(type, query, message) {
        return { success: false, query, type, message };
    }

    /**
     * @description 获取快捷搜索入口列表
     * @returns {Array<Object>} 快捷搜索列表
     */
    getQuickSearches() {
        return this.quickSearches;
    }

    /**
     * @description 将 URL 转换为简洁的显示格式（仅显示域名）
     * @param {string} url - 完整 URL
     * @returns {string} 简洁的域名显示，解析失败则截取前30字符
     */
    getDisplayUrl(url) {
        if (!url) return '';
        try {
            const parsed = new URL(url);
            return parsed.hostname.replace('www.', '');
        } catch (e) {
            // URL 解析失败时，截取前30字符作为兜底显示
            return String(url).substring(0, 30);
        }
    }
}

module.exports = new SearchExecutor();
