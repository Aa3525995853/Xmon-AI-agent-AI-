/**
 * @file order_routes.js
 * @description 订单追踪路由模块，提供订单的创建、列表查询、详情、更新、删除、
 *              取消、即将出行、今日出行及统计等 API 接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const orderTrackingService = require('../services/order_tracking_service');

// ============================================================
// 模块名称：订单创建与查询
// 功能说明：创建订单、获取订单列表、即将出行、今日出行
// ============================================================

/**
 * @description 创建新订单
 * @param {Object} req - Express 请求对象
 * @param {Object} req.body - 订单数据（from、to、date、type 等）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、data 和确认消息
 */
router.post('/create', async (req, res) => {
    try {
        const order = orderTrackingService.createOrder(req.body);

        res.json({
            success: true,
            data: orderTrackingService.formatOrderForUser(order),
            message: `订单已创建：${order.from} → ${order.to}`
        });

    } catch (error) {
        logger.error('[订单路由] 创建失败:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取指定用户的订单列表
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.userId='default'] - 用户 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 data 和 count
 */
router.get('/list', (req, res) => {
    try {
        const userId = req.query.userId || 'default';
        const orders = orderTrackingService.getOrdersByUser(userId);

        res.json({
            success: true,
            data: orders,
            count: orders.length
        });

    } catch (error) {
        logger.error('[订单路由] 获取列表失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取即将出行的订单列表
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.userId] - 用户 ID（可选）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 data 和 count
 */
router.get('/upcoming', (req, res) => {
    try {
        const userId = req.query.userId || null;
        const orders = orderTrackingService.getUpcomingOrders(userId);

        res.json({
            success: true,
            data: orders,
            count: orders.length
        });

    } catch (error) {
        logger.error('[订单路由] 获取即将出行订单失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取今日出行的订单列表
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.userId] - 用户 ID（可选）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 data、count 和 message
 */
router.get('/today', (req, res) => {
    try {
        const userId = req.query.userId || null;
        const orders = orderTrackingService.getTodayOrders(userId);

        res.json({
            success: true,
            data: orders,
            count: orders.length,
            message: orders.length > 0 ? `今天有 ${orders.length} 个行程` : '今天没有出行计划'
        });

    } catch (error) {
        logger.error('[订单路由] 获取今日订单失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：订单统计与详情
// 功能说明：统计信息、订单详情
// ============================================================

/**
 * @description 获取订单统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 data 统计对象
 */
router.get('/stats', (req, res) => {
    try {
        const stats = orderTrackingService.getStats();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('[订单路由] 获取统计失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取指定订单的详细信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 订单 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data
 */
router.get('/:id', (req, res) => {
    try {
        const order = orderTrackingService.getOrderDetail(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: '订单不存在'
            });
        }

        res.json({
            success: true,
            data: order
        });

    } catch (error) {
        logger.error('[订单路由] 获取详情失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：订单操作
// 功能说明：更新、删除、取消订单
// ============================================================

/**
 * @description 更新指定订单的信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 订单 ID
 * @param {Object} req.body - 要更新的字段
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、data 和确认消息
 */
router.put('/:id', (req, res) => {
    try {
        const order = orderTrackingService.updateOrder(req.params.id, req.body);

        res.json({
            success: true,
            data: orderTrackingService.formatOrderForUser(order),
            message: '订单已更新'
        });

    } catch (error) {
        logger.error('[订单路由] 更新失败:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 删除指定订单
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要删除的订单 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.delete('/:id', (req, res) => {
    try {
        const deleted = orderTrackingService.deleteOrder(req.params.id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: '订单不存在'
            });
        }

        res.json({
            success: true,
            message: '订单已删除'
        });

    } catch (error) {
        logger.error('[订单路由] 删除失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 取消指定订单
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要取消的订单 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.post('/:id/cancel', (req, res) => {
    try {
        const cancelled = orderTrackingService.cancelOrder(req.params.id);

        if (!cancelled) {
            return res.status(404).json({
                success: false,
                error: '订单不存在'
            });
        }

        res.json({
            success: true,
            message: '订单已取消'
        });

    } catch (error) {
        logger.error('[订单路由] 取消失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;