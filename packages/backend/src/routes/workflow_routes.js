/**
 * @file workflow_routes.js
 * @description 统一任务管理路由模块，提供任务快速处理、异步执行、意图澄清、
 *              任务 CRUD、统计信息、服务状态查询、步骤输入收集、危险操作确认、
 *              任务恢复、SSE 进度流及队列管理等功能
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const taskOrchestrator = require('../services/task_orchestrator');
const taskQueue = require('../core/task-queue');
const llmService = require('../services/llm_service');
const { logger } = require('../utils/logger');
const intentClassifier = require('../services/intentClassifier');

const router = express.Router();

// 初始化任务队列
taskQueue.init();

// ============================================================
// 模块名称：快速处理端点
// 功能说明：简化版入口，闲聊走 Mimo，任务走编排器
// ============================================================

/** 意图分类置信度阈值：低于此值视为闲聊，直接走 Mimo */
const CHAT_CONFIDENCE_THRESHOLD = 0.8;

/** 任务列表最大返回条数，防止数据量过大 */
const MAX_TASK_LIST_SIZE = 50;

/**
 * @description 快速处理入口，使用激进分流策略：闲聊直接走 Mimo，任务走编排器
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.message - 用户消息内容
 * @param {string} [req.body.sessionId] - 会话 ID
 * @param {string} [req.body.personality='normal'] - 人格模式
 * @param {string} [req.body.dialect='mandarin'] - 方言设置
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、type（chat/task）、response、quick、elapsed
 */
