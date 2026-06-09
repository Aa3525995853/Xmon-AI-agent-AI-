/**
 * @file model-degradation.js
 * @description 模型三级降级管理器，实现自动降级、断路器保护、健康探测和降级事件广播
 * @module core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 降级链：
 * Level 0: DeepSeek V4 Pro（主力模型 - 高质量推理）
 * Level 1: DeepSeek V4 Flash（备用模型 - 快速响应）
 * Level 2: Mimo（兜底模型 - 低延迟闲聊）
 *
 * 核心能力：
 * 1. 自动降级：主模型异常时，备用模型自动接管
 * 2. 断路器保护：连续失败自动熔断，冷却后试探恢复
 * 3. 健康探测：定期检测模型可用性，自动恢复到更高级别
 * 4. 降级事件广播：通过 ServiceBus 通知系统降级状态变化
 * 5. 细粒度控制：不同任务类型可使用不同降级策略
 */

const serviceBus = require('./service-bus');

const DEGRADATION_LEVELS = [
    {
        level: 0,
        name: 'deepseek-v4-pro',
        label: '主力模型',
        envKey: 'KIMI_API_KEY',
        envUrl: 'KIMI_API_URL',
        envModel: 'KIMI_MODEL',
        defaultModel: 'deepseek-v4-pro',
        defaultUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions',
        timeout: 30000,
        maxTokens: 2000,
        temperature: 0.7,
        suitableFor: ['complex_task', 'news:search', 'browser:execute']
    },
    {
        level: 1,
        name: 'deepseek-v4-flash',
        label: '备用模型',
        envKey: 'KIMI_API_KEY',
        envUrl: 'KIMI_API_URL',
        envModel: null,
        defaultModel: 'deepseek-v4-flash',
        defaultUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions',
        timeout: 20000,
        maxTokens: 1500,
        temperature: 0.7,
        suitableFor: ['task', 'news:search', 'weather:query', 'system:search_web']
    },
    {
        level: 2,
        name: 'mimo',
        label: '兜底模型',
        envKey: 'MIMO_API_KEY',
        envUrl: 'MIMO_API_URL',
        envModel: 'MIMO_MODEL',
        defaultModel: 'mimo-v2.5',
        defaultUrl: 'https://api.xiaomimimo.com/v1/chat/completions',
        timeout: 15000,
        maxTokens: 500,
        temperature: 0.9,
        suitableFor: ['chat', 'fallback']
    }
];

/** 断路器触发阈值：连续失败次数达到此值时打开断路器 */
const CIRCUIT_BREAKER_THRESHOLD = 3;
/** 断路器冷却时间（毫秒）：断路器打开后等待此时间再试探恢复 */
const CIRCUIT_BREAKER_COOLDOWN = 60000;
/** 健康检查间隔（毫秒）：定期检测所有模型的可用性 */
const HEALTH_CHECK_INTERVAL = 120000;
/** 恢复探测间隔（毫秒）：当处于降级状态时，定期探测高级别模型是否恢复 */
const RECOVERY_PROBE_INTERVAL = 30000;
/** 恢复探测请求超时时间（毫秒）：探测请求超过此时间视为失败 */
const RECOVERY_PROBE_TIMEOUT = 5000;
/** 恢复探测最大输出 token 数：探测请求只返回极少 token 以节省成本 */
const RECOVERY_PROBE_MAX_TOKENS = 5;

class ModelDegradation {
    /**
     * @description 构造函数，初始化降级管理器状态
     * @param {Object} [options={}] - 配置选项
     */
    constructor(options = {}) {
        this.currentLevel = 0;
        this._circuitBreakers = new Map();
        this._healthStatus = new Map();
        this._stats = {
            totalCalls: 0,
            successCalls: 0,
            failedCalls: 0,
            degradations: 0,
            recoveries: 0,
            circuitBreaks: 0
        };
        this._healthCheckTimer = null;
        this._recoveryTimer = null;

        for (const level of DEGRADATION_LEVELS) {
            const hasConfig = this._hasRequiredConfig(level);
            this._circuitBreakers.set(level.level, {
                failures: 0,
                lastFailure: null,
                state: 'closed',
                openedAt: null
            });
            this._healthStatus.set(level.level, {
                available: hasConfig,
                lastCheck: null,
                latency: null,
                consecutiveSuccesses: 0,
                configError: hasConfig ? null : `Missing ${level.envKey}`
            });
        }
    }

