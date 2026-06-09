/**
 * @file index.js
 * @description ReviewHub 主入口 - 审核中枢，确保用户始终掌控最终决策。
 *              提供规划审核、结果审核、操作审核、恢复审核、交付审核等完整的审核流程管理
 * @module review_hub
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载：子模块按需引入，减少启动时内存占用
// ============================================================

/** @type {Object|null} 常量模块延迟加载缓存 */
let _constants = null;
/** @type {RiskAssessor|null} 风险评估器延迟加载缓存 */
let _riskAssessor = null;
/** @type {AutoApprove|null} 自动通过检查器延迟加载缓存 */
let _autoApprove = null;
/** @type {ReviewManager|null} 审核管理器延迟加载缓存 */
let _reviewManager = null;
/** @type {ResponseHandler|null} 响应处理器延迟加载缓存 */
let _responseHandler = null;
/** @type {Broadcast|null} 广播器延迟加载缓存 */
let _broadcast = null;

/**
 * @description 延迟加载常量模块
 * @returns {Object} 常量对象
 */
function getConstants() {
    if (!_constants) _constants = require('./constants');
    return _constants;
}

/**
 * @description 延迟加载风险评估器
 * @returns {RiskAssessor} 风险评估器实例
 */
function getRiskAssessor() {
    if (!_riskAssessor) _riskAssessor = require('./risk_assessor');
    return _riskAssessor;
}

/**
 * @description 延迟加载自动通过检查器
 * @returns {AutoApprove} 自动通过检查器实例
 */
function getAutoApprove() {
    if (!_autoApprove) _autoApprove = require('./auto_approve');
    return _autoApprove;
}

/**
 * @description 延迟加载审核管理器
 * @returns {ReviewManager} 审核管理器实例
 */
function getReviewManager() {
    if (!_reviewManager) _reviewManager = require('./review_manager');
    return _reviewManager;
}

/**
 * @description 延迟加载响应处理器
 * @returns {ResponseHandler} 响应处理器实例
 */
function getResponseHandler() {
    if (!_responseHandler) _responseHandler = require('./response_handler');
    return _responseHandler;
}

/**
 * @description 延迟加载广播器
 * @returns {Broadcast} 广播器实例
 */
function getBroadcast() {
    if (!_broadcast) _broadcast = require('./broadcast');
    return _broadcast;
}

// ============================================================
// 核心类：ReviewHub
// 功能说明：审核中枢，协调风险评估、自动通过、审核管理和响应处理
// ============================================================

class ReviewHub extends EventEmitter {

    /**
     * @description 构造函数，初始化子模块和审核队列
     */
    constructor() {
        super();

        this.constants = getConstants();
        this.riskAssessor = getRiskAssessor();
        this.autoApprove = getAutoApprove();
        this.reviewManager = getReviewManager();
        this.responseHandler = getResponseHandler();
        this.broadcast = getBroadcast();

        /** @type {Map<string, Object>} 待审核队列，按审核 ID 索引 */
        this.pendingReviews = new Map();
        /** @type {Array<Object>} 审核历史记录 */
        this.reviewHistory = [];

        /** @type {Function|null} WebSocket 广播器函数 */
        this._wsBroadcaster = null;

        logger.info('[ReviewHub] 审核中枢初始化完成');
    }

    /**
     * @description 设置 WebSocket 广播器，用于向前端推送审核事件
     * @param {Function} broadcaster - 广播函数，签名为 (event: string, data: Object) => void
     * @returns {void}
     */
    setWsBroadcaster(broadcaster) {
        this._wsBroadcaster = broadcaster;
        this.broadcast.setBroadcaster(broadcaster);
    }

    /**
     * @description 创建审核请求，自动评估风险并判断是否可自动通过
     * @param {Object} params - 审核参数
     * @param {string} params.scene - 审核场景
     * @param {string} params.taskId - 关联的任务 ID
     * @param {string} params.title - 审核标题
     * @param {string} params.content - 审核内容
     * @param {Object} [params.context={}] - 上下文信息
     * @param {Array} [params.options=[]] - 可选操作列表
     * @param {Function} params.onApprove - 通过回调
     * @param {Function} params.onReject - 拒绝回调
     * @returns {Promise<{reviewId: string, riskLevel: string, mode: string, requiresResponse: boolean, autoApproveReason: string|null, expiresAt: number, preview: string}>} 审核创建结果
     */
    async createReview(params) {
        const { scene, taskId, title, content, context = {}, options = [], onApprove, onReject } = params;

        // 评估风险等级
        const riskLevel = await this.riskAssessor.assess(scene, title, content, context);
        // 检查是否可自动通过
        const autoResult = await this.autoApprove.check(scene, title, content, context, riskLevel);

        const review = this.reviewManager.createReview({
            id: this.reviewManager.generateId(),
            scene, taskId, title, content,
            context, options, riskLevel,
            mode: autoResult.shouldAutoApprove ? this.constants.ReviewMode.AUTO_APPROVE : this.constants.ReviewMode.MANUAL_REVIEW,
            autoApproveReason: autoResult.reason,
            timeoutConfig: this.constants.TIMEOUT_CONFIG,
            defaultTimeout: this.constants.DEFAULT_TIMEOUT,
            onApprove, onReject
        });

        this.pendingReviews.set(review.id, review);
        this.broadcast.broadcast(this, 'review:new', this._formatForBroadcast(review));

        // 启动过期定时器
        this.reviewManager.startExpirationTimer(review.id, this.pendingReviews, this.reviewHistory, this.broadcast, this, this.constants);

        // 自动通过时立即执行
        if (autoResult.shouldAutoApprove) {
            await this.autoApprove.execute(review, this.pendingReviews, this.reviewHistory, this.broadcast, this);
        }

        return {
            reviewId: review.id,
            riskLevel,
            mode: review.mode,
            requiresResponse: !autoResult.shouldAutoApprove,
            autoApproveReason: autoResult.reason,
            expiresAt: review.expiresAt,
            preview: this.reviewManager.truncateContent(content)
        };
    }