router.post('/process', async (req, res) => {
    try {
        const { message, sessionId, personality, dialect } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                error: '请提供消息内容'
            });
        }

        const startTime = Date.now();

        // 1. 快速分类
        const classification = intentClassifier.classify(message);
        console.log(`[WorkFlow] 分类: ${classification.type} (confidence: ${classification.confidence})`);

        // 2. 根据类型分流
        let result;

        if (classification.type === 'chat' || classification.confidence < CHAT_CONFIDENCE_THRESHOLD) {
            // 闲聊模式 - 直接用Mimo回答，不走工具
            result = await llmService.generateReply(
                message,
                message,
                null,
                personality || 'normal',
                dialect || 'mandarin'
            );

            const elapsed = Date.now() - startTime;
            result = {
                success: true,
                type: 'chat',
                quick: true,
                response: result.content,
                emotion: result.emotion,
                elapsed
            };

        } else if (classification.type === 'task' || classification.type === 'complex') {
            // 工作模式 - 使用任务编排器
            const taskResult = await taskOrchestrator.execute(message, {
                sessionId: sessionId || req.sessionID || 'default'
            });

            const elapsed = Date.now() - startTime;
            result = {
                success: true,
                type: 'task',
                quick: false,
                taskId: taskResult.taskId,
                response: taskResult.response || JSON.stringify(taskResult),
                elapsed
            };
        }

        res.json(result || {
            success: false,
            error: '无法处理该请求'
        });

    } catch (error) {
        console.error('[WorkFlow API] 处理失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：统一执行端点
// 功能说明：异步/同步任务执行入口
// ============================================================

/**
 * @description 统一任务执行入口，支持异步和同步两种模式。
 *              异步模式立即返回 taskId，任务在后台执行；同步模式等待任务完成
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.description - 任务描述
 * @param {string} [req.body.engine='auto'] - 执行引擎：auto/workflow/scheduler
 * @param {string} [req.body.sessionId] - 会话 ID
 * @param {boolean} [req.body.async=true] - 是否异步执行
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，异步模式返回 taskId 和 status；同步模式返回完整执行结果
 */
router.post('/execute', async (req, res) => {
    try {
        const { description, engine, sessionId, async: asyncMode = true } = req.body;

        if (!description || !description.trim()) {
            return res.status(400).json({
                success: false,
                error: '请提供任务描述'
            });
        }

        // 异步模式：立即返回 taskId，后台执行
        if (asyncMode) {
            const taskId = taskQueue.submit(description.trim(), {
                sessionId: sessionId || req.sessionID,
                engine: engine === 'auto' ? null : engine
            });

            console.log(`[工作流路由] 任务已提交: ${taskId}`);

            return res.json({
                success: true,
                taskId,
                status: 'queued',
                message: '任务已提交，正在后台执行...'
            });
        }

        // 同步模式：等待任务完成（保持向后兼容）
        const result = await taskOrchestrator.execute(description.trim(), {
            forceEngine: engine === 'auto' ? null : engine,
            sessionId: sessionId || req.sessionID
        });

        res.json({
            success: result.status === 'completed',
            ...result
        });
    } catch (error) {
        logger.error('[工作流路由] 执行失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：意图澄清
// 功能说明：处理用户对澄清问题的回答
// ============================================================

/**
 * @description 处理用户对澄清问题的回答，推进任务执行
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.taskId - 任务 ID
 * @param {string} req.body.answer - 用户对澄清问题的回答
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含澄清处理结果
 */
router.post('/clarify', async (req, res) => {
    try {
        const { taskId, answer } = req.body;

        if (!taskId || !answer) {
            return res.status(400).json({
                success: false,
                error: '缺少 taskId 或 answer'
            });
        }

        const result = await taskOrchestrator.clarify(taskId, answer);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('[工作流路由] 澄清失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：任务管理
// 功能说明：任务列表查询、详情、删除、取消、重试
// ============================================================

/**
 * @description 获取任务列表，支持按状态过滤，返回分组后的任务数据
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.filter='all'] - 过滤条件：all/pending/running/completed/failed
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 filter、tasks、total、grouped
 */
router.get('/tasks', async (req, res) => {
    try {
        const filter = req.query.filter || 'all';
        const tasks = taskOrchestrator.getTasks(filter);

        // 按时间倒序
        tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        res.json({
            success: true,
            filter,
            tasks: tasks.slice(0, MAX_TASK_LIST_SIZE),
            total: tasks.length,
            grouped: taskOrchestrator.getTasksGrouped()
        });
    } catch (error) {
        logger.error('[工作流路由] 获取任务列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 获取单个任务的详细信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 task 对象
 */
router.get('/task/:id', async (req, res) => {
    try {
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
    } catch (error) {
        logger.error('[工作流路由] 获取任务详情失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 删除指定任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要删除的任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.delete('/task/:id', async (req, res) => {
    try {
        const result = taskOrchestrator.deleteTask(req.params.id);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({
            success: true,
            message: '任务已删除'
        });
    } catch (error) {
        logger.error('[工作流路由] 删除任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 取消正在执行的任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要取消的任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.post('/cancel/:id', async (req, res) => {
    try {
        const result = taskOrchestrator.cancelTask(req.params.id);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({
            success: true,
            message: '任务已取消'
        });
    } catch (error) {
        logger.error('[工作流路由] 取消任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 重新执行失败或已完成的任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要重试的任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和重试结果
 */
router.post('/retry/:id', async (req, res) => {
    try {
        const result = await taskOrchestrator.retryTask(req.params.id);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('[工作流路由] 重新执行失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：统计信息
// 功能说明：任务统计汇总
// ============================================================

/**
 * @description 获取任务统计信息，包含各状态任务数量等汇总数据
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和统计数据
 */
router.get('/stats', async (req, res) => {
    try {
        res.json({
            success: true,
            ...taskOrchestrator.getStats()
        });
    } catch (error) {
        logger.error('[工作流路由] 获取统计数据失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：服务状态
// 功能说明：LLM 各引擎在线状态和延迟
// ============================================================

/**
 * @description 获取服务健康状态，包括 LLM 各引擎在线状态和延迟
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 llm、orchestrator、timestamp
 */
router.get('/services', async (req, res) => {
    try {
        const health = await llmService.checkHealth();
        res.json({
            success: true,
            llm: {
                mimo: health.mimo?.available ? 'online' : 'offline',
                kimi: health.kimi?.available ? 'online' : 'offline',
                workbrain: health.workbrain?.available ? 'online' : 'offline',
                latency: {
                    mimo: health.mimo?.latency || null,
                    kimi: health.kimi?.latency || null,
                    workbrain: health.workbrain?.latency || null
                }
            },
            orchestrator: {
                status: 'online'
            },
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('[工作流路由] 获取服务状态失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：步骤输入收集
// 功能说明：提供任务步骤所需的输入数据
// ============================================================

/**
 * @description 提供任务步骤所需的输入数据，用于推进等待输入的任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.taskId - 任务 ID
 * @param {*} req.body.answer - 步骤所需的输入数据
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和处理结果
 */
router.post('/provide-input', async (req, res) => {
    try {
        const { taskId, answer } = req.body;

        if (!taskId || answer === undefined) {
            return res.status(400).json({
                success: false,
                error: '缺少 taskId 或 answer'
            });
        }

        const result = taskOrchestrator.provideInput(taskId, answer);

        res.json({
            success: result.success,
            ...result
        });
    } catch (error) {
        logger.error('[工作流路由] 输入提交失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：危险操作确认
// 功能说明：确认或拒绝任务中的高风险步骤
// ============================================================

/**
 * @description 确认或拒绝危险操作，用于任务执行中需要用户确认的高风险步骤
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.taskId - 任务 ID
 * @param {boolean} req.body.confirmed - 是否确认执行（true 确认，false 拒绝）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和处理结果
 */
router.post('/confirm-danger', async (req, res) => {
    try {
        const { taskId, confirmed } = req.body;

        if (!taskId || confirmed === undefined) {
            return res.status(400).json({
                success: false,
                error: '缺少 taskId 或 confirmed'
            });
        }

        const result = taskOrchestrator.confirmDanger(taskId, confirmed);

        res.json({
            success: result.success,
            ...result
        });
    } catch (error) {
        logger.error('[工作流路由] 危险操作确认失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：任务恢复
// 功能说明：获取可恢复任务、恢复中断任务
// ============================================================

/**
 * @description 获取可恢复的任务列表，即因异常中断但可继续执行的任务
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、tasks、timestamp
 */
router.get('/recoverable', async (req, res) => {
    try {
        const tasks = taskOrchestrator.getRecoverableTasks();

        res.json({
            success: true,
            tasks,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('[工作流路由] 获取可恢复任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 恢复中断的任务，从上次中断的步骤继续执行
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.taskId - 要恢复的任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、task、message
 */
router.post('/restore', async (req, res) => {
    try {
        const { taskId } = req.body;

        if (!taskId) {
            return res.status(400).json({
                success: false,
                error: '缺少 taskId'
            });
        }

        const result = await taskOrchestrator.restoreTask(taskId);

        if (!result) {
            return res.status(404).json({
                success: false,
                error: '找不到可恢复的任务'
            });
        }

        res.json({
            success: true,
            task: result,
            message: '任务已恢复执行'
        });
    } catch (error) {
        logger.error('[工作流路由] 恢复任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：SSE 进度流与队列管理
// 功能说明：实时任务进度推送、队列状态查询
// ============================================================

/** SSE 心跳保活间隔：30秒 */
const SSE_HEARTBEAT_INTERVAL_MS = 30000;

/**
 * @description SSE 流订阅接口，客户端可实时接收所有任务的进度事件。
 *              事件类型包括 task:progress（进度更新）和 task:complete（任务完成）
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象（SSE 流）
 * @returns {void} 通过 SSE 事件流持续推送任务进度
 */
router.get('/stream', (req, res) => {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 立即发送初始响应
    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now(), message: 'SSE连接已建立' })}\n\n`);

    // 订阅到任务队列
    taskQueue.subscribe(res);

    // 心跳保活
    const heartbeatInterval = setInterval(() => {
        try {
            res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
        } catch (e) {
            clearInterval(heartbeatInterval);
        }
    }, SSE_HEARTBEAT_INTERVAL_MS);

    // 清理
    req.on('close', () => {
        clearInterval(heartbeatInterval);
        taskQueue.unsubscribe(res);
        console.log('[工作流路由] SSE 连接关闭');
    });
});

/**
 * @description 获取任务队列状态，包含队列中各状态的任务数量统计
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和队列统计数据
 */
router.get('/queue/status', (req, res) => {
    res.json({
        success: true,
        ...taskQueue.getStats()
    });
});

/**
 * @description 获取队列中的任务列表，支持按状态过滤
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.filter='all'] - 过滤条件：all/pending/running/completed/failed
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、filter、tasks、total
 */
router.get('/queue/tasks', (req, res) => {
    const filter = req.query.filter || 'all';
    const tasks = taskQueue.getTasks(filter);

    res.json({
        success: true,
        filter,
        tasks,
        total: tasks.length
    });
});

module.exports = router;