/**
 * @file proactive_routes.js
 * @description 主动服务路由模块，提供主动能力的 API 接口，包括状态查询、
 *              待发送消息获取、启用/禁用、问候时间设置、对话模式控制及互动记录等
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const { legacyProactiveService: proactiveService } = require('../services/proactive_service');

// ============================================================
// 模块名称：状态与消息查询
// 功能说明：获取主动服务状态、待发送消息、是否有待发送消息
// ============================================================

/**
 * @description 获取主动服务当前状态
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含服务状态信息
 */
router.get('/status', (req, res) => {
    try {
        const status = proactiveService.getStatus();
        res.json(status);
    } catch (error) {
        console.error('[主动服务] 获取状态失败:', error.message);
        res.status(500).json({ error: '获取状态失败' });
    }
});

/**
 * @description 获取待发送的主动消息列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 messages 数组
 */
router.get('/messages', (req, res) => {
    try {
        const messages = proactiveService.getPendingMessages();
        res.json({
            success: true,
            messages
        });
    } catch (error) {
        console.error('[主动服务] 获取消息失败:', error.message);
        res.status(500).json({ error: '获取消息失败' });
    }
});

/**
 * @description 检查是否有待发送的主动消息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 hasMessages 布尔值
 */
router.get('/has-messages', (req, res) => {
    try {
        const hasMessages = proactiveService.hasPendingMessages();
        res.json({
            success: true,
            hasMessages
        });
    } catch (error) {
        console.error('[主动服务] 检查消息失败:', error.message);
        res.status(500).json({ error: '检查消息失败' });
    }
});

// ============================================================
// 模块名称：主动服务控制
// 功能说明：启用/禁用主动能力、设置问候时间、对话模式控制
// ============================================================

/**
 * @description 启用或禁用主动服务能力
 * @param {Object} req - Express 请求对象
 * @param {boolean} req.body.enabled - 是否启用主动服务
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 enabled 状态
 */
router.post('/toggle', (req, res) => {
    try {
        const { enabled } = req.body;
        if (typeof enabled === 'boolean') {
            proactiveService.setEnabled(enabled);
            res.json({
                success: true,
                enabled
            });
        } else {
            res.status(400).json({ error: '需要 enabled 参数 (boolean)' });
        }
    } catch (error) {
        console.error('[主动服务] 切换状态失败:', error.message);
        res.status(500).json({ error: '切换状态失败' });
    }
});

/**
 * @description 设置问候时间（如早安、晚安等定时问候）
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.type - 问候类型（如 morning、evening）
 * @param {string} req.body.time - 问候时间（如 "08:00"）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.post('/greeting-time', (req, res) => {
    try {
        const { type, time } = req.body;
        if (type && time) {
            proactiveService.setGreetingTime(type, time);
            res.json({
                success: true,
                message: `问候时间已设置为 ${time}`
            });
        } else {
            res.status(400).json({ error: '需要 type 和 time 参数' });
        }
    } catch (error) {
        console.error('[主动服务] 设置问候时间失败:', error.message);
        res.status(500).json({ error: '设置问候时间失败' });
    }
});

/**
 * @description 设置对话模式状态，标记用户是否正在对话中
 * @param {Object} req - Express 请求对象
 * @param {boolean} req.body.inConversation - 是否正在对话中
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 inConversation 状态
 */
router.post('/conversation-mode', (req, res) => {
    try {
        const { inConversation } = req.body;
        if (typeof inConversation !== 'boolean') {
            res.status(400).json({ error: '需要 inConversation 参数 (boolean)' });
            return;
        }
        proactiveService.setConversationMode(inConversation);
        res.json({
            success: true,
            inConversation
        });
    } catch (error) {
        console.error('[主动服务] 设置对话模式失败:', error.message);
        res.status(500).json({ error: '设置对话模式失败' });
    }
});

// ============================================================
// 模块名称：互动记录
// 功能说明：记录用户互动，更新连续陪伴天数
// ============================================================

/**
 * @description 记录一次用户互动，更新连续陪伴天数（streak）
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和当前 streak 值
 */
router.post('/record', (req, res) => {
    try {
        proactiveService.recordInteraction();
        res.json({
            success: true,
            streak: proactiveService.getCurrentStreak()
        });
    } catch (error) {
        console.error('[主动服务] 记录互动失败:', error.message);
        res.status(500).json({ error: '记录互动失败' });
    }
});

module.exports = router;