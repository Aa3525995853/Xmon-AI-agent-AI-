/**
 * @file retry_manager.js
 * @description 重试管理器 - 负责执行各种重试策略，包括简单重试、备用服务器切换、
 *              缓存回退、限流等待重试、超时延长和降级回退方案
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：重试相关默认值
// ============================================================

/** 默认最大重试次数 */
const DEFAULT_MAX_RETRIES = 5;

/** 默认重试延迟（毫秒） */
const DEFAULT_RETRY_DELAY_MS = 1000;

/** 默认限流等待时间（毫秒），1分钟 */
const DEFAULT_RATE_LIMIT_DELAY_MS = 60000;

/** 默认超时时间（毫秒），30秒 */
const DEFAULT_TIMEOUT_MS = 30000;

/** 默认超时延长倍数 */
const DEFAULT_TIMEOUT_FACTOR = 2;

/** 默认重试尝试次数 */
const DEFAULT_ATTEMPTS = 3;

class RetryManager {
    /**
     * @description 构造函数，初始化最大重试次数
     */
    constructor() {
        /** 最大重试次数 */
        this.maxRetries = DEFAULT_MAX_RETRIES;
    }

    /**
     * @description 根据替代方案的 action 类型分发执行对应的重试策略
     * @param {Object} alternative - 替代方案对象，包含 action 及其参数
     * @param {string} alternative.action - 策略动作类型（retry/useBackup/useCache/waitAndRetry/extendTimeout/fallback）
     * @param {Object} context - 执行上下文，包含当前请求状态和缓存数据
     * @returns {Promise<{success: boolean, result?: any, message?: string}>} 执行结果
     */
    async execute(alternative, context = {}) {
        const { action, maxAttempts, delay } = alternative;

        switch (action) {
            case 'retry':
                return this._retry(alternative, context);

            case 'useBackup':
                return this._useBackup(alternative, context);

            case 'useCache':
                return this._useCache(context);

            case 'waitAndRetry':
                return this._waitAndRetry(alternative, context);

            case 'extendTimeout':
                return this._extendTimeout(alternative, context);

            case 'fallback':
                return this._fallback(context);

            default:
                return { success: false, message: `Unknown action: ${action}` };
        }
    }

    // ============================================================
    // 重试策略实现
    // ============================================================

    /**
     * @description 简单重试策略 - 按指定次数和延迟反复尝试执行操作
     * @param {Object} alternative - 替代方案，包含 maxAttempts 和 delay 参数
     * @param {Object} context - 执行上下文
     * @returns {Promise<{success: boolean, result?: any, error?: string, message?: string}>} 重试结果
     */
    async _retry(alternative, context) {
        const attempts = alternative.maxAttempts || DEFAULT_ATTEMPTS;
        const delayMs = alternative.delay || DEFAULT_RETRY_DELAY_MS;

        for (let i = 0; i < attempts; i++) {
            try {
                logger.info(`[重试] 第 ${i + 1} 次尝试`);

                const result = await this._executeAction(context);

                if (result.success) {
                    return result;
                }

                // 最后一次尝试无需等待
                if (i < attempts - 1) {
                    await this._sleep(delayMs);
                }

            } catch (error) {
                logger.warn(`[重试] 第 ${i + 1} 次失败:`, error.message);

                if (i === attempts - 1) {
                    return { success: false, error: error.message };
                }

                // 采用线性递增延迟，避免频繁重试加剧服务端压力
                await this._sleep(delayMs * (i + 1));
            }
        }

        return { success: false, message: '重试次数耗尽' };
    }

    /**
     * @description 备用服务器策略 - 依次尝试备用服务器列表中的服务器
     * @param {Object} alternative - 替代方案，包含 servers 备用服务器列表
     * @param {Object} context - 执行上下文
     * @returns {Promise<{success: boolean, result?: any, message?: string}>} 执行结果
     */
    async _useBackup(alternative, context) {
        const servers = alternative.servers || [];

        for (const server of servers) {
            try {
                logger.info(`[备用] 尝试服务器: ${server}`);

                const result = await this._executeAction({
                    ...context,
                    server
                });

                if (result.success) {
                    return result;
                }
            } catch (error) {
                logger.warn(`[备用] 服务器 ${server} 失败`);
                continue;
            }
        }

        return { success: false, message: '所有备用服务器均失败' };
    }

    /**
     * @description 缓存回退策略 - 使用上下文中缓存的先前结果作为返回
     * @param {Object} context - 执行上下文，需包含 cachedResult 字段
     * @returns {Promise<{success: boolean, result?: any, fromCache?: boolean, message?: string}>} 缓存结果
     */
    async _useCache(context) {
        if (context.cachedResult) {
            return { success: true, result: context.cachedResult, fromCache: true };
        }
        return { success: false, message: '无可用缓存' };
    }

    /**
     * @description 限流等待重试策略 - 先等待较长时间（如1分钟）再执行简单重试，
     *              适用于 API 限流场景，等待限流窗口重置
     * @param {Object} alternative - 替代方案，包含 delay 等待时间
     * @param {Object} context - 执行上下文
     * @returns {Promise<{success: boolean}>} 重试结果
     */
    async _waitAndRetry(alternative, context) {
        const delayMs = alternative.delay || DEFAULT_RATE_LIMIT_DELAY_MS;

        logger.info(`[限流] 等待 ${delayMs}ms 后重试`);

        await this._sleep(delayMs);

        return this._retry(alternative, context);
    }

    /**
     * @description 超时延长策略 - 按倍数延长超时时间后重新执行操作
     * @param {Object} alternative - 替代方案，包含 factor 延长倍数
     * @param {Object} context - 执行上下文，需包含 timeout 当前超时时间
     * @returns {Promise<{success: boolean}>} 执行结果
     */
    _extendTimeout(alternative, context) {
        const factor = alternative.factor || DEFAULT_TIMEOUT_FACTOR;
        const newTimeout = (context.timeout || DEFAULT_TIMEOUT_MS) * factor;

        return this._executeAction({
            ...context,
            timeout: newTimeout
        });
    }

    /**
     * @description 降级回退策略 - 返回预设的降级结果，标记为回退方案
     * @param {Object} context - 执行上下文，需包含 fallbackResult 降级结果
     * @returns {{success: boolean, result: Object, isFallback: boolean}} 回退结果
     */
    _fallback(context) {
        logger.info('[回退] 执行回退方案');

        return {
            success: true,
            result: context.fallbackResult || {},
            isFallback: true
        };
    }

    // ============================================================
    // 内部工具方法
    // ============================================================

    /**
     * @description 执行实际操作的占位方法，由调用者通过上下文提供具体执行逻辑
     * @param {Object} context - 执行上下文
     * @returns {Promise<{success: boolean}>} 执行结果
     */
    async _executeAction(context) {
        return { success: true };
    }

    /**
     * @description 异步休眠工具方法
     * @param {number} ms - 休眠时间（毫秒）
     * @returns {Promise<void>} 休眠 Promise
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new RetryManager();