/**
 * @file work_agent.js
 * @description 工作 Agent - 独立执行任务，推送实时日志
 * @module services/work_agent
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 *
 * 核心职责：
 * 1. 接收任务并执行，不阻塞聊天通道
 * 2. 通过 service-bus 推送实时日志
 * 3. 管理任务生命周期
 *
 * WebSocket 推送事件：
 * - work:log - 实时日志（前端工作区显示）
 * - task:queued - 任务排队
 * - task:started - 任务开始
 * - task:step_progress - 步骤进度
 * - task:completed - 任务完成
 * - task:failed - 任务失败
 */

const serviceBus = require('../core/service-bus');
const { logger } = require('../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** 最大并发任务数，超过此数量的任务需排队等待 */
const MAX_CONCURRENT_TASKS = 3;

/** 任务描述截断长度，用于日志展示 */
const TASK_DESC_LOG_LEN = 30;

/** 任务ID随机部分长度 */
const TASK_ID_RANDOM_LEN = 6;

// ============================================================
// WorkAgent 类
// ============================================================

class WorkAgent {
    constructor() {
        // 任务存储
        this.tasks = new Map();
        // 最大任务数
        this.maxConcurrentTasks = MAX_CONCURRENT_TASKS;
        // task_orchestrator 延迟加载
        this._taskOrchestrator = null;
    }

    /**
     * 获取任务编排器（延迟加载）
     * 避免模块循环依赖，在首次使用时才加载 task_orchestrator
     * @returns {object|null} 任务编排器实例，加载失败返回 null
     */
    _getOrchestrator() {
        if (!this._taskOrchestrator) {
            try {
                this._taskOrchestrator = require('./task_orchestrator');
                logger.info('[WorkAgent] task_orchestrator 加载成功');
            } catch (err) {
                logger.error('[WorkAgent] task_orchestrator 加载失败:', err.message);
                return null;
            }
        }
        return this._taskOrchestrator;
    }

    /**
     * 执行任务
     * 创建任务记录并异步执行，立即返回任务ID和状态
     * @param {string} taskDescription - 任务描述
     * @param {object} context - 额外上下文
     * @returns {Promise<{taskId: string, status: string}>} 任务ID和运行状态
     * @throws {Error} 当任务创建失败时抛出异常
     */
    async executeTask(taskDescription, context = {}) {
        const taskId = this._generateTaskId();
        const startTime = Date.now();
        logger.info(`[WorkAgent] executeTask 开始: ${taskId}`);

        // 记录任务
        const task = {
            id: taskId,
            description: taskDescription,
            context,
            status: 'running',
            startTime,
            progress: 0,
            logs: []
        };
        this.tasks.set(taskId, task);

        // 推送任务开始事件
        this._emit('task:started', {
            taskId,
            command: taskDescription,
            status: 'running'
        });

        // 推送初始日志
        this._emitLog(taskId, `📋 收到任务: ${taskDescription.substring(0, TASK_DESC_LOG_LEN)}...`, 'info', { category: 'intent' });

        // 异步执行任务，不阻塞
        this._executeTaskAsync(taskId, taskDescription, context).catch(err => {
            logger.error(`[WorkAgent] 任务执行异常: ${err.message}`);
        });

        logger.info(`[WorkAgent] executeTask 返回: ${taskId}, 耗时: ${Date.now() - startTime}ms`);
        return {
            taskId,
            status: 'running'
        };
    }

    /**
     * 异步执行任务
     * 调用任务编排器执行任务，处理成功/失败/异常三种情况
     * @private
     * @param {string} taskId - 任务ID
     * @param {string} taskDescription - 任务描述
     * @param {object} context - 额外上下文
     * @returns {Promise<void>} 无返回值
     * @throws {Error} 当任务编排器执行异常时通过事件通知，不向上抛出
     */
    async _executeTaskAsync(taskId, taskDescription, context) {
        const startTime = Date.now();
        logger.info(`[WorkAgent] _executeTaskAsync 开始: ${taskId}`);
        const task = this.tasks.get(taskId);
        if (!task) return;

        try {
            // 推送理解意图日志
            this._emitLog(taskId, '🔍 正在理解意图...', 'info', { category: 'intent' });

            // 获取任务编排器
            logger.info(`[WorkAgent] 获取 orchestrator: ${taskId}`);
            const orchestrator = this._getOrchestrator();
            logger.info(`[WorkAgent] orchestrator 获取完成: ${taskId}, 结果: ${orchestrator ? '成功' : '失败'}`);

            if (!orchestrator) {
                // The work panel is user-facing. If the orchestrator cannot be
                // loaded, no real task has run, so this must fail loudly instead
                // of falling back to a simulated "completed" state.
                throw new Error('任务编排器不可用，无法执行真实任务');
            } else {
                // 正常执行
                logger.info(`[WorkAgent] 开始执行任务: ${taskId}`);

                const result = await orchestrator.execute(taskDescription, {
                    ...context,
                    taskId
                });

                logger.info(`[WorkAgent] 任务执行完成: ${taskId}, 状态: ${result.status}, 耗时: ${Date.now() - startTime}ms`);

                // 更新任务状态
                task.status = result.status || 'completed';
                // 记录执行引擎，用于前端和测试识别 agent 路由
                task.engine = result.engine || 'unknown';
                // 记录模板名称（如果是模板匹配的任务）
                if (result.template) {
                    task.template = result.template;
                }
                // 确保 result 为字符串，避免前端显示 [object Object]
                const rawResult = result.result || result.response;
                task.result = this._extractReadableResult(rawResult);
                task.endTime = Date.now();
                task.duration = task.endTime - task.startTime;
                task.progress = 100;

                if (result.status === 'completed' || result.status === 'done') {
                    this._emitLog(taskId, `✅ 任务完成! 耗时 ${task.duration}ms`, 'success', { category: 'result' });
                    this._emit('task:completed', {
                        taskId,
                        command: taskDescription,
                        status: 'completed',
                        result: task.result,
                        duration: task.duration
                    });
                } else if (result.status === 'failed' || result.error) {
                    const errorMsg = result.error || result.response || '未知错误';
                    this._emitLog(taskId, `❌ 任务失败: ${errorMsg}`, 'error', { category: 'error' });
                    this._emit('task:failed', {
                        taskId,
                        command: taskDescription,
                        status: 'failed',
                        error: errorMsg
                    });
                } else {
                    this._emitLog(taskId, `📋 任务状态: ${result.status}`, 'info', { category: 'info' });
                    this._emit('task:completed', {
                        taskId,
                        command: taskDescription,
                        status: result.status,
                        result: task.result
                    });
                }
            }
        } catch (error) {
            task.status = 'failed';
            task.error = error.message;
            task.endTime = Date.now();
            task.duration = task.endTime - task.startTime;

            this._emitLog(taskId, `❌ 执行异常: ${error.message}`, 'error', { category: 'error' });
            this._emit('task:failed', {
                taskId,
                command: taskDescription,
                status: 'failed',
                error: error.message
            });
        }
    }

    /**
     * 简化执行（当 orchestrator 不可用时）
     * 保留兼容入口，但不能把未执行的真实任务标记为成功。
     * @private
     * @param {string} taskId - 任务ID
     * @param {string} taskDescription - 任务描述
     * @returns {Promise<void>} 无返回值
     */
    async _simpleExecute(taskId, taskDescription) {
        const task = this.tasks.get(taskId);
        if (!task) return;

        const error = '任务编排器不可用，简化模式不会执行真实任务';
        this._emitLog(taskId, `❌ ${error}`, 'error', { category: 'error' });

        task.status = 'failed';
        task.error = error;
        task.endTime = Date.now();
        task.duration = task.endTime - task.startTime;
        task.progress = 0;

        this._emit('task:failed', {
            taskId,
            command: taskDescription,
            status: 'failed',
            error
        });
    }

    /**
     * 获取任务状态
     * @param {string} taskId - 任务ID
     * @returns {object|null} 任务对象，不存在时返回 null
     */
    getTaskStatus(taskId) {
        return this.tasks.get(taskId) || null;
    }

    /**
     * 获取所有任务
     * @returns {Array<object>} 任务列表，每个对象包含 id、description、status、startTime、duration、progress
     */
    getAllTasks() {
        return Array.from(this.tasks.values()).map(task => ({
            id: task.id,
            description: task.description,
            status: task.status,
            startTime: task.startTime,
            duration: task.duration,
            progress: task.progress
        }));
    }

    /**
     * 取消任务
     * @param {string} taskId - 任务ID
     * @returns {Promise<{success: boolean, error?: string, taskId?: string}>} 取消结果
     */
    async cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return { success: false, error: '任务不存在' };
        }

        if (task.status === 'completed' || task.status === 'failed') {
            return { success: false, error: '任务已结束，无法取消' };
        }

        task.status = 'cancelled';
        task.endTime = Date.now();
        task.duration = task.endTime - task.startTime;

        this._emitLog(taskId, '🚫 任务已取消', 'warn', { category: 'info' });
        this._emit('task:cancelled', {
            taskId,
            command: task.description,
            status: 'cancelled'
        });

        return { success: true, taskId };
    }

    /**
     * 推送日志到 WebSocket
     * 同时记录到任务内部日志列表，并通过 serviceBus 广播
     * @private
     * @param {string} taskId - 任务ID
     * @param {string} message - 日志消息
     * @param {string} level - 日志级别（info/warn/error/success）
     * @param {object} extras - 额外字段（如 category、success 等）
     * @returns {void}
     */
    _emitLog(taskId, message, level, extras = {}) {
        const logEntry = {
            taskId,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            message,
            level,
            userId: 'legacy',  // 默认用户ID，确保广播到所有客户端
            ...extras
        };

        const task = this.tasks.get(taskId);
        if (task) {
            task.logs.push(logEntry);
        }

        logger.info(`[WorkAgent] 发布 work:log 事件: ${message.substring(0, TASK_DESC_LOG_LEN)}...`);
        serviceBus.publish('work:log', logEntry);
    }

    /**
     * 推送事件到 WebSocket
     * 通过 serviceBus 发布事件，由 WebSocket 服务转发到前端
     * @private
     * @param {string} event - 事件名称
     * @param {object} data - 事件数据
     * @returns {void}
     */
    _emit(event, data) {
        serviceBus.publish(event, data);
    }

    /**
     * 生成任务ID
     * 格式：work_{时间戳}_{6位随机字符串}
     * @private
     * @returns {string} 唯一任务ID
     */
    _generateTaskId() {
        return 'work_' + Date.now() + '_' + Math.random().toString(36).substr(2, TASK_ID_RANDOM_LEN);
    }

    /**
     * @description 从任务编排器返回的原始结果中提取用户可读的文本内容
     *              处理多种返回格式：字符串、对象、步骤数组等
     * @param {*} rawResult - 原始结果数据
     * @returns {string} 用户可读的文本结果
     */
    _extractReadableResult(rawResult) {
        // 字符串直接返回
        if (typeof rawResult === 'string') return rawResult;
        if (rawResult == null) return '';

        // 数组格式：TaskScheduler 返回的步骤结果数组
        if (Array.isArray(rawResult)) {
            const parts = [];
            for (const step of rawResult) {
                if (step.error) {
                    parts.push(`步骤${step.step || '?'}失败: ${step.error}`);
                } else if (step.result) {
                    // 递归提取步骤结果中的可读文本
                    parts.push(this._extractReadableResult(step.result));
                }
            }
            return parts.filter(Boolean).join('\n') || JSON.stringify(rawResult);
        }

        // 对象格式：尝试提取常见字段
        if (typeof rawResult === 'object') {
            return rawResult.plan || rawResult.content || rawResult.message || rawResult.text ||
                rawResult.translated || rawResult.summary || rawResult.analysis || rawResult.response ||
                JSON.stringify(rawResult);
        }

        return String(rawResult);
    }
}

// 导出单例
module.exports = new WorkAgent();
