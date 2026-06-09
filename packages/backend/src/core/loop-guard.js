/**
 * @file loop-guard.js
 * @description 死循环阻断器，检测重复调用、强制中断、策略切换和自动恢复
 * @module core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心能力：
 * 1. 重复调用检测：同一操作在时间窗口内超过阈值即判定为循环
 * 2. 强制中断：检测到循环后立即中断当前执行链
 * 3. 策略切换：自动切换到替代策略（降级/换工具/换模型）
 * 4. 自动恢复：冷却期后自动重置，允许重新尝试
 * 5. 智能分析：区分"合理重试"和"死循环"
 */

const serviceBus = require('./service-bus');

/** 默认最大重试次数，超过此值判定为死循环 */
const DEFAULT_MAX_RETRIES = 3;
/** 默认检测时间窗口（毫秒），在此时间内的重复调用计入统计 */
const DEFAULT_WINDOW = 60000;
/** 默认冷却时间（毫秒），死循环被阻断后等待此时间自动恢复 */
const DEFAULT_COOLDOWN = 30000;
/** 能力降级策略映射，定义每个能力被阻断后的替代方案 */
const STRATEGY_FALLBACKS = {
    'browser:execute': ['system:search_web', 'llm:chat'],
    'news:search': ['system:search_web', 'llm:chat'],
    'weather:query': ['llm:chat'],
    'system:launch_app': ['llm:chat'],
    'system:search_web': ['llm:chat'],
    'system:play_music': ['llm:chat'],
    'llm:complex_task': ['llm:chat'],
    'llm:chat': []
};

class LoopGuard {
    /**
     * @description 构造函数，初始化检测参数和统计信息
     * @param {Object} [options={}] - 配置选项
     * @param {number} [options.maxRetries] - 最大重试次数
     * @param {number} [options.window] - 检测时间窗口（毫秒）
     * @param {number} [options.cooldown] - 冷却时间（毫秒）
     */
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
        this.window = options.window || DEFAULT_WINDOW;
        this.cooldown = options.cooldown || DEFAULT_COOLDOWN;
        this._history = new Map();
        this._blocked = new Map();
        this._stats = { detected: 0, recovered: 0, switched: 0, falsePositives: 0 };
    }

    /**
     * @description 检查指定操作是否构成死循环，返回检测结果和建议策略
     * @param {string} key - 操作标识
     * @param {Object} [context={}] - 上下文信息
     * @param {string} [context.capability] - 能力标识
     * @param {boolean} [context.isRetry] - 是否为重试操作
     * @param {string} [context.retryReason] - 重试原因
     * @returns {Object} 检测结果，包含 isLooping、retries、strategy、message 等
     */
    check(key, context = {}) {
        const now = Date.now();

        if (this._blocked.has(key)) {
            const blocked = this._blocked.get(key);
            if (now - blocked.blockedAt < this.cooldown) {
                return {
                    isLooping: true,
                    retries: blocked.retries,
                    strategy: blocked.strategy,
                    message: `检测到重复操作(${blocked.retries}次)，已切换策略`,
                    cooldownRemaining: this.cooldown - (now - blocked.blockedAt)
                };
            }
            this._blocked.delete(key);
            this._stats.recovered++;
            serviceBus.publish('loopguard:recovered', { key, timestamp: now });
        }

        if (!this._history.has(key)) {
            this._history.set(key, []);
        }

        const history = this._history.get(key);
        history.push({ timestamp: now, context });

        const recent = history.filter(h => now - h.timestamp < this.window);
        this._history.set(key, recent);

        if (recent.length >= this.maxRetries) {
            const isLegitimateRetry = this._isLegitimateRetry(recent, context);

            if (isLegitimateRetry) {
                this._stats.falsePositives++;
                return { isLooping: false, retries: recent.length };
            }

            this._stats.detected++;
            const strategy = this._getFallbackStrategy(key, context);

            this._blocked.set(key, {
                blockedAt: now,
                retries: recent.length,
                strategy,
                originalKey: key
            });

            serviceBus.publish('loopguard:detected', {
                key,
                retries: recent.length,
                strategy,
                timestamp: now
            });

            return {
                isLooping: true,
                retries: recent.length,
                strategy,
                message: `检测到重复操作(${recent.length}次)，切换到${strategy || '降级策略'}`,
                cooldownRemaining: this.cooldown
            };
        }

        return { isLooping: false, retries: recent.length };
    }

    /**
     * @description 获取指定能力的降级替代能力
     * @param {string} originalCapability - 原始能力标识
     * @returns {string|null} 替代能力标识，无替代时返回 null
     */
    getFallbackCapability(originalCapability) {
        const key = originalCapability;
        if (this._blocked.has(key)) {
            return this._blocked.get(key).strategy;
        }
        return STRATEGY_FALLBACKS[originalCapability]?.[0] || null;
    }

    /**
     * @description 记录操作成功，清除该操作的历史和阻断状态
     * @param {string} key - 操作标识
     */
    recordSuccess(key) {
        if (this._history.has(key)) {
            this._history.delete(key);
        }
        if (this._blocked.has(key)) {
            this._blocked.delete(key);
            this._stats.recovered++;
        }
    }

    /**
     * @description 重置指定操作的历史和阻断状态
     * @param {string} key - 操作标识
     */
    reset(key) {
        this._history.delete(key);
        this._blocked.delete(key);
    }

    /**
     * @description 重置所有操作的历史和阻断状态
     */
    resetAll() {
        this._history.clear();
        this._blocked.clear();
    }

    /**
     * @description 判断是否为合理重试（时间间隔较长或超时重试），避免误判
     * @param {Array} history - 操作历史
     * @param {Object} context - 上下文信息
     * @returns {boolean} 是否为合理重试
     */
    _isLegitimateRetry(history, context) {
        if (history.length < 2) return false;

        const lastTwo = history.slice(-2);
        const timeDiff = lastTwo[1].timestamp - lastTwo[0].timestamp;

        if (timeDiff > this.window * 0.5) {
            return true;
        }

        if (context.isRetry && context.retryReason === 'timeout') {
            return history.length < this.maxRetries + 2;
        }

        return false;
    }

    /**
     * @description 获取降级替代策略，优先从映射表查找，兜底返回 llm:chat
     * @param {string} key - 操作标识
     * @param {Object} context - 上下文信息
     * @returns {string} 替代策略能力标识
     */
    _getFallbackStrategy(key, context) {
        const capability = context.capability || key;
        const fallbacks = STRATEGY_FALLBACKS[capability];

        if (fallbacks && fallbacks.length > 0) {
            this._stats.switched++;
            return fallbacks[0];
        }

        return 'llm:chat';
    }

    /**
     * @description 获取死循环阻断器的完整状态
     * @returns {Object} 状态信息，包含活跃阻断、跟踪键、统计和阻断详情
     */
    getStatus() {
        return {
            activeBlocks: this._blocked.size,
            trackedKeys: this._history.size,
            stats: { ...this._stats },
            blockedKeys: Array.from(this._blocked.entries()).map(([key, data]) => ({
                key,
                retries: data.retries,
                strategy: data.strategy,
                blockedAt: data.blockedAt,
                cooldownRemaining: Math.max(0, this.cooldown - (Date.now() - data.blockedAt))
            }))
        };
    }
}

module.exports = new LoopGuard();
