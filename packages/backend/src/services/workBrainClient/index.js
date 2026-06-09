/**
 * @file index.js
 * @description WorkBrainClient 主入口 - 自研工作大脑客户端
 * @module services/workBrainClient
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 三大核心能力：
 * 1. 实时进度回调：executeWithProgress() 流式推送进度
 * 2. 暴力熔断：abort() 立即中断 + 清理 Playwright 浏览器
 * 3. 撞墙兜底：结构化错误码 + 拟人化消息转换
 */

const { logger } = require('../../utils/logger');

// 延迟加载子模块
let _circuitBreaker = null;
let _progressTracker = null;
let _planExecutor = null;
let _errorClassifier = null;

function getCircuitBreaker() {
    if (!_circuitBreaker) _circuitBreaker = require('./circuit_breaker');
    return _circuitBreaker;
}

function getProgressTracker() {
    if (!_progressTracker) _progressTracker = require('./progress_tracker');
    return _progressTracker;
}

function getPlanExecutor() {
    if (!_planExecutor) _planExecutor = require('./plan_executor');
    return _planExecutor;
}

function getErrorClassifier() {
    if (!_errorClassifier) _errorClassifier = require('./error_classifier');
    return _errorClassifier;
}

/** 默认任务超时时间（毫秒） */
const DEFAULT_TIMEOUT = 120000;

class WorkBrainClient {
    constructor(config = {}) {
        this.timeout = config.timeout || DEFAULT_TIMEOUT;

        this.circuitBreaker = getCircuitBreaker();
        this.progressTracker = getProgressTracker();
        this.planExecutor = getPlanExecutor();
        this.errorClassifier = getErrorClassifier();

        this._activeTaskId = null;
        this._aborted = false;
        this._available = true;
        this._lastCheck = 0;

        this._metrics = {
            totalRequests: 0,
            successRequests: 0,
            failedRequests: 0,
            avgLatency: 0,
            lastError: null,
            lastErrorAt: null
        };

        logger.info('[WorkBrain] 工作大脑初始化完成');
    }

    async execute(command, options = {}) {
        if (this.circuitBreaker.isOpen()) {
            throw new Error('WORKBRAIN_CIRCUIT_OPEN');
        }

        const timeout = options.timeout || this.timeout;
        this._aborted = false;
        this._metrics.totalRequests++;
        const startTime = Date.now();

        try {
            const taskPlan = this.planExecutor.parseCommand(command);
            const result = await Promise.race([
                this.planExecutor.executePlan(taskPlan, () => this._aborted),
                this._timeoutPromise(timeout)
            ]);

            if (this._aborted) throw new Error('WORKBRAIN_ABORTED');

            this.circuitBreaker.recordSuccess(Date.now() - startTime);
            this._metrics.successRequests++;

            return {
                success: true,
                output: this.planExecutor.formatResults(taskPlan, result),
                tool_calls: null,
                usage: null,
                model: 'workbrain-local',
                data: result
            };
        } catch (error) {
            return this._handleError(error);
        }
    }

    async executeWithProgress(command, onProgress, options = {}) {
        if (this.circuitBreaker.isOpen()) {
            throw new Error('WORKBRAIN_CIRCUIT_OPEN');
        }

        const timeout = options.timeout || this.timeout;
        this._aborted = false;
        const startTime = Date.now();
        this._metrics.totalRequests++;

        this.progressTracker.start(onProgress, startTime);
        onProgress({ status: 'dispatched', message: '任务已派给工作大脑...', elapsed: 0 });

        try {
            const taskPlan = this.planExecutor.parseCommand(command);
            const result = await Promise.race([
                this.planExecutor.executePlanWithProgress(taskPlan, onProgress, startTime, () => this._aborted),
                this._timeoutPromise(timeout)
            ]);

            if (this._aborted) {
                this.progressTracker.stop();
                throw new Error('WORKBRAIN_ABORTED');
            }

            this.progressTracker.stop();
            this.circuitBreaker.recordSuccess(Date.now() - startTime);
            this._metrics.successRequests++;

            onProgress({ status: 'completed', message: '执行完成！', elapsed: Date.now() - startTime });

            return {
                success: true,
                output: this.planExecutor.formatResults(taskPlan, result),
                elapsed: Date.now() - startTime
            };
        } catch (error) {
            this.progressTracker.stop();
            return this._handleError(error);
        }
    }

