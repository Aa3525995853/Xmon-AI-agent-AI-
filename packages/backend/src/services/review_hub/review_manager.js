/**
 * @file review_manager.js
 * @description 审核管理器 - 负责审核对象的创建、过期定时器管理、内容截断、
 *              格式化、取消和待审核列表查询等核心管理功能
 * @module review_hub
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const crypto = require('crypto');
const { ReviewStatus } = require('./constants');

// ============================================================
// 常量定义
// ============================================================

/** 内容预览的最大字符长度 */
const CONTENT_PREVIEW_MAX_LENGTH = 300;

/** 审核历史记录最大保留条数 */
const REVIEW_HISTORY_MAX_LENGTH = 1000;

/** 审核历史记录清理后保留条数 */
const REVIEW_HISTORY_KEEP_LENGTH = 500;

/** 过期定时器最小延迟（毫秒），防止 setTimeout 传入负值 */
const MIN_EXPIRATION_DELAY = 5000;

// ============================================================
// 核心类：ReviewManager
// 功能说明：审核对象的生命周期管理
// ============================================================

class ReviewManager {

    /**
     * @description 生成唯一的审核 ID，格式为 rev_{时间戳36进制}_{随机hex}
     * @returns {string} 审核 ID
     */
    generateId() {
        return `rev_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * @description 创建审核对象，包含完整的审核生命周期信息
     * @param {Object} params - 审核参数
     * @param {string} params.id - 审核 ID
     * @param {string} params.scene - 审核场景
     * @param {string} params.taskId - 关联的任务 ID
     * @param {string} params.title - 审核标题
     * @param {string} params.content - 审核内容
     * @param {Object} params.context - 上下文信息
     * @param {Array} params.options - 可选操作列表
     * @param {string} params.riskLevel - 风险等级
     * @param {string} params.mode - 审核模式
     * @param {string} params.autoApproveReason - 自动通过原因
     * @param {Object} params.timeoutConfig - 超时配置
     * @param {number} params.defaultTimeout - 默认超时时间
     * @param {Function} params.onApprove - 通过回调
     * @param {Function} params.onReject - 拒绝回调
     * @returns {Object} 完整的审核对象
     */
    createReview(params) {
        const { id, scene, taskId, title, content, context, options, riskLevel, mode, autoApproveReason, timeoutConfig, defaultTimeout, onApprove, onReject } = params;

        return {
            id,
            scene,
            taskId,
            title,
            content,
            contentPreview: this.truncateContent(content),
            context,
            options,
            riskLevel,
            mode,
            autoApproveReason,
            status: ReviewStatus.PENDING,
            createdAt: Date.now(),
            expiresAt: Date.now() + (timeoutConfig[scene] || defaultTimeout),
            onApprove,
            onReject,
            respondedAt: null,
            respondedBy: null,
            response: null
        };
    }

    /**
     * @description 启动审核过期定时器，到期后自动将审核标记为过期并触发拒绝回调
     * @param {string} reviewId - 审核 ID
     * @param {Map} pendingReviews - 待审核队列
     * @param {Array} reviewHistory - 审核历史记录
     * @param {Broadcast} broadcast - 广播器实例
     * @param {EventEmitter} hub - ReviewHub 实例
     * @param {Object} constants - 常量模块
     * @returns {void}
     */
    startExpirationTimer(reviewId, pendingReviews, reviewHistory, broadcast, hub, constants) {
        const review = pendingReviews.get(reviewId);
        if (!review) return;

        const timeout = review.expiresAt - Date.now();

        setTimeout(() => {
            // 二次检查审核是否仍在待审核队列中
            if (pendingReviews.has(reviewId)) {
                const currentReview = pendingReviews.get(reviewId);
                if (currentReview.status === ReviewStatus.PENDING) {
                    currentReview.status = ReviewStatus.EXPIRED;
                    pendingReviews.delete(reviewId);
                    reviewHistory.push(currentReview);

                    broadcast.broadcast(hub, 'review:expired', { reviewId });
                    hub.emit('review:expired', currentReview);

                    // 过期等同于拒绝，触发拒绝回调
                    if (currentReview.onReject) {
                        setImmediate(() => currentReview.onReject({ action: 'expired' }, currentReview.context));
                    }
                }
            }
        }, Math.max(timeout, MIN_EXPIRATION_DELAY));
    }

    /**
     * @description 截断内容到指定长度，超出部分用省略号替代
     * @param {string} content - 原始内容
     * @param {number} [maxLen=300] - 最大长度
     * @returns {string} 截断后的内容
     */
    truncateContent(content, maxLen = CONTENT_PREVIEW_MAX_LENGTH) {
        if (!content) return '';
        return content.length > maxLen ? content.substring(0, maxLen) + '...' : content;
    }

    /**
     * @description 格式化文件大小为人类可读格式
     * @param {number} bytes - 文件大小（字节）
     * @returns {string} 格式化后的大小字符串，如 '1.5 KB'
     */
    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    /**
     * @description 将结果对象总结为字符串，用于审核内容展示
     * @param {*} result - 任务执行结果
     * @returns {string} 结果的字符串摘要，最长500字符
     */
    summarizeResult(result) {
        if (typeof result === 'string') return result;
        return JSON.stringify(result, null, 2).substring(0, 500);
    }

    /**
     * @description 取消指定的审核请求，更新状态并广播通知
     * @param {string} reviewId - 审核 ID
     * @param {string} reason - 取消原因
     * @param {Map} pendingReviews - 待审核队列
     * @param {Array} reviewHistory - 审核历史记录
     * @param {Broadcast} broadcast - 广播器实例
     * @returns {{success: boolean, error?: string}} 取消结果
     */
    cancel(reviewId, reason, pendingReviews, reviewHistory, broadcast) {
        const review = pendingReviews.get(reviewId);
        if (!review) return { success: false, error: '审核不存在' };

        review.status = ReviewStatus.CANCELLED;
        review.respondedAt = Date.now();
        review.response = { action: 'cancel', reason };

        pendingReviews.delete(reviewId);
        reviewHistory.push(review);
        broadcast.broadcast(null, 'review:cancelled', { reviewId, reason });

        return { success: true };
    }

    /**
     * @description 获取待审核列表，支持按场景、任务ID和风险等级过滤
     * @param {Map} pendingReviews - 待审核队列
     * @param {Object} filter - 过滤条件
     * @param {string} [filter.scene] - 按场景过滤
     * @param {string} [filter.taskId] - 按任务 ID 过滤
     * @param {string} [filter.riskLevel] - 按风险等级过滤
     * @returns {Array<Object>} 过滤后的待审核列表
     */
    getPending(pendingReviews, filter) {
        let reviews = Array.from(pendingReviews.values());

        if (filter.scene) reviews = reviews.filter(r => r.scene === filter.scene);
        if (filter.taskId) reviews = reviews.filter(r => r.taskId === filter.taskId);
        if (filter.riskLevel) reviews = reviews.filter(r => r.riskLevel === filter.riskLevel);

        return reviews;
    }
}

module.exports = new ReviewManager();