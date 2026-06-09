/**
 * @file index.js
 * @description Healer 主入口 - 异常自愈机制的核心调度器，协调错误分类、替代方案生成和重试执行
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块，避免循环依赖
// ============================================================

/** 错误分类器懒加载实例 */
let _errorClassifier = null;
/** 替代方案生成器懒加载实例 */
let _alternativeGenerator = null;
/** 重试管理器懒加载实例 */
let _retryManager = null;

/**
 * @description 获取错误分类器单例
 * @returns {Object} ErrorClassifier 实例
 */
function getErrorClassifier() {
    if (!_errorClassifier) _errorClassifier = require('./error_classifier');
    return _errorClassifier;
}

/**
 * @description 获取替代方案生成器单例
 * @returns {Object} AlternativeGenerator 实例
 */
function getAlternativeGenerator() {
    if (!_alternativeGenerator) _alternativeGenerator = require('./alternative_generator');
    return _alternativeGenerator;
}

/**
 * @description 获取重试管理器单例
 * @returns {Object} RetryManager 实例
 */
function getRetryManager() {
    if (!_retryManager) _retryManager = require('./retry_manager');
    return _retryManager;
}

// ============================================================
// 常量定义：异常严重级别和错误类别
// ============================================================

/**
 * 异常严重级别枚举
 * - WARNING: 警告
 * - RECOVERABLE: 可恢复
 * - USER_REQUIRED: 需用户介入
 * - FATAL: 致命
 */
const SeverityLevel = {
    WARNING: 'warning',
    RECOVERABLE: 'recoverable',
    USER_REQUIRED: 'user_required',
    FATAL: 'fatal'
};

/**
 * 错误类别枚举
 */
const ErrorCategory = {
    NETWORK: 'network',
    PERMISSION: 'permission',
    RESOURCE: 'resource',
    FORMAT: 'format',
    TIMEOUT: 'timeout',
    NOT_FOUND: 'not_found',
    RATE_LIMIT: 'rate_limit',
    CAPTCHA: 'captcha',
    VALIDATION: 'validation',
    SYSTEM: 'system'
};

class Healer extends EventEmitter {
    /**
     * @description 构造函数，初始化子模块并完成自愈机制启动
     */
    constructor() {
        super();

        this.errorClassifier = getErrorClassifier();
        this.alternativeGenerator = getAlternativeGenerator();
        this.retryManager = getRetryManager();

        logger.info('[Healer] 异常自愈机制初始化完成');
    }

    /**
     * @description 诊断错误 - 对错误进行分类并生成替代方案
     * @param {Error|string} error - 异常对象或错误消息
     * @param {Object} context - 执行上下文
     * @returns {Promise<{success: boolean, error?: Error, classification?: Object, alternatives?: Array, severity?: string, actionable?: boolean, message?: string}>} 诊断结果
     */
    async diagnose(error, context = {}) {
        try {
            // 1. 分类错误
            const classification = this.errorClassifier.classify(error);

            // 2. 生成替代方案
            const alternatives = this.alternativeGenerator.generate(classification, context);

            // 3. 返回诊断结果
            return {
                success: true,
                error,
                classification,
                alternatives,
                severity: classification.severity,
                actionable: alternatives.length > 0
            };

        } catch (e) {
            logger.error('[Healer] 诊断失败:', e);
            return { success: false, message: e.message };
        }
    }

    /**
     * @description 尝试修复错误 - 诊断后按优先级依次尝试替代方案，直到成功或全部失败
     * @param {Error|string} error - 异常对象或错误消息
     * @param {Object} context - 执行上下文
     * @returns {Promise<{success: boolean, fixed?: boolean, solution?: Object, result?: Object, message?: string}>} 修复结果
     */
    async attemptFix(error, context = {}) {
        const diagnosis = await this.diagnose(error, context);

        if (!diagnosis.success || !diagnosis.actionable) {
            return diagnosis;
        }

        // 按优先级尝试修复，任一方案成功即返回
        for (const alternative of diagnosis.alternatives) {
            try {
                const result = await this.retryManager.execute(alternative, context);

                if (result.success) {
                    this.emit('fixSuccess', { alternative, result });
                    return { success: true, fixed: true, solution: alternative, result };
                }
            } catch (e) {
                logger.warn(`[Healer] 替代方案失败: ${alternative.name}`, e);
                continue;
            }
        }

        return { success: false, fixed: false, message: '所有修复方案均失败' };
    }

    /**
     * @description 获取严重级别枚举
     * @returns {Object} SeverityLevel 枚举对象
     */
    getSeverityLevel() {
        return SeverityLevel;
    }

    /**
     * @description 获取错误类别枚举
     * @returns {Object} ErrorCategory 枚举对象
     */
    getErrorCategory() {
        return ErrorCategory;
    }
}

module.exports = Healer;