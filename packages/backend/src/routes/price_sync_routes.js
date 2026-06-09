/**
 * @file price_sync_routes.js
 * @description 价格同步路由模块，提供手动触发价格同步、获取同步状态和价格历史查询等 API 接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const priceSyncService = require('../services/price_sync_service');

// ============================================================
// 模块名称：价格同步与状态查询
// 功能说明：手动触发价格同步、获取同步状态
// ============================================================

/**
 * @description 手动触发价格同步，从各平台拉取最新票价数据
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含同步结果
 */
router.post('/sync', async (req, res) => {
    try {
        const result = await priceSyncService.manualSync();

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('[价格同步路由] 同步失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取价格同步服务的当前状态，包括上次同步时间、同步频率等
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含同步状态 data
 */
router.get('/status', (req, res) => {
    try {
        const status = priceSyncService.getStatus();

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        logger.error('[价格同步路由] 获取状态失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：价格历史查询
// 功能说明：按路线查询价格历史记录
// ============================================================

/**
 * @description 获取指定路线的价格历史记录，包含当前价格、最后更新时间和各平台价格
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.from - 出发地城市名
 * @param {string} req.query.to - 目的地城市名
 * @param {string} [req.query.date] - 出发日期
 * @param {string} [req.query.type='train'] - 票种类型
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含价格历史 data（currentPrice、lastUpdate、platforms）
 */
router.get('/history', (req, res) => {
    try {
        const { from, to, date, type } = req.query;

        if (!from || !to) {
            return res.status(400).json({
                success: false,
                error: '请提供出发地和目的地'
            });
        }

        const history = priceSyncService.getPriceHistory(from, to, date, type || 'train');

        res.json({
            success: true,
            data: history ? {
                from,
                to,
                date,
                type: type || 'train',
                currentPrice: history.price,
                lastUpdate: new Date(history.time).toLocaleString('zh-CN'),
                platforms: history.platforms
            } : null
        });

    } catch (error) {
        logger.error('[价格同步路由] 获取历史失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;