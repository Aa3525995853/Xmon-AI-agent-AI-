/**
 * @file review_hub.js
 * @description 审核中心 - 管理任务执行前的用户审核流程，支持计划审核、响应处理和状态广播
 * @module services/executor
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

class ReviewHub {
    /**
     * @description 构造函数，初始化待审核列表和WebSocket广播器
     */
    constructor() {
        /** @type {Map<string, Object>} 待审核项映射，key为reviewId */
        this.pendingReviews = new Map();
        /** @type {Object|null} WebSocket广播器引用 */
        this._wsBroadcaster = null;
    }

    /**
     * @description 设置WebSocket广播器，用于向前端推送审核状态
     * @param {Object} broadcaster - WebSocket广播器实例
     */
    setWsBroadcaster(broadcaster) {
        this._wsBroadcaster = broadcaster;
    }

    /**
     * @description 创建审核请求，生成审核ID并通过WebSocket广播给前端
     * @param {Object} config - 审核配置
     * @param {string} config.scene - 审核场景：plan_review/auto 等
     * @param {string} [config.taskId] - 关联的任务ID
     * @param {string} config.title - 审核标题
     * @param {string} config.content - 审核内容描述
     * @param {Object} [config.context] - 审核上下文
     * @param {Array<Object>} [config.options] - 审核选项列表
     * @returns {Promise<{reviewId: string, requiresResponse: boolean, review: Object}>} 审核创建结果
     */
    async createReview(config) {
        const reviewId = 'review_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

        const review = {
            id: reviewId,
            scene: config.scene,
            taskId: config.taskId,
            title: config.title,
            content: config.content,
            context: config.context,
            options: config.options || [
                { id: 'approve', label: '确认', icon: '✓', style: 'primary' },
                { id: 'reject', label: '拒绝', icon: '✗', style: 'danger' }
            ],
            status: 'pending',
            createdAt: Date.now()
        };

        this.pendingReviews.set(reviewId, review);

        // 广播审核请求
        if (this._wsBroadcaster) {
            this._wsBroadcaster.broadcast('review:pending', review);
        }

        logger.info(`[ReviewHub] 创建审核: ${reviewId}`, { scene: config.scene });

        return {
            reviewId,
            requiresResponse: config.scene !== 'auto',
            review
        };
    }

    /**
     * @description 创建计划审核，将执行计划格式化后提交用户确认
     * @param {string} taskId - 关联的任务ID
     * @param {Object} plan - 执行计划对象，包含 steps 数组
     * @returns {Promise<{reviewId: string, requiresResponse: boolean, review: Object}>} 审核创建结果
     */
    async createPlanReview(taskId, plan) {
        return this.createReview({
            scene: 'plan_review',
            taskId,
            title: '📋 执行计划确认',
            content: this._formatPlan(plan),
            options: [
                { id: 'approve', label: '开始执行', icon: '▶️', style: 'primary' },
                { id: 'modify', label: '需要修改', icon: '✏️', style: 'secondary' },
                { id: 'cancel', label: '取消', icon: '❌', style: 'ghost' }
            ]
        });
    }

    /**
     * @description 将执行计划格式化为可读文本
     * @param {Object} plan - 执行计划对象
     * @param {Array} plan.steps - 步骤列表
     * @returns {string} 格式化后的步骤文本
     * @private
     */
    _formatPlan(plan) {
        if (!plan || !plan.steps) return '无';

        const lines = plan.steps.map((step, i) => {
            return `${i + 1}. ${step.description || step.action}`;
        });

        return lines.join('\n');
    }

    /**
     * @description 处理审核响应，更新审核状态并通过WebSocket广播结果
     * @param {string} reviewId - 审核ID
     * @param {Object} response - 用户响应
     * @param {boolean} response.approved - 是否批准
     * @returns {Promise<{success: boolean, review?: Object, error?: string}>} 处理结果
     */
    async handleResponse(reviewId, response) {
        const review = this.pendingReviews.get(reviewId);

        if (!review) {
            return { success: false, error: 'Review not found' };
        }

        review.status = response.approved ? 'approved' : 'rejected';
        review.response = response;
        review.respondedAt = Date.now();

        // 广播审核结果
        if (this._wsBroadcaster) {
            this._wsBroadcaster.broadcast('review:complete', review);
        }

        logger.info(`[ReviewHub] 审核完成: ${reviewId}`, {
            status: review.status,
            response: response
        });

        return { success: true, review };
    }

    /**
     * @description 获取所有状态为 pending 的待审核项
     * @returns {Array<Object>} 待审核项列表
     */
    getPendingReviews() {
        return Array.from(this.pendingReviews.values())
            .filter(r => r.status === 'pending');
    }

    /**
     * @description 取消指定审核项
     * @param {string} reviewId - 审核ID
     * @returns {{success: boolean, error?: string}} 取消结果
     */
    cancelReview(reviewId) {
        const review = this.pendingReviews.get(reviewId);
        if (review) {
            review.status = 'cancelled';
            return { success: true };
        }
        return { success: false, error: 'Review not found' };
    }
}

module.exports = new ReviewHub();