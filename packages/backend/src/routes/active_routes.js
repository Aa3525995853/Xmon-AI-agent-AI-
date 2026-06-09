/**
 * @file active_routes.js
 * @description 主动执行路由（v3.0），提供定时任务管理（自然语言/结构化创建）、
 *              条件触发器、预判建议、上下文更新、执行历史及服务开关等功能
 * @module routes/active_routes
 * @author 小梦团队
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const activeExecutionService = require('../services/active_execution_service');

/** 执行历史默认查询条数 */
const DEFAULT_HISTORY_LIMIT = 20;

// ============================================================
// 模块名称：服务状态与定时任务 API
// 功能说明：服务状态查询、定时任务的创建/删除/启禁用
// ============================================================

/**
 * @description 获取主动执行服务的当前状态
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...status }
 * @throws {500} 获取状态失败
 */
router.get('/status', (req, res) => {
    try {
        const status = activeExecutionService.getStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 通过自然语言创建定时任务，如"每天早上8点提醒我喝水"
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.text - 自然语言任务描述（必填）
 * @param {Object} res - Express 响应对象
 * @returns {Object} 任务创建结果
 * @throws {400} 缺少任务描述
 * @throws {500} 创建失败
 */
router.post('/task/from-text', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ success: false, error: '请提供任务描述' });
        }

        const result = activeExecutionService.createTaskFromNaturalLanguage(text);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 通过结构化参数创建定时任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.name - 任务名称
 * @param {string} req.body.schedule - Cron 表达式（如 "0 8 * * *"）
 * @param {string} req.body.action - 执行动作类型
 * @param {Object} [req.body.params] - 动作参数
 * @param {boolean} [req.body.autoExecute=false] - 是否自动执行（无需确认）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, taskId: string, message: string }
 * @throws {500} 创建失败
 */
router.post('/task', async (req, res) => {
    try {
        const task = req.body;
        const taskId = activeExecutionService.createTask(task);
        res.json({
            success: true,
            taskId,
            message: '任务创建成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 获取所有定时任务列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, count: number, tasks: Array }
 * @throws {500} 获取失败
 */
router.get('/tasks', (req, res) => {
    try {
        const tasks = activeExecutionService.getTasks();
        res.json({
            success: true,
            count: tasks.length,
            tasks
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 删除指定定时任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.taskId - 任务ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} 删除结果
 * @throws {500} 删除失败
 */
router.delete('/task/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;
        const result = activeExecutionService.deleteTask(taskId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 启用或禁用指定定时任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.taskId - 任务ID
 * @param {boolean} req.body.enabled - 是否启用
 * @param {Object} res - Express 响应对象
 * @returns {Object} 切换结果
 * @throws {500} 操作失败
 */
router.post('/task/:taskId/toggle', (req, res) => {
    try {
        const { taskId } = req.params;
        const { enabled } = req.body;
        const result = activeExecutionService.toggleTask(taskId, enabled);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：条件触发器 API
// 功能说明：创建条件触发器及检查触发器执行
// ============================================================

/**
 * @description 创建条件触发器，当满足条件时自动执行指定动作
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.name - 触发器名称
 * @param {string} req.body.condition - 条件类型（如 emotion、keyword、milestone）
 * @param {Object} [req.body.conditionParams] - 条件参数
 * @param {string} req.body.action - 触发后执行的动作
 * @param {Object} [req.body.actionParams] - 动作参数
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, triggerId: string, message: string }
 * @throws {500} 创建失败
 */
router.post('/trigger', async (req, res) => {
    try {
        const config = req.body;
        const triggerId = activeExecutionService.createTrigger(config);
        res.json({
            success: true,
            triggerId,
            message: '触发器创建成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 检查并执行满足条件的触发器，返回被触发的触发器列表
 * @param {Object} req - Express 请求对象
 * @param {Object} req.body.context - 当前上下文（如 { emotion: "sad" }）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, triggeredCount: number, triggered: Array }
 * @throws {500} 检查失败
 */
router.post('/trigger/check', async (req, res) => {
    try {
        const { context } = req.body;
        const triggered = await activeExecutionService.checkAndExecuteTriggers(context);
        res.json({
            success: true,
            triggeredCount: triggered.length,
            triggered
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：预判与上下文 API
// 功能说明：预判建议获取、上下文更新、执行历史及服务开关
// ============================================================

/**
 * @description 获取基于时间和行为的预判建议
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, count: number, predictions: Array }
 * @throws {500} 获取失败
 */
router.get('/predictions', (req, res) => {
    try {
        const predictions = activeExecutionService.getPredictions();
        res.json({
            success: true,
            count: predictions.length,
            predictions
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 更新主动执行服务的上下文信息，用于预判和触发器判断
 * @param {Object} req - Express 请求对象
 * @param {Object} req.body - 上下文字段（如 lastInteractionTime、emotion）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean }
 * @throws {500} 更新失败
 */
router.post('/context', (req, res) => {
    try {
        activeExecutionService.updateContext(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 获取执行历史记录
 * @param {Object} req - Express 请求对象
 * @param {string|number} [req.query.limit=20] - 返回条数限制
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, count: number, history: Array }
 * @throws {500} 获取失败
 */
router.get('/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || DEFAULT_HISTORY_LIMIT;
        const history = activeExecutionService.getHistory(limit);
        res.json({
            success: true,
            count: history.length,
            history
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 启用或禁用主动执行服务
 * @param {Object} req - Express 请求对象
 * @param {boolean} req.body.enabled - 是否启用
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, enabled: boolean }
 * @throws {500} 操作失败
 */
router.post('/toggle', (req, res) => {
    try {
        const { enabled } = req.body;
        activeExecutionService.setEnabled(enabled);
        res.json({ success: true, enabled });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;