/**
 * @file response_handler.js
 * @description 响应处理器 - 处理用户对审核请求的响应（通过/拒绝/取消），
 *              解析响应数据、更新审核状态、触发回调并广播通知
 * @module review_hub
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');
const { ReviewStatus } = require('./constants');

// ============================================================
// 常量定义
// ============================================================

/** 审核历史记录最大保留条数 */
const HISTORY_MAX_LENGTH = 1000;

/** 审核历史记录清理后保留条数 */
const HISTORY_KEEP_LENGTH = 500;

// ============================================================
// 核心类：ResponseHandler
// 功能说明：审核响应的解析、状态更新和回调触发
// ============================================================

class ResponseHandler {

    /**
     * @description 处理用户对审核的响应，更新审核状态并触发对应回调
     * @param {string} reviewId - 审核 ID
     * @param {string|Object} response - 用户响应，可以是选项 ID、选项标签或响应对象
     * @param {Object} userContext - 用户上下文，包含 userId 等信息
     * @param {Map} pendingReviews - 待审核队列
     * @param {Array} reviewHistory - 审核历史记录
     * @param {Broadcast} broadcast - 广播器实例
     * @param {EventEmitter} hub - ReviewHub 实例
     * @param {Object} constants - 常量模块
     * @returns {Promise<{success: boolean, status?: string, action?: string, message?: string, error?: string}>} 处理结果
     */
    async handle(reviewId, response, userContext, pendingReviews, reviewHistory, broadcast, hub, constants) {
        const review = pendingReviews.get(reviewId);

        if (!review) return { success: false, error: '审核不存在或已过期' };
        if (review.status !== ReviewStatus.PENDING) return { success: false, error: `审核已${review.status}` };

        const responseData = this.parseResponse(response, review.options);
        // cancel 和 reject 视为拒绝，其余视为通过
        const isApproved = responseData.action !== 'cancel' && responseData.action !== 'reject';

        review.status = isApproved ? ReviewStatus.APPROVED : ReviewStatus.REJECTED;
        review.respondedAt = Date.now();
        review.respondedBy = userContext.userId || 'unknown';
        review.response = responseData;

        pendingReviews.delete(reviewId);
        reviewHistory.push(review);

        // 防止历史记录无限增长，超过上限时裁剪
        if (reviewHistory.length > HISTORY_MAX_LENGTH) {
            reviewHistory.splice(0, reviewHistory.length - HISTORY_KEEP_LENGTH);
        }

        broadcast.broadcast(hub, 'review:responded', {
            reviewId,
            status: review.status,
            action: responseData.action,
            timestamp: review.respondedAt
        });

        // 触发通过或拒绝回调，回调异常不影响主流程
        if (isApproved && review.onApprove) {
            try {
                await review.onApprove(responseData, review.context);
            } catch (e) {
                logger.error('[ReviewHub] 审核通过回调失败:', e);
            }
        } else if (!isApproved && review.onReject) {
            try {
                await review.onReject(responseData, review.context);
            } catch (e) {
                logger.error('[ReviewHub] 审核拒绝回调失败:', e);
            }
        }

        hub.emit('review:response', review);

        return {
            success: true,
            status: review.status,
            action: responseData.action,
            message: this.getMessage(review.status, responseData.action)
        };
    }

    /**
     * @description 解析用户响应，支持字符串（选项 ID/标签）和对象两种格式
     * @param {string|Object} response - 用户响应
     * @param {Array<{id: string, label: string}>} options - 可选操作列表
     * @returns {{action: string, data?: *, option?: Object, raw?: *}} 解析后的响应数据
     */
    parseResponse(response, options) {
        // 字符串响应：匹配选项 ID 或标签
        if (typeof response === 'string') {
            const option = options.find(o => o.id === response || o.label === response);
            if (option) return { action: option.id, option };
            return { action: response, raw: response };
        }

        // 对象响应：提取 action 和 data 字段
        if (typeof response === 'object') {
            return {
                action: response.action || response.id || 'unknown',
                data: response.data,
                option: options.find(o => o.id === response.action)
            };
        }

        return { action: 'unknown', raw: response };
    }

    /**
     * @description 根据审核状态和操作类型获取用户友好的响应消息
     * @param {string} status - 审核状态
     * @param {string} action - 操作类型
     * @returns {string} 响应消息
     */
    getMessage(status, action) {
        const messages = {
            [ReviewStatus.APPROVED]: {
                default: '已确认，继续执行',
                confirm: '确认完成',
                modify: '好的，等待修改',
                retry: '好的，正在重新执行',
                fix_1: '好的，使用方案1',
                fix_2: '好的，使用方案2',
                skip: '好的，跳过此步',
                save: '好的，正在保存',
                open: '好的，保存并打开',
                auto_approve: '低风险操作，自动通过'
            },
            [ReviewStatus.REJECTED]: {
                default: '已取消',
                cancel: '好的，已取消',
                reject: '已拒绝'
            }
        };

        return messages[status]?.[action] || messages[status]?.default || '已处理';
    }
}

module.exports = new ResponseHandler();