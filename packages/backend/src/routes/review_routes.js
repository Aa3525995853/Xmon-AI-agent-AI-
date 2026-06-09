/**
 * @file review_routes.js
 * @description 审核中枢路由模块，提供审核管理的 API 接口，包括待审核列表、审核详情、
 *              历史记录、统计、审核响应、快速操作、取消审核、自动通过规则等
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const reviewHub = require('../services/review_hub');

/** 审核历史默认返回条数 */
const DEFAULT_HISTORY_LIMIT = 50;

/** 审核场景标签映射，用于将场景标识转为中文描述 */
const SCENE_LABELS = {
    plan_review: '规划审核',
    result_review: '结果审核',
    action_review: '操作审核',
    recover_review: '恢复审核',
    continue_review: '继续审核',
    delivery_review: '交付审核'
};

// ============================================================
// 模块名称：审核管理
// 功能说明：待审核列表、审核详情、历史记录、统计
// ============================================================

/**
 * @description 获取待审核列表，支持按场景、任务ID、风险等级过滤
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.scene] - 审核场景过滤
 * @param {string} [req.query.taskId] - 任务 ID 过滤
 * @param {string} [req.query.riskLevel] - 风险等级过滤
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 count 和 reviews 数组
 */
router.get('/pending', (req, res) => {
    const { scene, taskId, riskLevel } = req.query;

    const filter = {};
    if (scene) filter.scene = scene;
    if (taskId) filter.taskId = taskId;
    if (riskLevel) filter.riskLevel = riskLevel;

    const reviews = reviewHub.getPendingReviews(filter);

    res.json({
        success: true,
        count: reviews.length,
        reviews
    });
});

/**
 * @description 获取单个审核的详细信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.reviewId - 审核 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 review 对象
 */
router.get('/:reviewId', (req, res) => {
    const review = reviewHub.getReview(req.params.reviewId);

    if (!review) {
        return res.status(404).json({
            success: false,
            error: '审核不存在'
        });
    }

    res.json({
        success: true,
        review
    });
});

/**
 * @description 获取审核历史记录
 * @param {Object} req - Express 请求对象
 * @param {number} [req.query.limit=50] - 返回条数上限
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 count 和 history 数组
 */
router.get('/history/list', (req, res) => {
    const limit = parseInt(req.query.limit) || DEFAULT_HISTORY_LIMIT;
    const history = reviewHub.getReviewHistory(limit);

    res.json({
        success: true,
        count: history.length,
        history
    });
});

/**
 * @description 获取审核统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 stats 对象
 */
router.get('/stats/summary', (req, res) => {
    res.json({
        success: true,
        stats: reviewHub.getStats()
    });
});

// ============================================================
// 模块名称：审核响应
// 功能说明：审核通过/拒绝/修改、快速操作、取消审核
// ============================================================

/**
 * @description 响应审核，支持 approve/reject/modify 等操作
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.reviewId - 审核 ID
 * @param {string} req.body.action - 操作类型：approve/reject/modify 等
 * @param {Object} [req.body.data] - 额外数据
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和审核结果
 */
router.post('/:reviewId/respond', async (req, res) => {
    const { reviewId } = req.params;
    const { action, data } = req.body;

    if (!action) {
        return res.status(400).json({
            success: false,
            error: '缺少 action 参数'
        });
    }

    const result = await reviewHub.respond(reviewId, {
        action,
        ...data
    }, {
        userId: req.headers['x-user-id']
    });

    if (!result.success) {
        return res.status(400).json(result);
    }

    res.json({
        success: true,
        ...result,
        message: `审核已${result.status === 'approved' ? '通过' : '拒绝'}`,
        data: {
            reviewId,
            status: result.status,
            action: result.action
        }
    });
});

/**
 * @description 快速响应审核（简化版），支持 approve/confirm/reject/cancel 操作
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.reviewId - 审核 ID
 * @param {string} req.params.quickAction - 快速操作：approve/confirm/reject/cancel
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和审核结果
 */
router.post('/:reviewId/:quickAction', async (req, res) => {
    const { reviewId, quickAction } = req.params;

    const actionMap = {
        'approve': 'approved',
        'confirm': 'confirmed',
        'reject': 'rejected',
        'cancel': 'cancelled'
    };

    const action = actionMap[quickAction];
    if (!action) {
        return res.status(400).json({
            success: false,
            error: '无效的快速操作'
        });
    }

    const result = await reviewHub.respond(reviewId, {
        action: quickAction,
        type: 'quick'
    }, {
        userId: req.headers['x-user-id']
    });

    res.json({
        success: result.success,
        ...result
    });
});

/**
 * @description 取消指定审核
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.reviewId - 要取消的审核 ID
 * @param {string} [req.body.reason] - 取消原因
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和取消结果
 */
router.delete('/:reviewId', (req, res) => {
    const result = reviewHub.cancelReview(req.params.reviewId, req.body.reason);

    res.json({
        success: result.success,
        ...result
    });
});

// ============================================================
// 模块名称：审核规则与任务关联
// 功能说明：自动通过规则、任务待审核查询、待审核计数
// ============================================================

/**
 * @description 添加自动通过规则，匹配指定模式的审核将自动通过
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.pattern - 正则表达式模式
 * @param {string} req.body.reason - 自动通过的原因说明
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.post('/rules/auto-approve', (req, res) => {
    const { pattern, reason } = req.body;

    if (!pattern || !reason) {
        return res.status(400).json({
            success: false,
            error: '缺少 pattern 或 reason 参数'
        });
    }

    reviewHub.addAutoApproveRule(
        (text) => new RegExp(pattern, 'i').test(text),
        reason
    );

    res.json({
        success: true,
        message: '规则已添加'
    });
});

/**
 * @description 获取指定任务的所有待审核项
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.taskId - 任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 count 和 reviews 数组
 */
router.get('/task/:taskId', (req, res) => {
    const reviews = reviewHub.getPendingForTask(req.params.taskId);

    res.json({
        success: true,
        count: reviews.length,
        reviews
    });
});

/**
 * @description 获取待审核数量和是否有待审核项
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 hasPending 和 count
 */
router.get('/status/pending-count', (req, res) => {
    res.json({
        success: true,
        hasPending: reviewHub.hasPendingReviews(),
        count: reviewHub.pendingReviews?.size || 0
    });
});

module.exports = router;