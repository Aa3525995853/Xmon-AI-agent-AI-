/**
 * @file newsService.js
 * @description 新闻服务入口文件，加载并导出新闻服务模块，
 *              提供新闻搜索、资讯聚合和 AI 领域动态追踪功能
 * @module services/newsService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：新闻服务入口
// 功能说明：加载并导出 NewsService 类和实例
// ============================================================

const NewsService = require("./newsService/index");

module.exports = NewsService;
module.exports.NewsService = NewsService.NewsService;
