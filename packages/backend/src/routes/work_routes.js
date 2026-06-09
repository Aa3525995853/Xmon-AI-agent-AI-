/**
 * @file work_routes.js
 * @description 工作 Agent API 路由 - 独立于聊天通道，用于执行任务
 * @module routes/work
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 *
 * 架构说明：
 * - 独立于 /api/chat，不阻塞闲聊通道
 * - 通过 WebSocket 推送实时日志到前端工作区
 * - 支持任务取消、状态查询
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** 任务描述日志截断长度，防止日志过长 */
const TASK_DESC_LOG_LEN = 50;

// ============================================================
// Work Agent 延迟加载
// ============================================================

/** work_agent 实例缓存 */
let _workAgent = null;
/** work_agent 加载错误缓存，避免重复尝试加载失败的模块 */
let _workAgentError = null;

/**
 * 获取 WorkAgent 实例（延迟加载）
 * 避免模块循环依赖，首次调用时才加载 work_agent 服务
 * @returns {object} WorkAgent 实例
 * @throws {Error} 当 work_agent 模块加载失败时抛出异常
 */
function getWorkAgent() {
    if (_workAgentError) {
        throw _workAgentError;
    }
    if (!_workAgent) {
        try {
            _workAgent = require('../services/work_agent');
            logger.info('[Work Routes] work_agent 加载成功');
        } catch (err) {
            _workAgentError = err;
            logger.error('[Work Routes] work_agent 加载失败:', err);
            throw err;
        }
    }
    return _workAgent;
}

// ============================================================
// API 路由定义
// ============================================================

/**
 * 执行工作任务
 * POST /api/work
 *
 * Body: {
 *   task: string,        // 任务描述
 *   context?: object     // 额外上下文
 * }
 *
 * Response: {
 *   success: boolean,
 *   taskId: string,
 *   status: 'queued' | 'running'
 * }
 *
 * WebSocket 推送:
 * - work:log - 实时日志
 * - task:queued - 任务排队
 * - task:started - 任务开始
 * - task:step_progress - 步骤进度
 * - task:completed - 任务完成
 * - task:failed - 任务失败
 */
router.post('/', async (req, res) => {
    const { task, context = {} } = req.body;

    if (!task || typeof task !== 'string') {
        return res.status(400).json({
            success: false,
            error: '缺少 task 参数或格式错误'
        });
    }

    logger.info(`[Work Routes] 收到工作请求: ${task.substring(0, TASK_DESC_LOG_LEN)}`);

    try {
        const workAgent = getWorkAgent();
        const result = await workAgent.executeTask(task, context);

        logger.info(`[Work Routes] 任务已提交: ${result.taskId}`);

        res.json({
            success: true,
            taskId: result.taskId,
            status: result.status
        });
    } catch (error) {
        logger.error('[Work Routes] 任务执行失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 获取任务状态
 * GET /api/work/:taskId
 *
 * @param {string} req.params.taskId - 任务ID
 * @returns {object} 任务状态信息，包含 success、id、description、status 等字段
 * @throws {Error} 当 work_agent 不可用或查询失败时返回 500
 */
router.get('/:taskId', async (req, res) => {
    const { taskId } = req.params;

    try {
        const workAgent = getWorkAgent();
        const status = workAgent.getTaskStatus(taskId);

        if (!status) {
            return res.status(404).json({
                success: false,
                error: '任务不存在'
            });
        }

        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 取消任务
 * DELETE /api/work/:taskId
 *
 * @param {string} req.params.taskId - 任务ID
 * @returns {object} 取消结果，包含 success 和 taskId 字段
 * @throws {Error} 当 work_agent 不可用或取消失败时返回 500
 */
router.delete('/:taskId', async (req, res) => {
    const { taskId } = req.params;

    try {
        const workAgent = getWorkAgent();
        const result = await workAgent.cancelTask(taskId);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 获取所有任务
 * GET /api/work
 *
 * @returns {object} 任务列表，包含 success、tasks 数组和 count 字段
 * @throws {Error} 当 work_agent 不可用或查询失败时返回 500
 */
router.get('/', async (req, res) => {
    try {
        const workAgent = getWorkAgent();
        const tasks = workAgent.getAllTasks();

        res.json({
            success: true,
            tasks,
            count: tasks.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;