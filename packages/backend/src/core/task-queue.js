/**
 * TaskQueue - 异步任务队列管理器
 *
 * 核心职责：
 * 1. 任务状态管理（pending → running → completed/failed）
 * 2. 任务持久化（内存 Map，支持后续 Redis 扩展）
 * 3. 进度事件广播（通过 ServiceBus）
 * 4. 后台执行调度（并发控制）
 * 5. SSE 流推送
 *
 * 架构：
 * ┌─────────────────────────────────────────────────────────┐
 * │                      TaskQueue                          │
 * ├─────────────────────────────────────────────────────────┤
 * │  submit()      → 立即返回 taskId，后台调度执行          │
 * │  getTask()     → 查询任务状态                          │
 * │  subscribe()   → SSE 订阅进度                          │
 * │  cancel()      → 取消任务                              │
 * └─────────────────────────────────────────────────────────┘
 */

const { EventEmitter } = require('events');
const serviceBus = require('./service-bus');

class TaskQueue extends EventEmitter {
    constructor() {
        super();

        // 任务存储
        this.tasks = new Map();

        // 正在执行的任务
        this.executing = new Map();

        // SSE 订阅者
        this.subscribers = new Set();

        // 并发控制
        this.maxConcurrent = 2;

        // 延迟加载（直到第一次需要时才加载）
        this._taskOrchestrator = null;

        // 任务持久化（延迟加载）
        this._taskPersistence = null;

        console.log('[TaskQueue] 异步任务队列初始化完成');
    }

    /**
     * 获取任务持久化服务（延迟加载）
     */
    _getTaskPersistence() {
        if (!this._taskPersistence) {
            try {
                this._taskPersistence = require('../services/task_persistence');
            } catch (e) {
                console.error('[TaskQueue] 加载任务持久化失败:', e.message);
            }
        }
        return this._taskPersistence;
    }

    /**
     * 持久化任务
     */
    _persistTask(taskInfo) {
        const persistence = this._getTaskPersistence();
        if (persistence && typeof persistence.record === 'function') {
            try {
                persistence.record(taskInfo);
            } catch (e) {
                console.error('[TaskQueue] 任务持久化失败:', e.message);
            }
        }
    }

    /**
     * 获取 TaskOrchestrator（延迟加载，避免循环依赖）
     */
    _getTaskOrchestrator() {
        if (!this._taskOrchestrator) {
            this._taskOrchestrator = require('../services/task_orchestrator');
        }
        return this._taskOrchestrator;
    }

    // 初始化
    init() {
        // 订阅 ServiceBus 事件，转发到 SSE
        this._subscribeServiceBus();
        console.log('[TaskQueue] 订阅 ServiceBus 事件');
    }

    /**
     * 订阅 ServiceBus 事件
     * 注意：TaskOrchestrator 通过 this.emit() 发送事件，不会经过 ServiceBus
     * 因此主要的任务完成/失败处理在 _executeTask 中直接进行
     */
    _subscribeServiceBus() {
        serviceBus.subscribe('task:step_progress', (data) => {
            this._handleStepProgress(data);
        });
    }