    /**
     * @description 创建规划审核 - 任务执行前的计划确认
     * @param {string} taskId - 任务 ID
     * @param {Object} plan - 执行计划，包含 steps 和 estimatedTime
     * @returns {Promise<Object>} 审核创建结果
     */
    async createPlanReview(taskId, plan) {
        const steps = plan.steps || [];
        const stepsSummary = steps.map((s, i) => `${i + 1}. ${s.desc || s.action}`).join('\n');

        return this.createReview({
            scene: this.constants.ReviewScene.PLAN_REVIEW,
            taskId,
            title: '📋 任务执行计划',
            content: `即将执行以下步骤：\n\n${stepsSummary}\n\n预计耗时：${plan.estimatedTime || '几分钟'}`,
            context: { plan, steps },
            options: [
                { id: 'approve', label: '开始执行', icon: '▶️', style: 'primary' },
                { id: 'modify', label: '调整一下', icon: '✏️', style: 'secondary' },
                { id: 'cancel', label: '取消', icon: '❌', style: 'ghost' }
            ]
        });
    }

    /**
     * @description 创建结果审核 - 任务执行后的结果确认
     * @param {string} taskId - 任务 ID
     * @param {Object} result - 任务执行结果
     * @returns {Promise<Object>} 审核创建结果
     */
    async createResultReview(taskId, result) {
        return this.createReview({
            scene: this.constants.ReviewScene.RESULT_REVIEW,
            taskId,
            title: '✅ 任务执行结果',
            content: this.reviewManager.summarizeResult(result),
            context: { result },
            options: [
                { id: 'confirm', label: '确认完成', icon: '✓', style: 'primary' },
                { id: 'retry', label: '重新执行', icon: '🔄', style: 'secondary' },
                { id: 'modify', label: '修改一下', icon: '✏️', style: 'secondary' }
            ]
        });
    }

    /**
     * @description 创建操作审核 - 敏感操作执行前的确认（如发送邮件、提交表单等）
     * @param {string} taskId - 任务 ID
     * @param {string} action - 操作类型标识
     * @param {Object} details - 操作详情，包含 description、recipients、subject、body 等
     * @returns {Promise<Object>} 审核创建结果
     */
    async createActionReview(taskId, action, details) {
        const actionLabels = { send_email: '发送邮件', send_message: '发送消息', post_notification: '发布通知', submit_form: '提交表单' };

        return this.createReview({
            scene: this.constants.ReviewScene.ACTION_REVIEW,
            taskId,
            title: '⚠️ 请确认操作',
            content: `即将执行：${actionLabels[action] || action}\n\n${details.description || ''}\n${details.recipients ? `收件人：${details.recipients}` : ''}\n${details.subject ? `主题：${details.subject}` : ''}\n${details.body ? `内容预览：\n${this.reviewManager.truncateContent(details.body, 200)}` : ''}`.trim(),
            context: { action, details },
            options: [
                { id: 'confirm', label: '确认发送', icon: '📤', style: 'primary', confirmText: '确定要发送吗？' },
                { id: 'modify', label: '修改内容', icon: '✏️', style: 'secondary' },
                { id: 'cancel', label: '取消', icon: '❌', style: 'ghost' }
            ]
        });
    }

    /**
     * @description 创建恢复审核 - 执行出错后的修复方案选择
     * @param {string} taskId - 任务 ID
     * @param {Object} error - 错误信息，包含 message 字段
     * @param {Array<{description: string, successRate: number}>} alternatives - 修复方案列表
     * @returns {Promise<Object>} 审核创建结果
     */
    async createRecoverReview(taskId, error, alternatives) {
        const altSummary = alternatives.map((a, i) => `${i + 1}. ${a.description}\n   成功率：${a.successRate || '?'}%`).join('\n\n');

        return this.createReview({
            scene: this.constants.ReviewScene.RECOVER_REVIEW,
            taskId,
            title: '🔧 遇到问题，需要修复',
            content: `执行过程中遇到错误：\n\n❌ ${error.message}\n\n提供以下修复方案：\n${altSummary}`.trim(),
            context: { error, alternatives },
            options: [
                { id: 'fix_1', label: '方案1（推荐）', icon: '✅', style: 'primary' },
                { id: 'fix_2', label: '方案2', icon: '🔧', style: 'secondary' },
                { id: 'skip', label: '跳过此步', icon: '⏭️', style: 'secondary' },
                { id: 'cancel', label: '取消任务', icon: '❌', style: 'ghost' }
            ]
        });
    }

