/**
 * @file circuit_breaker.js
 * @description 熔断器 - 保护工作大脑免受连续失败影响，支持半开试探
 * @module services/workBrainClient
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

/** 失败次数阈值 - 连续失败达到此数则打开熔断器 */
const THRESHOLD = 3;
/** 冷却时间（毫秒） - 熔断器打开后等待此时间进入半开状态 */
const COOLDOWN = 60000;

class CircuitBreaker {
    constructor() {
        this.state = 'closed';
        this.failureCount = 0;
        this.openAt = 0;
        this.breaks = 0;
    }

    /**
     * @description 检查熔断器是否打开 - 冷却期过后自动进入半开状态
     * @returns {boolean} 是否打开（true 表示拒绝请求）
     */
    isOpen() {
        if (this.state === 'open') {
            if (Date.now() - this.openAt > COOLDOWN) {
                this.state = 'half-open';
                logger.info('[CircuitBreaker] 断路器半开，试探性放行');
                return false;
            }
            return true;
        }
        return false;
    }

    /**
     * @description 记录成功 - 重置失败计数，关闭熔断器
     * @param {number} latency - 请求延迟（毫秒）
     * @returns {void}
     */
    recordSuccess(latency) {
        this.failureCount = 0;
        this.state = 'closed';
        logger.debug(`[CircuitBreaker] 成功，延迟 ${latency}ms`);
    }

    /**
     * @description 记录失败 - 连续失败达到阈值则打开熔断器
     * @param {Error} error - 错误对象
     * @returns {void}
     */
    recordFailure(error) {
        this.failureCount++;
        logger.warn(`[CircuitBreaker] 失败 ${this.failureCount}/${THRESHOLD}: ${error.message}`);

        if (this.failureCount >= THRESHOLD) {
            this.state = 'open';
            this.openAt = Date.now();
            this.breaks++;
            logger.warn(`[CircuitBreaker] 断路器打开！连续 ${this.failureCount} 次失败，暂停 ${COOLDOWN / 1000}s`);
        }
    }

    /**
     * @description 手动设置半开状态
     * @returns {void}
     */
    halfOpen() {
        this.state = 'half-open';
        logger.info('[CircuitBreaker] 断路器半开');
    }

    /**
     * @description 获取熔断器状态
     * @returns {string} 状态（closed/open/half-open）
     */
    getState() {
        return this.state;
    }

    /**
     * @description 获取熔断器详细状态信息
     * @returns {Object} 状态信息，包含 state、failureCount、openAt、cooldownRemaining
     */
    getStateInfo() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            openAt: this.openAt || null,
            cooldownRemaining: this.state === 'open'
                ? Math.max(0, COOLDOWN - (Date.now() - this.openAt))
                : 0
        };
    }
}

module.exports = new CircuitBreaker();