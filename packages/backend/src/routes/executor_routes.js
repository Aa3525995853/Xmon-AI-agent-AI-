/**
 * @file executor_routes.js
 * @description 执行引擎 API 路由，提供统一的任务执行入口，包括任务执行/取消/状态查询、
 *              意图理解与消歧、知识管理、任务规划与计划执行等功能
 * @module routes/executor_routes
 * @author 小梦团队
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();

/** 知识查询默认最大返回条数 */
const DEFAULT_KNOWLEDGE_MAX_RESULTS = 5;

let _executor = null;

/**
 * @description 延迟加载执行器实例，避免循环依赖
 * @returns {Object} executor 实例
 */
function getExecutor() {
    if (!_executor) {
        _executor = require('../services/executor');
    }
    return _executor;
}

// ============================================================
// 模块名称：任务执行 API
// 功能说明：任务执行、工具调用、任务取消及状态查询
// ============================================================

/**
 * @description 执行任务，支持自然语言输入或结构化输入
 * @param {Object} req - Express 请求对象
 * @param {string|Object} req.body.input - 任务输入（自然语言或结构化对象）
 * @param {Object} [req.body.options={}] - 执行选项
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...result }
 * @throws {400} 缺少 input 参数
 * @throws {500} 执行失败
 */
router.post('/execute', async (req, res) => {
    const { input, options = {} } = req.body;

    if (!input) {
        return res.status(400).json({
            success: false,
            error: '缺少 input 参数'
        });
    }

    try {
        const executor = getExecutor();
        const result = await executor.execute(input, options);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('[Executor Routes] 执行失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 执行单个工具调用
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.action - 工具/动作名称（必填）
 * @param {Object} [req.body.params] - 工具参数
 * @param {Object} [req.body.context={}] - 执行上下文
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, result: Object }
 * @throws {400} 缺少 action 参数
 * @throws {500} 执行失败
 */
router.post('/tool', async (req, res) => {
    const { action, params, context = {} } = req.body;

    if (!action) {
        return res.status(400).json({
            success: false,
            error: '缺少 action 参数'
        });
    }

    try {
        const executor = getExecutor();
        const result = await executor.executeTask(action, params, context);

        res.json({
            success: true,
            result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 取消正在执行的任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.taskId - 任务ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} 取消结果
 * @throws {500} 取消失败
 */
router.delete('/task/:taskId', async (req, res) => {
    const { taskId } = req.params;

    try {
        const executor = getExecutor();
        const result = await executor.cancel(taskId);

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取指定任务的执行状态
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.taskId - 任务ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, status: Object }
 * @throws {500} 获取状态失败
 */
router.get('/task/:taskId', async (req, res) => {
    const { taskId } = req.params;

    try {
        const executor = getExecutor();
        const status = executor.getTaskStatus(taskId);

        res.json({
            success: true,
            status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：意图理解与消歧 API
// 功能说明：意图理解、消歧响应处理
// ============================================================

/**
 * @description 理解用户意图，返回解析后的意图结构
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.text - 用户输入文本（必填）
 * @param {Object} [req.body.options={}] - 解析选项
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...result }
 * @throws {400} 缺少 text 参数
 * @throws {500} 理解失败
 */
router.post('/intent', async (req, res) => {
    const { text, options = {} } = req.body;

    if (!text) {
        return res.status(400).json({
            success: false,
            error: '缺少 text 参数'
        });
    }

    try {
        const intentCore = require('../services/intent_core');
        const result = await intentCore.understand(text, options);

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
 * @description 对消歧问题进行回答，推进任务执行
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.taskId - 需要消歧的任务ID
 * @param {string} req.body.answer - 用户的消歧回答
 * @param {Object} [req.body.options={}] - 附加选项
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...result }
 * @throws {500} 消歧失败
 */
router.post('/clarify/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const { answer, options = {} } = req.body;

    try {
        const executor = getExecutor();
        const result = await executor.respondToClarification(taskId, answer, options);

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

// ============================================================
// 模块名称：知识管理 API
// 功能说明：知识查询、用户画像的获取与更新
// ============================================================

/**
 * @description 查询知识库，返回匹配的知识条目
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.q - 查询关键词（必填）
 * @param {string} [req.query.type] - 知识类型筛选
 * @param {string|number} [req.query.maxResults=5] - 最大返回条数
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...result }
 * @throws {400} 缺少查询参数 q
 * @throws {500} 查询失败
 */
router.get('/knowledge', async (req, res) => {
    const { q, type, maxResults = DEFAULT_KNOWLEDGE_MAX_RESULTS } = req.query;

    if (!q) {
        return res.status(400).json({
            success: false,
            error: '缺少查询参数 q'
        });
    }

    try {
        const knowledge = require('../services/knowledge');
        const result = knowledge.retrieve(q, { type, maxResults: parseInt(maxResults) });

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
 * @description 更新用户画像信息
 * @param {Object} req - Express 请求对象
 * @param {Object} req.body - 画像更新字段键值对
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, profile: Object }
 * @throws {500} 更新失败
 */
router.put('/knowledge/profile', async (req, res) => {
    const updates = req.body;

    try {
        const knowledge = require('../services/knowledge');
        const profile = knowledge.updateProfile(updates);

        res.json({
            success: true,
            profile
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取当前用户画像信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, profile: Object }
 * @throws {500} 获取失败
 */
router.get('/knowledge/profile', async (req, res) => {
    try {
        const knowledge = require('../services/knowledge');
        const profile = knowledge.getProfile();

        res.json({
            success: true,
            profile
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：任务规划 API
// 功能说明：任务规划、计划执行/暂停/恢复
// ============================================================

/**
 * @description 根据目标生成任务执行计划
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.goal - 任务目标（必填）
 * @param {Object} [req.body.context={}] - 规划上下文
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, plan: Object }
 * @throws {400} 缺少 goal 参数
 * @throws {500} 规划失败
 */
router.post('/plan', async (req, res) => {
    const { goal, context = {} } = req.body;

    if (!goal) {
        return res.status(400).json({
            success: false,
            error: '缺少 goal 参数'
        });
    }

    try {
        const planner = require('../services/planner');
        const plan = await planner.plan(goal, context);

        res.json({
            success: true,
            plan
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 执行已生成的计划，通过 forcePlan 标记强制按计划执行
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.planId - 计划ID
 * @param {Object} [req.body.options={}] - 执行选项
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...result }
 * @throws {404} 计划不存在或已过期
 * @throws {500} 执行失败
 */
router.post('/plan/:planId/execute', async (req, res) => {
    const { planId } = req.params;
    const { options = {} } = req.body;

    try {
        const planner = require('../services/planner');

        // 重新获取计划
        const plan = planner.getCurrentPlan();
        if (!plan || plan.id !== planId) {
            return res.status(404).json({
                success: false,
                error: '计划不存在或已过期'
            });
        }

        const executor = getExecutor();
        const result = await executor.execute(plan, {
            ...options,
            forcePlan: true
        });

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
 * @description 暂停正在执行的计划
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.planId - 计划ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} 暂停结果
 * @throws {500} 暂停失败
 */
router.post('/plan/:planId/pause', async (req, res) => {
    const { planId } = req.params;

    try {
        const planner = require('../services/planner');
        const result = await planner.pause(planId);

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 恢复已暂停的计划
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.planId - 计划ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} 恢复结果
 * @throws {500} 恢复失败
 */
router.post('/plan/:planId/resume', async (req, res) => {
    const { planId } = req.params;

    try {
        const planner = require('../services/planner');
        const result = await planner.resume(planId);

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：统计 API
// 功能说明：执行统计与知识统计查询
// ============================================================

/**
 * @description 获取执行引擎的统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, stats: Object }
 * @throws {500} 获取统计失败
 */
router.get('/stats', async (req, res) => {
    try {
        const executor = getExecutor();
        const stats = executor.getStats();

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取知识库的统计信息，包括知识条目统计和图谱统计
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, stats: Object, graphStats: Object }
 * @throws {500} 获取统计失败
 */
router.get('/knowledge/stats', async (req, res) => {
    try {
        const knowledge = require('../services/knowledge');

        res.json({
            success: true,
            stats: knowledge.getStats(),
            graphStats: knowledge.getGraphStats()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;