    /**
     * @description 创建交付审核 - 交付物确认
     * @param {string} taskId - 任务 ID
     * @param {Object} deliverable - 交付物信息，包含 filename、type、size、path、preview 等
     * @returns {Promise<Object>} 审核创建结果
     */
    async createDeliveryReview(taskId, deliverable) {
        return this.createReview({
            scene: this.constants.ReviewScene.DELIVERY_REVIEW,
            taskId,
            title: '📦 交付物确认',
            content: `任务即将完成，准备交付以下内容：\n\n📁 文件：${deliverable.filename || '未命名'}\n📊 类型：${deliverable.type || '未知'}\n${deliverable.size ? `📏 大小：${this.reviewManager.formatSize(deliverable.size)}` : ''}\n${deliverable.path ? `📍 位置：${deliverable.path}` : ''}\n${deliverable.preview ? `预览：\n${this.reviewManager.truncateContent(deliverable.preview, 300)}` : ''}`.trim(),
            context: { deliverable },
            options: [
                { id: 'save', label: '保存到桌面', icon: '💾', style: 'primary' },
                { id: 'save_custom', label: '保存到...', icon: '📂', style: 'secondary' },
                { id: 'open', label: '保存并打开', icon: '📂', style: 'primary' },
                { id: 'cancel', label: '暂不保存', icon: '❌', style: 'ghost' }
            ]
        });
    }

    /**
     * @description 处理用户对审核的响应
     * @param {string} reviewId - 审核 ID
     * @param {string|Object} response - 用户响应
     * @param {Object} [userContext={}] - 用户上下文
     * @returns {Promise<{success: boolean, status?: string, action?: string, message?: string, error?: string}>} 处理结果
     */
    async respond(reviewId, response, userContext = {}) {
        return this.responseHandler.handle(reviewId, response, userContext, this.pendingReviews, this.reviewHistory, this.broadcast, this, this.constants);
    }

    /**
     * @description 取消指定的审核请求
     * @param {string} reviewId - 审核 ID
     * @param {string} [reason=''] - 取消原因
     * @returns {{success: boolean, error?: string}} 取消结果
     */
    cancelReview(reviewId, reason = '') {
        return this.reviewManager.cancel(reviewId, reason, this.pendingReviews, this.reviewHistory, this.broadcast);
    }

    /**
     * @description 获取待审核列表，支持按场景、任务ID和风险等级过滤
     * @param {Object} [filter={}] - 过滤条件
     * @returns {Array<Object>} 格式化后的待审核列表
     */
    getPendingReviews(filter = {}) {
        return this.reviewManager.getPending(this.pendingReviews, filter).map(r => this._formatForBroadcast(r));
    }

    /**
     * @description 获取指定审核的详情
     * @param {string} reviewId - 审核 ID
     * @returns {Object|null} 格式化后的审核详情，不存在时返回 null
     */
    getReview(reviewId) {
        const review = this.pendingReviews.get(reviewId) || this.reviewHistory.find(r => r.id === reviewId);
        return review ? this._formatForBroadcast(review) : null;
    }

    /**
     * @description 获取审核历史记录
     * @param {number} [limit=50] - 返回的最大条数
     * @returns {Array<Object>} 格式化后的审核历史列表
     */
    getReviewHistory(limit = 50) {
        return this.reviewHistory.slice(-limit).map(r => this._formatForBroadcast(r));
    }

    /**
     * @description 检查是否有待审核的请求
     * @returns {boolean} 是否有待审核请求
     */
    hasPendingReviews() {
        return this.pendingReviews.size > 0;
    }

    /**
     * @description 将审核对象格式化为前端可展示的结构，去除回调和内部字段
     * @param {Object} review - 原始审核对象
     * @returns {Object} 格式化后的审核数据
     * @private
     */
    _formatForBroadcast(review) {
        return {
            id: review.id,
            scene: review.scene,
            sceneLabel: this.constants.SCENE_LABELS[review.scene] || review.scene,
            taskId: review.taskId,
            title: review.title,
            content: review.content,
            contentPreview: this.reviewManager.truncateContent(review.content),
            options: review.options,
            riskLevel: review.riskLevel,
            riskLabel: this.constants.RISK_LABELS[review.riskLevel] || review.riskLevel,
            mode: review.mode,
            status: review.status,
            createdAt: review.createdAt,
            expiresAt: review.expiresAt,
            autoApproveReason: review.autoApproveReason
        };
    }
}

const instance = new ReviewHub();
module.exports = instance;
module.exports.ReviewHub = ReviewHub;
module.exports.ReviewScene = getConstants().ReviewScene;
module.exports.ReviewMode = getConstants().ReviewMode;
module.exports.ReviewStatus = getConstants().ReviewStatus;
module.exports.RiskLevel = getConstants().RiskLevel;