    /**
     * @description 检查指定降级级别是否配置了必需的环境变量
     * @param {Object} level - 降级级别配置对象
     * @returns {boolean} 是否已配置必需的环境变量
     */
    _hasRequiredConfig(level) {
        return Boolean(process.env[level.envKey]);
    }

    /**
     * @description 初始化降级管理器，启动健康检查和恢复探测定时器
     */
    init() {
        this._startHealthCheck();
        this._startRecoveryProbe();
        console.log(`[ModelDegradation] 初始化完成，当前级别: ${this.getCurrentLevel().label}`);
    }

    // ============================================================
    // 核心接口：获取当前降级状态和配置
    // ============================================================

    /**
     * @description 获取当前降级别配置
     * @returns {Object} 当前降级别的配置信息
     */
    getCurrentLevel() {
        return DEGRADATION_LEVELS[this.currentLevel];
    }

    /**
     * @description 获取当前级别的完整调用配置（含 API Key、URL、模型名等）
     * @returns {Object} 当前级别的调用配置
     */
    getCurrentConfig() {
        const level = this.getCurrentLevel();
        return this._buildConfig(level);
    }

    /**
     * @description 获取指定级别的调用配置，级别无效时返回当前级别配置
     * @param {number} level - 降级级别（0-2）
     * @returns {Object} 指定级别的调用配置
     */
    getConfigForLevel(level) {
        if (level < 0 || level >= DEGRADATION_LEVELS.length) {
            return this.getCurrentConfig();
        }
        return this._buildConfig(DEGRADATION_LEVELS[level]);
    }

    /**
     * @description 带降级保护的调用方法，自动在各级别间切换直到成功或全部失败
     * @param {Function} fn - 异步调用函数，接收 (config, level) 参数
     * @param {Object} [options={}] - 调用选项
     * @param {number} [options.preferredLevel] - 优先使用的降级级别
     * @param {string} [options.taskId] - 任务ID，用于进度推送
     * @returns {Promise<*>} 调用结果
     * @throws {Error} 所有模型均不可用时抛出 ALL_MODELS_UNAVAILABLE，全部调用失败时抛出 ALL_MODELS_FAILED
     */
    async callWithDegradation(fn, options = {}) {
        const preferredLevel = options.preferredLevel !== undefined
            ? options.preferredLevel
            : this.currentLevel;

        const startLevel = this._findAvailableLevel(preferredLevel);

        if (startLevel === null) {
            serviceBus.publish('model:all_down', { timestamp: Date.now() });
            throw new Error('ALL_MODELS_UNAVAILABLE: 所有模型均不可用');
        }

        for (let level = startLevel; level < DEGRADATION_LEVELS.length; level++) {
            const levelConfig = DEGRADATION_LEVELS[level];
            if (!this._hasRequiredConfig(levelConfig)) {
                const health = this._healthStatus.get(level);
                health.available = false;
                health.configError = `Missing ${levelConfig.envKey}`;
                continue;
            }

            const cb = this._circuitBreakers.get(level);
            if (cb.state === 'open') {
                if (Date.now() - cb.openedAt < CIRCUIT_BREAKER_COOLDOWN) {
                    continue;
                }
                cb.state = 'half-open';
            }

            const config = this._buildConfig(levelConfig);
            this._stats.totalCalls++;

            try {
                const startTime = Date.now();
                const result = await fn(config, level);
                const latency = Date.now() - startTime;

                this._onSuccess(level, latency);

                if (level < this.currentLevel) {
                    this._upgrade(level);
                }

                return result;
            } catch (e) {
                this._onFailure(level, e);

                if (level < DEGRADATION_LEVELS.length - 1) {
                    serviceBus.emitProgress(options.taskId || 'system', {
                        status: 'degrading',
                        message: `${DEGRADATION_LEVELS[level].label}不可用，切换到${DEGRADATION_LEVELS[level + 1].label}...`
                    });
                    continue;
                }

                throw e;
            }
        }

        throw new Error('ALL_MODELS_FAILED: 所有模型调用失败');
    }

    // ============================================================
    // 断路器：管理各级别的成功/失败状态
    // ============================================================

    /**
     * @description 记录调用成功，重置断路器失败计数并更新健康状态
     * @param {number} level - 降级级别
     * @param {number} latency - 本次调用延迟（毫秒）
     */
    _onSuccess(level, latency) {
        this._stats.successCalls++;
        const cb = this._circuitBreakers.get(level);
        const health = this._healthStatus.get(level);

        cb.failures = 0;
        cb.state = 'closed';
        cb.openedAt = null;

        health.available = true;
        health.lastCheck = Date.now();
        health.latency = latency;
        health.consecutiveSuccesses++;
    }

