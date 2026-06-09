/**
 * @file news/index.js
 * @description 新闻插件，提供新闻搜索功能，返回格式化的新闻结果
 * @module plugins/news
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const newsService = require('../../services/newsService');

class NewsPlugin {
    /**
     * @description 激活插件，注入服务总线依赖
     * @param {Object} deps - 插件依赖对象
     * @param {Object} deps.serviceBus - 服务总线，用于插件间通信
     */
    activate(deps) {
        this.serviceBus = deps.serviceBus;
    }

    /**
     * @description 停用插件，清理资源
     */
    deactivate() {}

    /**
     * @description 执行新闻插件能力，搜索新闻并返回格式化结果
     * @param {string} capability - 能力标识，目前仅支持 news:search
     * @param {Object} params - 参数对象
     * @param {string} params.query - 新闻搜索关键词
     * @returns {Promise<Object>} 新闻搜索结果，包含 success、formatted、categories、highlights 等字段
     * @throws {Error} 未知能力标识时抛出异常
     */
    async execute(capability, params) {
        switch (capability) {
            case 'news:search': {
                const result = await newsService.searchNews(params.query);
                return {
                    success: result.success,
                    formatted: newsService.formatOutput(result),
                    categories: result.categories,
                    highlights: result.highlights,
                    location: result.location,
                    localNews: result.localNews
                };
            }
            default:
                throw new Error(`Unknown capability: ${capability}`);
        }
    }
}

module.exports = NewsPlugin;
