/**
 * @file search_engine.js
 * @description 搜索引擎适配器 - 管理多搜索引擎（百度/Bing/Google）的配置和查询参数映射，
 *              当前仅提供元数据，实际抓取需通过 BrowserService 实现
 * @module services/enhancedSearch
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 严格完成规则：搜索结果必须来自真实的搜索提供商或浏览器抓取，
 * 禁止返回伪造的搜索结果（如 example.com 记录）
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：搜索引擎配置
// ============================================================

/** 搜索引擎配置：名称、基础 URL 和查询参数映射 */
const SEARCH_ENGINES = {
    baidu: {
        name: 'Baidu',
        baseUrl: 'https://www.baidu.com/s',
        params: { wd: 'query' }
    },
    bing: {
        name: 'Bing',
        baseUrl: 'https://www.bing.com/search',
        params: { q: 'query' }
    },
    google: {
        name: 'Google',
        baseUrl: 'https://www.google.com/search',
        params: { q: 'query' }
    }
};

// ============================================================
// SearchEngine 类：搜索引擎查询适配
// ============================================================

class SearchEngine {
    constructor() {
        this.engines = SEARCH_ENGINES;
        /** 默认搜索引擎 */
        this.defaultEngine = 'baidu';
    }

    /**
     * @description 执行搜索查询，当前仅返回不可用提示，需通过 BrowserService 实际抓取
     * @param {string} query - 搜索关键词
     * @param {string} [engine='baidu'] - 搜索引擎名称（baidu/bing/google）
     * @returns {Promise<{success: boolean, message: string, query: string, engine: string}>} 搜索结果
     */
    async search(query, engine = 'baidu') {
        const config = this.engines[engine] || this.engines[this.defaultEngine];
        logger.info(`[SearchEngine] ${config.name}: ${query}`);

        // 当前模块仅有搜索引擎元数据，尚未接入真实抓取实现，
        // 返回不可用提示而非伪造搜索结果
        return {
            success: false,
            message: 'Enhanced search engine has no real fetch implementation',
            query,
            engine: config.name
        };
    }

    /**
     * @description 获取所有可用的搜索引擎名称列表
     * @returns {Array<string>} 搜索引擎名称数组
     */
    getAvailableEngines() {
        return Object.keys(this.engines);
    }
}

module.exports = new SearchEngine();