    /**
     * @description 记录调用失败，累加断路器失败计数，达到阈值时打开断路器
     * @param {number} level - 降级级别
     * @param {Error} error - 错误对象
     */
    _onFailure(level, error) {
        this._stats.failedCalls++;
        const cb = this._circuitBreakers.get(level);
        const health = this._healthStatus.get(level);

        cb.failures++;
        cb.lastFailure = Date.now();
        health.available = false;
        health.consecutiveSuccesses = 0;

        if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
            cb.state = 'open';
            cb.openedAt = Date.now();
            this._stats.circuitBreaks++;

            serviceBus.publish('model:circuit_open', {
                level,
                model: DEGRADATION_LEVELS[level].name,
                failures: cb.failures,
                error: error.message
            });

            console.warn(`[ModelDegradation] 断路器打开: ${DEGRADATION_LEVELS[level].name} (${cb.failures}次失败)`);
        }

        if (level === this.currentLevel) {
            this._downgrade();
        }
    }

    /**
     * @description 执行降级操作，将当前级别降低一级并广播降级事件
     */
    _downgrade() {
        if (this.currentLevel >= DEGRADATION_LEVELS.length - 1) return;

        const from = this.currentLevel;
        this.currentLevel++;
        this._stats.degradations++;

        serviceBus.emitModelDegradation(
            DEGRADATION_LEVELS[from].name,
            DEGRADATION_LEVELS[this.currentLevel].name
        );

        console.warn(`[ModelDegradation] 降级: ${DEGRADATION_LEVELS[from].name} → ${DEGRADATION_LEVELS[this.currentLevel].name}`);
    }

    /**
     * @description 执行升级操作，将当前级别提升到指定级别并广播恢复事件
     * @param {number} targetLevel - 目标降级级别
     */
    _upgrade(targetLevel) {
        const from = this.currentLevel;
        this.currentLevel = targetLevel;
        this._stats.recoveries++;

        serviceBus.publish('model:recovered', {
            from: DEGRADATION_LEVELS[from].name,
            to: DEGRADATION_LEVELS[targetLevel].name
        });

        console.log(`[ModelDegradation] 恢复: ${DEGRADATION_LEVELS[from].name} → ${DEGRADATION_LEVELS[targetLevel].name}`);
    }

    /**
     * @description 从指定级别开始查找第一个可用的降级级别
     * @param {number} preferredLevel - 优先开始的降级级别
     * @returns {number|null} 可用级别编号，无可用级别时返回 null
     */
    _findAvailableLevel(preferredLevel) {
        for (let level = preferredLevel; level < DEGRADATION_LEVELS.length; level++) {
            const levelConfig = DEGRADATION_LEVELS[level];
            const health = this._healthStatus.get(level);
            if (!this._hasRequiredConfig(levelConfig)) {
                // Strict availability guardrail: a model without its API key is
                // not callable. Do not let default URLs/model names make it
                // appear healthy or eligible for degradation fallback.
                health.available = false;
                health.configError = `Missing ${levelConfig.envKey}`;
                continue;
            }

            const cb = this._circuitBreakers.get(level);
            if (cb.state === 'open') {
                if (Date.now() - cb.openedAt >= CIRCUIT_BREAKER_COOLDOWN) {
                    cb.state = 'half-open';
                    return level;
                }
                continue;
            }
            return level;
        }
        return null;
    }

    // ============================================================
    // 健康检查：定期检测模型可用性和恢复探测
    // ============================================================

    /**
     * @description 启动定期健康检查定时器
     */
    _startHealthCheck() {
        this._healthCheckTimer = setInterval(() => {
            this._checkAllModels();
        }, HEALTH_CHECK_INTERVAL);
    }

    /**
     * @description 启动恢复探测定时器，当处于降级状态时定期探测高级别模型
     */
    _startRecoveryProbe() {
        this._recoveryTimer = setInterval(() => {
            if (this.currentLevel > 0) {
                this._probeRecovery();
            }
        }, RECOVERY_PROBE_INTERVAL);
    }

    /**
     * @description 检查所有模型的健康状态，更新断路器半开状态
     */
    async _checkAllModels() {
        for (let level = 0; level < DEGRADATION_LEVELS.length; level++) {
            const levelConfig = DEGRADATION_LEVELS[level];
            const health = this._healthStatus.get(level);
            const cb = this._circuitBreakers.get(level);
            const hasConfig = this._hasRequiredConfig(levelConfig);

            health.available = hasConfig && health.available;
            health.configError = hasConfig ? null : `Missing ${levelConfig.envKey}`;

            if (cb.state === 'open') {
                if (Date.now() - cb.openedAt >= CIRCUIT_BREAKER_COOLDOWN) {
                    cb.state = 'half-open';
                }
            }

            health.lastCheck = Date.now();
        }
    }

    /**
     * @description 探测高级别模型是否已恢复，恢复成功则自动升级
     */
    async _probeRecovery() {
        for (let level = 0; level < this.currentLevel; level++) {
            if (!this._hasRequiredConfig(DEGRADATION_LEVELS[level])) {
                const health = this._healthStatus.get(level);
                health.available = false;
                health.configError = `Missing ${DEGRADATION_LEVELS[level].envKey}`;
                continue;
            }

            const cb = this._circuitBreakers.get(level);

            if (cb.state === 'half-open' || cb.state === 'closed') {
                try {
                    const config = this._buildConfig(DEGRADATION_LEVELS[level]);
                    const startTime = Date.now();

                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), RECOVERY_PROBE_TIMEOUT);

                    const response = await fetch(config.url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${config.apiKey}`
                        },
                        body: JSON.stringify({
                            model: config.model,
                            messages: [{ role: 'user', content: 'ping' }],
                            max_tokens: RECOVERY_PROBE_MAX_TOKENS
                        }),
                        signal: controller.signal
                    });

                    clearTimeout(timeout);

                    if (response.ok) {
                        const latency = Date.now() - startTime;
                        this._onSuccess(level, latency);

                        if (level < this.currentLevel) {
                            this._upgrade(level);
                        }
                        return;
                    }
                } catch (_) {
                    cb.state = 'open';
                    cb.openedAt = Date.now();
                }
            }
        }
    }

    // ============================================================
    // 配置构建：根据环境变量生成各级别调用配置
    // ============================================================

    /**
     * @description 根据降级级别配置和环境变量构建完整的调用配置
     * @param {Object} level - 降级级别配置对象
     * @returns {Object} 包含 model、url、apiKey、timeout 等的完整配置
     */
    _buildConfig(level) {
        return {
            level: level.level,
            name: level.name,
            label: level.label,
            model: level.envModel ? (process.env[level.envModel] || level.defaultModel) : level.defaultModel,
            url: process.env[level.envUrl] || level.defaultUrl,
            apiKey: process.env[level.envKey] || '',
            timeout: level.timeout,
            maxTokens: level.maxTokens,
            temperature: level.temperature,
            suitableFor: level.suitableFor
        };
    }

    // ============================================================
    // 查询接口：获取降级状态、统计信息和手动控制
    // ============================================================

    /**
     * @description 获取完整的降级管理器状态，包含各级别断路器和健康信息
     * @returns {Object} 降级管理器完整状态
     */
    getStatus() {
        return {
            currentLevel: this.currentLevel,
            currentModel: DEGRADATION_LEVELS[this.currentLevel].name,
            currentLabel: DEGRADATION_LEVELS[this.currentLevel].label,
            levels: DEGRADATION_LEVELS.map((level, i) => ({
                level: i,
                name: level.name,
                label: level.label,
                circuitBreaker: { ...this._circuitBreakers.get(i) },
                health: { ...this._healthStatus.get(i) }
            })),
            stats: { ...this._stats }
        };
    }

    /**
     * @description 获取降级统计信息
     * @returns {Object} 统计信息，包含调用次数、降级次数、恢复次数等
     */
    getStats() {
        return { ...this._stats, currentLevel: this.currentLevel };
    }

    /**
     * @description 强制设置当前降级级别（用于手动控制）
     * @param {number} level - 目标降级级别
     */
    forceLevel(level) {
        if (level >= 0 && level < DEGRADATION_LEVELS.length) {
            const from = this.currentLevel;
            this.currentLevel = level;
            serviceBus.emitModelDegradation(
                DEGRADATION_LEVELS[from].name,
                DEGRADATION_LEVELS[level].name
            );
        }
    }

    /**
     * @description 重置指定级别的断路器状态
     * @param {number} level - 降级级别
     */
    resetCircuitBreaker(level) {
        const cb = this._circuitBreakers.get(level);
        if (cb) {
            cb.failures = 0;
            cb.state = 'closed';
            cb.openedAt = null;
        }
    }

    /**
     * @description 销毁降级管理器，清理定时器
     */
    destroy() {
        if (this._healthCheckTimer) clearInterval(this._healthCheckTimer);
        if (this._recoveryTimer) clearInterval(this._recoveryTimer);
    }
}

module.exports = new ModelDegradation();