    /**
     * 处理步骤进度
     */
    _handleStepProgress(data) {
        const taskId = data.taskId;
        const task = this.tasks.get(taskId);

        if (task) {
            task.progress = {
                current: data.currentStep,
                total: data.totalSteps,
                message: data.message,
                status: data.status
            };

            // 广播到 SSE
            this._broadcast('task:progress', {
                taskId,
                currentStep: data.currentStep,
                totalSteps: data.totalSteps,
                message: data.message,
                status: data.status,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 处理任务完成
     */
    _handleTaskComplete(data) {
        const taskId = data.id || data.taskId;
        const task = this.tasks.get(taskId);

        if (task) {
            task.status = 'completed';
            task.completedAt = Date.now();
            task.result = data.result || data;
            task.progress = {
                current: data.currentStep || 0,
                total: data.totalSteps || 0,
                message: '任务已完成',
                status: 'done'
            };

            this.executing.delete(taskId);

            // 广播到 SSE
            this._broadcast('task:complete', {
                taskId,
                status: 'completed',
                result: task.result,
                timestamp: Date.now()
            });

            // 调度下一个任务
            this._scheduleNext();
        }
    }

    /**
     * 处理任务失败
     */
    _handleTaskFail(data) {
        const taskId = data.id || data.taskId;
        const task = this.tasks.get(taskId);

        if (task) {
            task.status = 'failed';
            task.completedAt = Date.now();
            task.error = data.error || data.message || '任务执行失败';
            task.progress = {
                current: 0,
                total: 0,
                message: task.error,
                status: 'failed'
            };

            this.executing.delete(taskId);

            // 广播到 SSE
            this._broadcast('task:failed', {
                taskId,
                status: 'failed',
                error: task.error,
                timestamp: Date.now()
            });

            // 调度下一个任务
            this._scheduleNext();
        }
    }

    /**
     * 提交任务（立即返回 taskId）
     * @param {string} description - 任务描述
     * @param {Object} options - 选项 { sessionId, engine, priority }
     * @returns {string} taskId
     */
    submit(description, options = {}) {
        const taskId = this._generateId();

        // 创建任务记录
        const taskInfo = {
            id: taskId,
            description,
            options,
            engine: options.engine || 'auto',
            sessionId: options.sessionId || 'default',
            status: 'pending',
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            result: null,
            error: null,
            progress: {
                current: 0,
                total: 0,
                message: '任务已提交，等待执行...',
                status: 'pending'
            }
        };

        this.tasks.set(taskId, taskInfo);

        // 持久化任务记录
        this._persistTask(taskInfo);

        // 广播任务已提交
        this._broadcast('task:submitted', {
            taskId,
            status: 'pending',
            message: '任务已提交，正在排队...',
            timestamp: Date.now()
        });

        // 调度执行
        this._scheduleNext();

        return taskId;
    }

    /**
     * 后台调度执行
     */
    _scheduleNext() {
        if (this.executing.size >= this.maxConcurrent) {
            return;
        }

        // 找到第一个 pending 任务
        const pending = Array.from(this.tasks.values())
            .find(t => t.status === 'pending');

        if (pending) {
            this._executeTask(pending);
        }
    }

    /**
     * 异步执行任务
     */
    async _executeTask(task) {
        task.status = 'running';
        task.startedAt = Date.now();
        this.executing.set(task.id, task);

        // 广播任务开始
        this._broadcast('task:started', {
            taskId: task.id,
            status: 'running',
            message: '开始执行任务...',
            timestamp: Date.now()
        });

        console.log(`[TaskQueue] 开始执行任务: ${task.id}`);
        console.log(`[TaskQueue] 任务描述: ${task.description.substring(0, 50)}...`);

        try {
            // 使用 TaskOrchestrator 执行
            const result = await this._getTaskOrchestrator().execute(task.description, {
                ...task.options,
                taskId: task.id
            });

            task.status = 'completed';
            task.result = result;
            task.completedAt = Date.now();
            task.progress = {
                current: result.totalSteps || 0,
                total: result.totalSteps || 0,
                message: '任务已完成',
                status: 'done'
            };

            this.executing.delete(task.id);

            // 持久化任务
            this._persistTask(task);

            // 广播完成
            this._broadcast('task:complete', {
                taskId: task.id,
                status: 'completed',
                result,
                timestamp: Date.now()
            });

            console.log(`[TaskQueue] 任务完成: ${task.id}`);

        } catch (error) {
            task.status = 'failed';
            task.error = error.message;
            task.completedAt = Date.now();
            task.progress = {
                current: 0,
                total: 0,
                message: error.message,
                status: 'failed'
            };

            this.executing.delete(task.id);

            // 持久化失败任务
            this._persistTask(task);

            // 广播失败
            this._broadcast('task:failed', {
                taskId: task.id,
                status: 'failed',
                error: error.message,
                timestamp: Date.now()
            });

            console.error(`[TaskQueue] 任务失败: ${task.id}`, error.message);
        }

        // 调度下一个任务
        this._scheduleNext();
    }

    /**
     * 获取任务
     * @param {string} taskId
     * @returns {Object|null}
     */
    getTask(taskId) {
        return this.tasks.get(taskId) || null;
    }

    /**
     * 获取任务列表
     * @param {string} filter - 过滤条件
     * @returns {Array}
     */
    getTasks(filter = 'all') {
        const tasks = Array.from(this.tasks.values());

        switch (filter) {
            case 'running':
                return tasks.filter(t => t.status === 'running');
            case 'pending':
                return tasks.filter(t => t.status === 'pending');
            case 'completed':
                return tasks.filter(t => t.status === 'completed');
            case 'failed':
                return tasks.filter(t => t.status === 'failed');
            case 'all':
            default:
                return tasks;
        }
    }

    /**
     * 获取任务统计
     */
    getStats() {
        const tasks = Array.from(this.tasks.values());

        return {
            total: tasks.length,
            pending: tasks.filter(t => t.status === 'pending').length,
            running: tasks.filter(t => t.status === 'running').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length,
            executing: this.executing.size
        };
    }

    /**
     * 取消任务
     * @param {string} taskId
     * @returns {Object}
     */
    cancel(taskId) {
        const task = this.tasks.get(taskId);

        if (!task) {
            return { success: false, error: '任务不存在' };
        }

        if (task.status === 'completed' || task.status === 'failed') {
            return { success: false, error: '任务已结束，无法取消' };
        }

        task.status = 'cancelled';
        task.completedAt = Date.now();
        task.error = '用户取消';

        this.executing.delete(taskId);

        // 广播取消
        this._broadcast('task:cancelled', {
            taskId,
            status: 'cancelled',
            timestamp: Date.now()
        });

        // 调度下一个任务
        this._scheduleNext();

        return { success: true };
    }

    /**
     * 删除任务
     * @param {string} taskId
     * @returns {Object}
     */
    delete(taskId) {
        if (!this.tasks.has(taskId)) {
            return { success: false, error: '任务不存在' };
        }

        const task = this.tasks.get(taskId);

        if (task.status === 'running' || task.status === 'pending') {
            return { success: false, error: '正在执行的任务无法删除' };
        }

        this.tasks.delete(taskId);
        return { success: true };
    }

    // ============ SSE 订阅 ============

    /**
     * 订阅 SSE
     * @param {Object} res - Express response 对象
     */
    subscribe(res) {
        this.subscribers.add(res);
        console.log(`[TaskQueue] SSE 订阅者增加，当前: ${this.subscribers.size}`);

        // 发送连接成功事件
        res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
    }

    /**
     * 取消订阅 SSE
     * @param {Object} res - Express response 对象
     */
    unsubscribe(res) {
        this.subscribers.delete(res);
        console.log(`[TaskQueue] SSE 订阅者减少，当前: ${this.subscribers.size}`);
    }

    /**
     * 广播事件到所有 SSE 订阅者
     * @param {string} event - 事件类型
     * @param {Object} data - 数据
     */
    _broadcast(event, data) {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

        for (const res of this.subscribers) {
            try {
                res.write(message);
            } catch (e) {
                // 订阅者已断开，移除
                this.subscribers.delete(res);
            }
        }

        // 同时发布到 ServiceBus
        serviceBus.publish(event, data);
    }

    /**
     * 发送心跳（保持 SSE 连接）
     */
    _sendHeartbeat() {
        this._broadcast('heartbeat', { timestamp: Date.now() });
    }

    /**
     * 生成任务 ID
     */
    _generateId() {
        return `queue_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    }
}

// 单例
const taskQueue = new TaskQueue();
module.exports = taskQueue;
module.exports.TaskQueue = TaskQueue;