/**
 * @file taskRoutes.js
 * @description 任务执行路由模块（精简版），提供快速任务执行、中断、意图检测、
 *              任务列表/统计/分组/详情/删除/重试/清空/创建等 API 接口。
 *              状态查询统一由 workflow 路由管理。
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const llmService = require('../services/llm_service');
const taskScheduler = require('../core/task-scheduler');
const workBrainClient = require('../services/workBrainClient');
const { logger } = require('../utils/logger');

/** 任务列表最大返回条数 */
const MAX_TASK_LIST_SIZE = 50;

// ============================================================
// 模块名称：任务执行
// 功能说明：快速任务执行入口（LLM 识别）
// ============================================================

/**
 * @description 快速任务执行，通过 LLM 识别用户消息并执行对应任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.message - 用户消息内容
 * @param {string} [req.body.personality='normal'] - 人格模式
 * @param {string} [req.body.dialect] - 方言设置
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 task 结果
 */
router.post('/execute', async (req, res) => {
    try {
        const { message, personality, dialect } = req.body;
        console.log('[DEBUG] 收到请求:', { message, personality, dialect });
        if (!message) {
            return res.status(400).json({ success: false, error: '缺少 message 参数' });
        }

        const result = await llmService.executeTask(message, personality || 'normal', dialect || null);
        console.log('[DEBUG] executeTask 结果:', JSON.stringify(result));

        if (!result) {
            return res.json({
                success: false,
                reason: 'not_a_task',
                message: '该输入不属于工作指令，已走闲聊路由'
            });
        }

        res.json({ success: true, task: result });
    } catch (error) {
        logger.error('[任务路由] 执行失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：任务控制
// 功能说明：中断任务、任务插队、取消任务
// ============================================================

/**
 * @description 中断当前正在执行的任务
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.post('/abort', async (req, res) => {
    try {
        await workBrainClient.abort();
        res.json({ success: true, message: '任务已中断' });
    } catch (error) {
        logger.error('[任务路由] 中断失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 将指定任务插入队列头部（优先执行）
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.taskId - 要插队的任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 taskId
 */
router.post('/prioritize', (req, res) => {
    try {
        const { taskId } = req.body;
        if (!taskId) {
            return res.status(400).json({ success: false, error: '缺少 taskId 参数' });
        }
        const ok = llmService.prioritizeTask(taskId);
        if (!ok) {
            return res.status(404).json({ success: false, error: '任务未找到' });
        }
        res.json({ success: true, taskId });
    } catch (error) {
        logger.error('[任务路由] 插队失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 取消指定任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.taskId - 要取消的任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 taskId
 */
router.post('/cancel', (req, res) => {
    try {
        const { taskId } = req.body;
        if (!taskId) {
            return res.status(400).json({ success: false, error: '缺少 taskId 参数' });
        }
        const ok = llmService.cancelTask(taskId);
        if (!ok) {
            return res.status(404).json({ success: false, error: '任务未找到' });
        }
        res.json({ success: true, taskId });
    } catch (error) {
        logger.error('[任务路由] 取消失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：状态查询（代理到 workflow 路由）
// 功能说明：任务状态查询
// ============================================================

/**
 * @description 查询任务状态（代理到 workflow）
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.taskId] - 任务 ID，不传则返回全部状态
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和状态信息
 */
router.get('/status', (req, res) => {
    try {
        const { taskId } = req.query;
        const status = llmService.getTaskStatus(taskId || null);
        res.json({ success: true, ...status });
    } catch (error) {
        logger.error('[任务路由] 状态查询失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：辅助功能
// 功能说明：意图检测、工作大脑状态查询
// ============================================================

/**
 * @description 意图检测，分析文本是否属于任务指令
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.text - 待检测的文本
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 intent 结果
 */
router.get('/intent', (req, res) => {
    try {
        const { text } = req.query;
        if (!text) {
            return res.status(400).json({ success: false, error: '缺少 text 参数' });
        }
        const intent = llmService.detectIntent(text);
        res.json({ success: true, intent });
    } catch (error) {
        logger.error('[任务路由] 意图识别失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 获取工作大脑（Coding Agent）的当前状态
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和工作大脑状态
 */
router.get('/workbrain', (req, res) => {
    try {
        const status = llmService.getWorkBrainStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        logger.error('[任务路由] 工作大脑状态查询失败', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：队列管理（代理到 workflow）
// 功能说明：任务列表、统计、分组、详情、删除、重试、清空、创建
// ============================================================

/**
 * @description 获取任务列表（代理到 workflow），支持按状态过滤
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.filter='all'] - 过滤条件
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 filter、tasks、total
 */
router.get('/list', (req, res) => {
    try {
        const taskOrchestrator = require('../services/task_orchestrator');
        const filter = req.query.filter || 'all';
        const tasks = taskOrchestrator.getTasks(filter);
        tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        res.json({
            success: true,
            filter,
            tasks: tasks.slice(0, MAX_TASK_LIST_SIZE),
            total: tasks.length
        });
    } catch (error) {
        console.error('[TaskRoutes] /list 错误:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
});

/**
 * @description 获取任务统计信息（代理到 workflow）
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和统计数据
 */
router.get('/stats', (req, res) => {
    try {
        const taskOrchestrator = require('../services/task_orchestrator');
        res.json({
            success: true,
            ...taskOrchestrator.getStats()
        });
    } catch (error) {
        console.error('[TaskRoutes] /stats 错误:', error.message, error.stack);
        res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
});

/**
 * @description 获取分组任务列表（含步骤详情）
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 all、running、completed、failed、queued 分组及 stats
 */
router.get('/grouped', (req, res) => {
    try {
        const taskOrchestrator = require('../services/task_orchestrator');
        const grouped = taskOrchestrator.getTasksGrouped();

        res.json({
            success: true,
            all: grouped.all,
            running: grouped.running,
            completed: grouped.completed,
            failed: grouped.failed,
            queued: grouped.queued,
            stats: taskOrchestrator.getStats()
        });
    } catch (error) {
        console.error('[TaskRoutes] /grouped 错误:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

/**
 * @description 获取指定任务的详细信息（含执行步骤）
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 task 对象
 */
router.get('/detail/:id', (req, res) => {
    const taskOrchestrator = require('../services/task_orchestrator');
    const task = taskOrchestrator.getTaskById(req.params.id);

    if (!task) {
        return res.status(404).json({
            success: false,
            error: '任务不存在'
        });
    }

    res.json({
        success: true,
        task
    });
});

/**
 * @description 删除指定任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要删除的任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.delete('/:id', (req, res) => {
    const taskOrchestrator = require('../services/task_orchestrator');
    const result = taskOrchestrator.deleteTask(req.params.id);

    if (!result.success) {
        return res.status(400).json(result);
    }

    res.json({
        success: true,
        message: '任务已删除'
    });
});

/**
 * @description 重试指定任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要重试的任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和重试结果
 */
router.post('/:id/retry', async (req, res) => {
    const taskOrchestrator = require('../services/task_orchestrator');
    const result = await taskOrchestrator.retryTask(req.params.id);

    res.json({
        success: true,
        ...result
    });
});

/**
 * @description 清空已完成和失败的历史任务
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、message、cleared 数量
 */
router.post('/clear', (req, res) => {
    const taskOrchestrator = require('../services/task_orchestrator');

    // 清理已完成和失败的任务
    const tasks = taskOrchestrator.tasks;
    let cleared = 0;
    for (const [taskId, task] of tasks) {
        if (task.status === 'completed' || task.status === 'failed') {
            tasks.delete(taskId);
            cleared++;
        }
    }

    res.json({
        success: true,
        message: `已清空 ${cleared} 个历史任务`,
        cleared
    });
});

/**
 * @description 创建新任务，支持异步和同步两种模式
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.command - 任务命令
 * @param {string} [req.body.type] - 任务类型
 * @param {string} [req.body.priority] - 任务优先级
 * @param {boolean} [req.body.async=true] - 是否异步执行
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，异步模式返回 taskId；同步模式返回完整结果
 */
router.post('/create', async (req, res) => {
    const taskOrchestrator = require('../services/task_orchestrator');
    const taskQueue = require('../core/task-queue');
    const { command, type, priority, async: asyncMode = true } = req.body;

    if (!command || !command.trim()) {
        return res.status(400).json({
            success: false,
            error: '请提供任务命令'
        });
    }

    // 异步模式：立即返回 taskId
    if (asyncMode) {
        const taskId = taskQueue.submit(command.trim(), {
            sessionId: req.sessionID,
            type,
            priority
        });

        return res.json({
            success: true,
            taskId,
            status: 'queued',
            message: '任务已提交，正在后台执行...'
        });
    }

    // 同步模式
    const result = await taskOrchestrator.execute(command.trim(), {
        sessionId: req.sessionID
    });

    res.json({
        success: true,
        taskId: result.taskId,
        message: '任务已提交',
        engine: result.engine
    });
});

module.exports = router;