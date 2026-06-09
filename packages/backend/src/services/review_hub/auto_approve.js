/**
 * @file auto_approve.js
 * @description 自动通过检查器 - 根据风险等级、自定义规则和操作类型判断审核是否可自动通过，
 *              极高/高风险操作绝不自动通过，低风险查询类操作自动放行
 * @module review_hub
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { RiskLevel } = require('./constants');

// ============================================================
// 核心类：AutoApprove
// 功能说明：自动通过规则引擎，支持自定义规则注册
// ============================================================

class AutoApprove {

    /**
     * @description 构造函数，初始化自定义规则列表
     */
    constructor() {
        /** @type {Array<{condition: Function, reason: string}>} 自定义自动通过规则列表 */
        this.rules = [];
    }

    /**
     * @description 添加自定义自动通过规则
     * @param {Function} condition - 判断函数，签名为 (fullText: string, context: Object) => boolean
     * @param {string} reason - 自动通过的原因说明
     * @returns {void}
     */
    addRule(condition, reason) {
        this.rules.push({ condition, reason });
    }

    /**
     * @description 检查当前审核是否应该自动通过，按优先级依次检查：
     *              1. 极高/高风险直接拒绝自动通过
     *              2. 自定义规则匹配
     *              3. 低风险+用户已授权
     *              4. 搜索/查看类操作
     * @param {string} scene - 审核场景标识
     * @param {string} title - 操作标题
     * @param {string} content - 操作内容
     * @param {Object} context - 上下文信息，可包含 userAuthorized 标记
     * @param {string} riskLevel - 风险等级
     * @returns {Promise<{shouldAutoApprove: boolean, reason: string|null}>} 检查结果
     */
    async check(scene, title, content, context, riskLevel) {
        const fullText = `${title} ${content}`.toLowerCase();

        // 极高/高风险操作必须人工确认，绝不自动通过
        if (riskLevel === RiskLevel.CRITICAL || riskLevel === RiskLevel.HIGH) {
            return { shouldAutoApprove: false, reason: '高风险操作，需要用户确认' };
        }

        // 检查自定义规则，优先级高于内置规则
        for (const rule of this.rules) {
            if (rule.condition(fullText, context)) {
                return { shouldAutoApprove: true, reason: rule.reason };
            }
        }

        // 低风险 + 用户已授权 → 自动通过
        if (context.userAuthorized && riskLevel === RiskLevel.LOW) {
            return { shouldAutoApprove: true, reason: '低风险操作，用户已授权' };
        }

        // 搜索/查看类操作为只读操作，无需确认
        if (/搜索|查找|查看|查询/i.test(fullText)) {
            return { shouldAutoApprove: true, reason: '查询操作，自动通过' };
        }

        return { shouldAutoApprove: false, reason: null };
    }

    /**
     * @description 执行自动通过流程：更新审核状态、广播通知、触发通过回调
     * @param {Object} review - 审核对象
     * @param {Map} pendingReviews - 待审核队列
     * @param {Array} reviewHistory - 审核历史记录
     * @param {Broadcast} broadcast - 广播器实例
     * @param {EventEmitter} hub - ReviewHub 实例
     * @returns {Promise<void>}
     */
    async execute(review, pendingReviews, reviewHistory, broadcast, hub) {
        const { ReviewStatus } = require('./constants');
        const { logger } = require('../../utils/logger');

        review.status = ReviewStatus.APPROVED;
        review.respondedAt = Date.now();
        review.response = { action: 'auto_approve', reason: review.autoApproveReason };

        pendingReviews.delete(review.id);
        reviewHistory.push(review);

        broadcast.broadcast(hub, 'review:auto_approved', { reviewId: review.id, reason: review.autoApproveReason });

        // 使用 setImmediate 确保回调不阻塞当前流程
        if (review.onApprove) {
            setImmediate(async () => {
                try {
                    await review.onApprove(review.response, review.context);
                } catch (e) {
                    logger.error('[ReviewHub] 自动通过回调失败:', e);
                }
            });
        }

        hub.emit('review:auto_approved', review);
    }
}

module.exports = new AutoApprove();