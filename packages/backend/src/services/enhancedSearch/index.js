/**
 * @file index.js
 * @description EnhancedSearchService 主入口 - 增强版搜索服务，
 *              整合搜索引擎适配器、结果处理器和缓存管理器，
 *              提供搜索→去重→排序→缓存→摘要的完整流程
 * @module services/enhancedSearch
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块：避免循环依赖，按需初始化
// ============================================================

let _searchEngine = null;
let _resultProcessor = null;
let _cacheManager = null;

/**
 * @description 获取搜索引擎单例
 * @returns {Object} SearchEngine 实例
 */
function getSearchEngine() {
    if (!_searchEngine) _searchEngine = require('./search_engine');
    return _searchEngine;
}

/**
 * @description 获取结果处理器单例
 * @returns {Object} ResultProcessor 实例
 */
function getResultProcessor() {
    if (!_resultProcessor) _resultProcessor = require('./result_processor');
    return _resultProcessor;
}

/**
 * @description 获取缓存管理器单例
 * @returns {Object} CacheManager 实例
 */
function getCacheManager() {
    if (!_cacheManager) _cacheManager = require('./cache_manager');
    return _cacheManager;
}

// ============================================================
// EnhancedSearchService 类：搜索服务主类
// ============================================================

class EnhancedSearchService {
    constructor() {
        this.llmService = null;
    }

    /**
     * @description 延迟获取 LLM 服务实例
     * @returns {Object|null} LLM 服务实例，加载失败返回 null
     */
    _getLLMService() {
        if (!this.llmService) {
            try {
                this.llmService = require('../llm_service');
            } catch (e) {
                logger.warn('[搜索] LLM服务未加载');
            }
        }
        return this.llmService;
    }

    /**
     * @description 执行搜索，流程：检查缓存 → 搜索 → 处理结果 → 缓存
     * @param {string} query - 搜索关键词
     * @param {string} [engine='baidu'] - 搜索引擎名称
     * @returns {Promise<Object>} 搜索结果
     */
    async search(query, engine = 'baidu') {
        // 检查缓存
        const cached = getCacheManager().get(query);
        if (cached) {
            logger.info(`[搜索] 缓存命中: ${query}`);
            return cached;
        }

        try {
            // 执行搜索
            const results = await getSearchEngine().search(query, engine);

            // 处理结果
            const processed = getResultProcessor().process(results, query);

            // 缓存结果
            getCacheManager().set(query, processed);

            return processed;

        } catch (error) {
            logger.error('[搜索] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 使用 LLM 为搜索结果生成摘要
     * @param {Object} results - 搜索结果对象
     * @param {string} query - 原始搜索关键词
     * @returns {Promise<Object>} 包含摘要的搜索结果
     */
    async generateSummary(results, query) {
        const processor = getResultProcessor();
        return processor.generateSummary(results, query, this._getLLMService());
    }

    /**
     * @description 清理所有搜索缓存
     * @returns {{removed: number}} 清理的缓存条目数
     */
    clearCache() {
        return getCacheManager().clear();
    }
}

module.exports = EnhancedSearchService;