    async abort() {
        logger.info('[WorkBrain] 收到中断信号，开始清理...');
        this._aborted = true;
        this.progressTracker.stop();

        try {
            const browserService = require('../browserService');
            await browserService.abort();
            logger.info('[WorkBrain] 已关闭 Playwright 浏览器');
        } catch (e) {
            logger.warn('[WorkBrain] 浏览器清理失败:', e.message);
        }

        logger.info('[WorkBrain] 中断清理完成');
    }

    async browseAndExtract(url, options = {}) {
        const command = `请用浏览器打开这个网页并提取内容：${url}${options.question ? `，回答问题：${options.question}` : ''}`;
        return this.execute(command, { timeout: 60000, ...options });
    }

    async searchAndSummarize(query, options = {}) {
        const command = `请搜索"${query}"，找到相关信息后总结要点，附上来源链接。${options.type === 'news' ? '重点关注最新新闻。' : ''}`;
        return this.execute(command, { timeout: 90000, ...options });
    }

    async healthCheck() {
        const now = Date.now();
        if (this._available !== null && now - this._lastCheck < 30000) {
            return this._available;
        }

        try {
            const { chromium } = require('playwright');
            const browser = await chromium.launch({ headless: true });
            await browser.close();
            this._available = true;
            this._lastCheck = now;

            if (this.circuitBreaker.getState() === 'open') {
                this.circuitBreaker.halfOpen();
            }

            return true;
        } catch (e) {
            logger.warn('[WorkBrain] Playwright 不可用:', e.message);
            this._available = false;
            this._lastCheck = now;
            return false;
        }
    }

    humanizeError(error) {
        return this.errorClassifier.humanize(error);
    }

    getCircuitState() {
        return this.circuitBreaker.getStateInfo();
    }

    getMetrics() {
        return {
            ...this._metrics,
            successRate: this._metrics.totalRequests > 0
                ? (this._metrics.successRequests / this._metrics.totalRequests * 100).toFixed(1) + '%'
                : 'N/A',
            circuitBreaker: this.getCircuitState(),
            available: this._available
        };
    }

    startHealthMonitor(intervalMs = 15000) {
        if (this._healthCheckTimer) return;
        logger.info('[WorkBrain] 启动健康监控');

        this._healthCheckTimer = setInterval(async () => {
            const wasAvailable = this._available;
            this._available = await this.healthCheck();

            if (wasAvailable && !this._available) {
                logger.warn('[WorkBrain] ⚠️ Playwright 不可用！');
            } else if (!wasAvailable && this._available) {
                logger.info('[WorkBrain] ✅ Playwright 恢复了！');
            }
        }, intervalMs);
    }

    stopHealthMonitor() {
        if (this._healthCheckTimer) {
            clearInterval(this._healthCheckTimer);
            this._healthCheckTimer = null;
        }
    }

    _timeoutPromise(ms) {
        return new Promise((_, reject) => setTimeout(() => reject(new Error('WORKBRAIN_TIMEOUT')), ms));
    }

    _handleError(error) {
        if (error.message === 'WORKBRAIN_ABORTED') throw error;
        if (error.message === 'WORKBRAIN_TIMEOUT') {
            this.circuitBreaker.recordFailure(error);
            this._metrics.failedRequests++;
            throw error;
        }

        this.circuitBreaker.recordFailure(error);
        this._metrics.failedRequests++;
        this._metrics.lastError = error.message;
        this._metrics.lastErrorAt = Date.now();

        const classified = this.errorClassifier.classify(error);
        throw new Error(classified);
    }
}

const instance = new WorkBrainClient();
module.exports = instance;
module.exports.WorkBrainClient = WorkBrainClient;