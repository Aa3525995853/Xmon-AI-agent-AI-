/**
 * @file weather_routes.js
 * @description 天气搜索路由模块，提供当前天气查询、天气预报、通用搜索及缓存清除等 API 接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const router = express.Router();
const weatherSearch = require('../services/weather_search');

/** 天气预报默认天数 */
const DEFAULT_FORECAST_DAYS = 3;

// ============================================================
// 模块名称：天气查询
// 功能说明：当前天气查询、天气预报
// ============================================================

/**
 * @description 获取指定城市的当前天气信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.city - 城市名称
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含当前天气数据
 */
router.get('/weather', async (req, res) => {
    try {
        const { city } = req.query;
        if (!city) {
            res.status(400).json({ error: '请提供 city 参数' });
            return;
        }

        const weather = await weatherSearch.getCurrentWeather(city);
        res.json({
            success: true,
            ...weather
        });
    } catch (error) {
        console.error('[天气] 查询失败:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @description 获取指定城市未来几天的天气预报
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.city - 城市名称
 * @param {number} [req.query.days=3] - 预报天数
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含天气预报数据
 */
router.get('/weather/forecast', async (req, res) => {
    try {
        const { city, days } = req.query;
        if (!city) {
            res.status(400).json({ error: '请提供 city 参数' });
            return;
        }

        const forecast = await weatherSearch.getForecast(city, parseInt(days) || DEFAULT_FORECAST_DAYS);
        res.json({
            success: true,
            ...forecast
        });
    } catch (error) {
        console.error('[天气] 预报查询失败:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 模块名称：通用搜索与缓存
// 功能说明：关键词搜索、缓存清除
// ============================================================

/**
 * @description 通用搜索接口，根据关键词搜索相关信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.q - 搜索关键词
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含搜索结果
 */
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            res.status(400).json({ error: '请提供 q 参数（搜索关键词）' });
            return;
        }

        const result = await weatherSearch.search(q);
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('[搜索] 查询失败:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @description 清除天气服务的缓存数据，强制下次查询时重新获取
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，确认缓存已清除
 */
router.post('/clear-cache', (req, res) => {
    weatherSearch.clearCache();
    res.json({ success: true, message: '缓存已清除' });
});

module.exports = router;