/**
 * @file news_routes.js
 * @description 新闻搜索路由模块，让小梦能联网搜索最新新闻资讯并进行摘要，
 *              支持关键词搜索、AI/科技/热门新闻分类及新闻分类列表查询
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const newsService = require('../services/newsService');
const { logger } = require('../utils/logger');

// ============================================================
// 模块名称：新闻搜索
// 功能说明：关键词搜索、AI/科技/热门新闻
// ============================================================

/**
 * @description 搜索新闻，支持关键词和主题搜索
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.q] - 搜索关键词
 * @param {string} [req.query.topic] - 新闻主题
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含新闻搜索结果
 */
router.get('/search', async (req, res) => {
    const { q, topic } = req.query;

    if (!q && !topic) {
        return res.status(400).json({
            success: false,
            error: '请提供搜索关键词'
        });
    }

    try {
        const query = q || topic;
        logger.info(`[新闻路由] 搜索: "${query}"`);

        const result = await newsService.searchNews(query);

        res.json(result);
    } catch (error) {
        logger.error('[新闻路由] 搜索失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 搜索 AI 相关新闻（便捷接口），随机选择 AI 关键词进行搜索
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 AI 新闻搜索结果
 */
router.get('/ai', async (req, res) => {
    try {
        const keywords = [
            'AI 人工智能 最新动态',
            '大模型 最新资讯',
            'ChatGPT OpenAI 最新消息',
            'AI 行业热点'
        ];

        // 随机选择一个搜索关键词
        const query = keywords[Math.floor(Math.random() * keywords.length)];
        logger.info(`[新闻路由] AI新闻搜索: "${query}"`);

        const result = await newsService.searchNews(query, {
            sources: [
                {
                    name: 'AI科技媒体',
                    url: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}&tn=news`,
                    extractLinks: true,
                    linkSelector: 'body'
                }
            ]
        });

        res.json(result);
    } catch (error) {
        logger.error('[新闻路由] AI新闻搜索失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 搜索科技新闻
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含科技新闻搜索结果
 */
router.get('/tech', async (req, res) => {
    try {
        const query = '科技 互联网 最新新闻';
        const result = await newsService.searchNews(query);

        res.json(result);
    } catch (error) {
        logger.error('[新闻路由] 科技新闻搜索失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取热门新闻
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含热门新闻搜索结果
 */
router.get('/hot', async (req, res) => {
    try {
        const result = await newsService.searchNews('今日热点新闻');

        res.json(result);
    } catch (error) {
        logger.error('[新闻路由] 热门新闻搜索失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：新闻分类
// 功能说明：获取新闻分类列表
// ============================================================

/**
 * @description 获取新闻分类列表，返回各分类的 ID、名称、图标和关键词
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 categories 数组
 */
router.get('/categories', async (req, res) => {
    const categories = [
        { id: 'ai', name: 'AI人工智能', icon: '🤖', keywords: ['AI', '人工智能', '大模型', 'ChatGPT'] },
        { id: 'tech', name: '科技动态', icon: '💻', keywords: ['科技', '互联网', '数码'] },
        { id: 'finance', name: '财经要闻', icon: '📈', keywords: ['股市', '经济', '金融'] },
        { id: 'social', name: '社会民生', icon: '🌍', keywords: ['社会', '民生', '热点'] },
        { id: 'international', name: '国际动态', icon: '🌐', keywords: ['国际', '外交', '美国', '俄罗斯'] },
        { id: 'entertainment', name: '体育娱乐', icon: '🎬', keywords: ['体育', '娱乐', '明星', '电影'] }
    ];

    res.json({
        success: true,
        categories
    });
});

module.exports = router;