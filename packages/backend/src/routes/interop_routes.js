/**
 * @file interop_routes.js
 * @description 跨设备互操作路由模块，提供设备发现、任务分发、聊天/情绪同步、
 *              PC 端状态查询及通知推送等 API 接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const wsService = require('../services/websocketService');
const taskScheduler = require('../core/task-scheduler');

// ============================================================
// 模块名称：设备发现
// 功能说明：查询在线设备列表
// ============================================================

/**
 * @description 获取所有在线设备列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 devices 数组
 */
router.get('/devices', (req, res) => {
    const devices = wsService.getOnlineDevices();
    res.json({ devices });
});

/**
 * @description 获取指定用户的在线设备列表
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.userId - 用户 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 userId 和 devices
 */
router.get('/devices/:userId', (req, res) => {
    const { userId } = req.params;
    const devices = wsService.getOnlineDevices(userId);
    res.json({ userId, devices });
});

// ============================================================
// 模块名称：任务分发与数据同步
// 功能说明：任务分发、聊天同步、情绪同步
// ============================================================

/**
 * @description 向 PC 端分发任务，需 PC 端在线
 * @param {Object} req - Express 请求对象
 * @param {Object} req.body.task - 任务对象，须包含 command 字段
 * @param {string} [req.body.userId='legacy'] - 目标用户 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.post('/dispatch', (req, res) => {
    const { task, userId = 'legacy' } = req.body;
    if (!task || !task.command) {
        return res.status(400).json({ error: '缺少 task.command' });
    }

    const devices = wsService.connectedDevices.get(userId);
    if (!devices || !devices.pc) {
        return res.status(503).json({ error: 'PC端不在线', onlineDevices: devices ? Object.keys(devices) : [] });
    }

    wsService.emitToClient(devices.pc, 'task:dispatch', {
        task,
        from: 'api',
        timestamp: Date.now()
    });

    res.json({ success: true, message: '任务已发送到PC端', targetDevice: 'pc' });
});

/**
 * @description 同步聊天消息到指定用户的所有设备
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.role - 消息角色（user/assistant）
 * @param {string} req.body.content - 消息内容
 * @param {string} [req.body.userId='legacy'] - 目标用户 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success: true
 */
router.post('/chat/sync', (req, res) => {
    const { role, content, userId = 'legacy' } = req.body;
    if (!role || !content) {
        return res.status(400).json({ error: '缺少 role 或 content' });
    }

    wsService.emitToUser(userId, 'chat:sync', {
        role,
        content,
        from: 'api',
        timestamp: Date.now()
    });

    res.json({ success: true });
});

/**
 * @description 同步情绪状态到指定用户的所有设备
 * @param {Object} req - Express 请求对象
 * @param {string} [req.body.emotion] - 情绪标签
 * @param {string} [req.body.expression] - 表情标识
 * @param {string} [req.body.userId='legacy'] - 目标用户 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success: true
 */
router.post('/emotion/sync', (req, res) => {
    const { emotion, expression, userId = 'legacy' } = req.body;
    if (!emotion && !expression) {
        return res.status(400).json({ error: '缺少 emotion 或 expression' });
    }

    wsService.emitToUser(userId, 'emotion:sync', {
        emotion,
        expression,
        from: 'api',
        timestamp: Date.now()
    });

    res.json({ success: true });
});

// ============================================================
// 模块名称：状态查询与通知
// 功能说明：PC 端状态查询、通知推送
// ============================================================

/**
 * @description 获取 PC 端在线状态、当前任务和工作大脑可用性
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.userId='legacy'] - 用户 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 pcOnline、activeTask、queueLength、workbrainAvailable
 */
router.get('/pc/status', (req, res) => {
    const { userId = 'legacy' } = req.query;
    const devices = wsService.connectedDevices.get(userId);
    const pcOnline = !!(devices && devices.pc);

    const queueStatus = taskScheduler.getQueueStatus();

    res.json({
        pcOnline,
        onlineDevices: devices ? Object.keys(devices) : [],
        activeTask: queueStatus.currentTask || null,
        queueLength: queueStatus.queueLength || 0,
        workbrainAvailable: require('../services/workBrainClient')._available
    });
});

/**
 * @description 向指定用户或设备推送通知
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.title - 通知标题
 * @param {string} [req.body.body] - 通知正文
 * @param {string} [req.body.userId='legacy'] - 目标用户 ID
 * @param {string} [req.body.targetDevice] - 目标设备标识（不传则推送给用户所有设备）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success: true
 */
router.post('/notify', (req, res) => {
    const { title, body, userId = 'legacy', targetDevice } = req.body;
    if (!title) {
        return res.status(400).json({ error: '缺少 title' });
    }

    const notification = { title, body, timestamp: Date.now() };

    if (targetDevice) {
        const devices = wsService.connectedDevices.get(userId);
        if (devices && devices[targetDevice]) {
            wsService.emitToClient(devices[targetDevice], 'notification', notification);
        } else {
            return res.status(503).json({ error: `目标设备 ${targetDevice} 不在线` });
        }
    } else {
        wsService.emitToUser(userId, 'notification', notification);
    }

    res.json({ success: true });
});

module.exports = router;
