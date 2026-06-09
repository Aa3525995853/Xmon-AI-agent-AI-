/**
 * @file enhancedSearch_routes.js
 * @description 增强搜索 API 路由，提供智能搜索、流式搜索(SSE)、搜索建议、
 *              缓存管理、搜索引擎列表及搜索历史等功能
 * @module routes/enhancedSearch_routes
 * @author 小梦团队
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const EnhancedSearchService = require('../services/enhancedSearchService');

/** 搜索默认最大返回结果数 */
const DEFAULT_MAX_RESULTS = 10;

/** SSE 流式搜索超时时间（毫秒），5 分钟 */
const SSE_TIMEOUT_MS = 300000;

// 创建服务实例（延迟初始化）
const enhancedSearchService = new EnhancedSearchService();

// ============================================================
// 模块名称：搜索执行 API
// 功能说明：智能搜索、流式搜索(SSE)及搜索建议
// ============================================================

/**
 * @description 智能搜索，支持多引擎、查询改写和智能摘要
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.query - 搜索查询文本（必填）
 * @param {Array} [req.body.engines] - 使用的搜索引擎列表
 * @param {number} [req.body.maxResults=10] - 最大返回结果数
 * @param {boolean} [req.body.queryRewrite=true] - 是否启用查询改写
 * @param {boolean} [req.body.smartSummary=true] - 是否启用智能摘要
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...result }
 * @throws {400} 缺少 query 参数
 */
router.post('/', async (req, res, next) => {
    try {
        const { query, engines, maxResults, queryRewrite, smartSummary } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                error: '缺少 query 参数'
            });
        }

        const result = await enhancedSearchService.search(query, {
            engines,
            maxResults: maxResults || DEFAULT_MAX_RESULTS,
            queryRewrite: queryRewrite !== false,
            smartSummary: smartSummary !== false
        });

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @description 流式搜索（SSE），实时推送搜索进度和结果
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.q - 搜索查询文本（必填）
 * @param {Object} res - Express 响应对象
 * @returns {void} 以 SSE 事件流形式推送搜索结果
 * @throws {400} 缺少 q 参数
 */
router.get('/stream', async (req, res, next) => {
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({
            success: false,
            error: '缺少 q 参数'
        });
    }

    // 设置 SSE 头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 设置 SSE 超时，避免长连接被中间件断开
    req.socket.setTimeout(SSE_TIMEOUT_MS);

    try {
        for await (const event of enhancedSearchService.searchStream(q)) {
            if (event.type === 'complete') {
                res.write(`event: complete\ndata: ${JSON.stringify(event)}\n\n`);
                res.end();
                return;
            }

            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data || event)}\n\n`);
        }
    } catch (error) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

/**
 * @description 获取搜索建议，根据输入前缀返回补全建议列表
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.q - 搜索前缀文本
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, suggestions: Array }
 */
router.get('/suggestions', (req, res) => {
    const { q } = req.query;

    if (!q) {
        return res.json({
            success: true,
            suggestions: []
        });
    }

    const suggestions = enhancedSearchService.getSuggestions(q);

    res.json({
        success: true,
        suggestions
    });
});

// ============================================================
// 模块名称：缓存与引擎管理 API
// 功能说明：缓存统计/清除、搜索引擎列表及搜索历史查询
// ============================================================

/**
 * @description 获取搜索缓存的统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, stats: Object }
 */
router.get('/cache/stats', (req, res) => {
    const stats = enhancedSearchService.getCacheStats();

    res.json({
        success: true,
        stats
    });
});

/**
 * @description 清除搜索缓存，支持按模式匹配清除
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.pattern] - 缓存键匹配模式，不传则清除全部
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, message: string }
 */
router.delete('/cache', (req, res) => {
    const { pattern } = req.query;
    enhancedSearchService.clearCache(pattern);

    res.json({
        success: true,
        message: pattern ? `已清除包含 "${pattern}" 的缓存` : '缓存已全部清除'
    });
});

/**
 * @description 获取支持的搜索引擎列表及其能力说明
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, engines: Array<{id, name, supports, type}> }
 */
router.get('/engines', (req, res) => {
    res.json({
        success: true,
        engines: Object.entries({
            bing: { name: 'Bing', supports: ['general', 'news'] },
            google: { name: 'Google', supports: ['general', 'code', 'academic'] },
            baidu: { name: '百度', supports: ['general', 'chinese'] },
            github: { name: 'GitHub', supports: ['code'], type: 'code' },
            zhihu: { name: '知乎', supports: ['qa'], type: 'qa' }
        }).map(([key, value]) => ({ id: key, ...value }))
    });
});

/**
 * @description 获取搜索历史记录
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, history: Array }
 */
router.get('/history', (req, res) => {
    res.json({
        success: true,
        history: enhancedSearchService._searchHistory || []
    });
});

module.exports = router;