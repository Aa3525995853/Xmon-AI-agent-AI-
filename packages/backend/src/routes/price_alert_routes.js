/**
 * @file price_alert_routes.js
 * @description 价格提醒路由模块，提供价格提醒的创建、取消、列表查询、
 *              活跃提醒获取、统计信息及手动触发检查等 API 接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const priceAlertService = require('../services/price_alert_service');

// ============================================================
// 模块名称：价格提醒创建与取消
// 功能说明：创建价格提醒、取消指定提醒
// ============================================================

/**
 * @description 创建价格提醒，当指定路线票价低于目标价时通知用户
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.from - 出发地城市名
 * @param {string} req.body.to - 目的地城市名
 * @param {string} [req.body.date] - 出发日期
 * @param {number} req.body.targetPrice - 目标价格（元）
 * @param {string} [req.body.userId] - 用户 ID
 * @param {string} [req.body.flightType] - 航班类型
 * @param {string} [req.body.platform] - 指定监控平台
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含创建的提醒 data 和确认消息
 */
router.post('/create', async (req, res) => {
    try {
        const { from, to, date, targetPrice, userId, flightType, platform } = req.body;

        const alert = priceAlertService.createAlert({
            from,
            to,
            date,
            targetPrice: parseFloat(targetPrice),
            userId,
            flightType,
            platform
        });

        res.json({
            success: true,
            data: priceAlertService.formatAlertForUser(alert),
            message: `价格提醒已创建：${from}→${to}，目标价 ¥${targetPrice}`
        });

    } catch (error) {
        logger.error('[价格提醒路由] 创建失败:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 取消指定的价格提醒
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.alertId - 要取消的提醒 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.post('/cancel', (req, res) => {
    try {
        const { alertId } = req.body;

        if (!alertId) {
            return res.status(400).json({
                success: false,
                error: '请提供提醒ID'
            });
        }

        const cancelled = priceAlertService.cancelAlert(alertId);

        res.json({
            success: cancelled,
            message: cancelled ? '提醒已取消' : '提醒不存在'
        });

    } catch (error) {
        logger.error('[价格提醒路由] 取消失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：价格提醒查询与统计
// 功能说明：提醒列表、活跃提醒、统计信息、手动检查
// ============================================================

/**
 * @description 获取指定用户的价格提醒列表
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.userId='default'] - 用户 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含提醒列表 data 和数量 count
 */
router.get('/list', (req, res) => {
    try {
        const userId = req.query.userId || 'default';
        const alerts = priceAlertService.getAlertsByUser(userId);

        res.json({
            success: true,
            data: alerts,
            count: alerts.length
        });

    } catch (error) {
        logger.error('[价格提醒路由] 获取列表失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取所有处于活跃状态的价格提醒
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含活跃提醒列表 data 和数量 count
 */
router.get('/active', (req, res) => {
    try {
        const alerts = priceAlertService.getActiveAlerts();

        res.json({
            success: true,
            data: alerts.map(a => priceAlertService.formatAlertForUser(a)),
            count: alerts.length
        });

    } catch (error) {
        logger.error('[价格提醒路由] 获取活跃提醒失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取价格提醒的统计信息，包含各状态提醒数量等汇总数据
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含统计数据 data
 */
router.get('/stats', (req, res) => {
    try {
        const stats = priceAlertService.getStats();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('[价格提醒路由] 获取统计失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 手动触发一次所有价格提醒的检查，即时比对当前价格与目标价
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，确认检查已完成
 */
router.post('/check', async (req, res) => {
    try {
        await priceAlertService.checkAllAlerts();

        res.json({
            success: true,
            message: '检查已完成'
        });

    } catch (error) {
        logger.error('[价格提醒路由] 检查失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;