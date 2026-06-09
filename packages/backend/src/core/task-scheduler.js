/**
 * @file task-scheduler.js
 * @description 任务调度器，负责任务入队、优先级管理、命令执行和插件故障恢复
 * @module core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心能力：
 * 1. 自然语言 → 意图澄清 → 任务拆解 → 沙箱执行 → 降级兜底
 * 2. 进度透明：实时推送每个关键节点
 * 3. 意图澄清：模糊指令自动追问（IntentClarifier）
 * 4. 会话连续：重启后可恢复任务进度（SessionStore）
 * 5. 模型降级：三级降级链自动切换（ModelDegradation）
 * 6. 安全沙箱：高风险操作隔离执行（Sandbox）
 * 7. 死循环阻断：重复检测 → 策略切换 → 自动恢复（LoopGuard）
 * 8. 插件故障恢复：崩溃 → 缓冲 → 重启 → 重放（PluginRecovery）
 * 9. 队列管理：任务排队、优先级调整、取消操作
 */

const serviceBus = require('./service-bus');
const pluginLoader = require('./plugin-loader');
const intentClarifier = require('./intent-clarifier');
const sessionStore = require('./session-store');
const modelDegradation = require('./model-degradation');
const sandbox = require('./sandbox');
const loopGuard = require('./loop-guard');
const llmService = require('../services/llm_service');

/** 任务历史最大保留数量，超过此值时清理最早的已完成任务 */
const MAX_TASK_HISTORY = 100;
/** 命令执行超时时间（毫秒） */
const COMMAND_EXECUTION_TIMEOUT = 120000;
/** 插件崩溃后重启等待时间（毫秒），给系统缓冲时间 */
const PLUGIN_RESTART_DELAY = 2000;

class TaskScheduler {
    /**
     * @description 构造函数，初始化任务调度器
     */
    constructor() {
        this.tasks = new Map();
        this.pendingQueue = []; // 任务队列
        this.currentTaskId = null;
        this.maxHistory = MAX_TASK_HISTORY;
        this._initialized = false;
    }

    /**
     * @description 初始化任务调度器，加载会话存储和降级管理器
     */
    async init() {
        if (this._initialized) return;

        await sessionStore.init();
        modelDegradation.init();

        this._subscribeEvents();
        this._initialized = true;
        console.log('[TaskScheduler] Phase 3 初始化完成');
    }

    // ============================================================
    // 队列管理：任务入队、优先级调整、取消和查询
    // ============================================================

    /**
     * 入队任务
     * @param {Object} task - 任务对象 { command, type, priority, userId }
     * @param {string} [userId='legacy'] - 用户标识（也可通过 task.userId 传入）
     * @returns {string} taskId
     */
    enqueue(task, userId) {
        const taskId = this._generateId();
        const effectiveUserId = userId || task.userId || 'legacy';
        const taskItem = {
            id: taskId,
            userId: effectiveUserId,
            command: task.command,
            type: task.type || 'general',
            category: task.category || 'workbrain',
            priority: task.priority || 'normal',
            status: 'queued',
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            result: null,
            error: null,
            retryCount: 0
        };

        this.tasks.set(taskId, taskItem);

        // 高优先级插入队列头部
        if (task.priority === 'high') {
            const firstNormalIndex = this.pendingQueue.findIndex(t => t.priority !== 'high');
            if (firstNormalIndex === -1) {
                this.pendingQueue.push(taskId);
            } else {
                this.pendingQueue.splice(firstNormalIndex, 0, taskId);
            }
        } else {
            this.pendingQueue.push(taskId);
        }

        serviceBus.emit('task:queued', this._formatTaskForEvent(taskItem));

        // 自动开始处理队列
        this._processQueue();

        return taskId;
    }

    /**
     * 提高任务优先级
     * @param {string} taskId
     * @param {string} [userId] - 若提供，则仅当任务属于该用户时才允许操作
     */
    prioritize(taskId, userId) {
        const task = this.tasks.get(taskId);
        if (!task) return false;
        if (userId && task.userId !== userId) return false;

        // 从当前位置移除
        const currentIndex = this.pendingQueue.indexOf(taskId);
        if (currentIndex !== -1) {
            this.pendingQueue.splice(currentIndex, 1);
        }

        // 插入到高优先级位置
        const firstNormalIndex = this.pendingQueue.findIndex(id => {
            const t = this.tasks.get(id);
            return t && t.priority !== 'high';
        });

        if (firstNormalIndex === -1) {
            this.pendingQueue.push(taskId);
        } else {
            this.pendingQueue.splice(firstNormalIndex, 0, taskId);
        }

        task.priority = 'high';
        serviceBus.emit('task:priority_changed', { taskId, priority: 'high' });
        return true;
    }

    /**
     * 取消任务
     * @param {string} taskId
     * @param {string} [userId] - 若提供，则仅当任务属于该用户时才允许操作
     */
    cancel(taskId, userId) {
        const task = this.tasks.get(taskId);
        if (!task) return false;
        if (userId && task.userId !== userId) return false;

        // 从队列移除
        const queueIndex = this.pendingQueue.indexOf(taskId);
        if (queueIndex !== -1) {
            this.pendingQueue.splice(queueIndex, 1);
            task.status = 'cancelled';
            task.completedAt = Date.now();
            serviceBus.emit('task:cancelled', this._formatTaskForEvent(task));
            return true;
        }

        // 如果是当前执行的任务，中断它
        if (this.currentTaskId === taskId) {
            this.abort(taskId);
            return true;
        }

        return false;
    }

    /**
     * 中断任务执行
     */
    abort(taskId) {
        const task = this.tasks.get(taskId);
        if (task) {
            task.status = 'aborted';
            task.completedAt = Date.now();
            serviceBus.publish('task:aborted', { taskId });
        }
    }

    /**
     * 获取任务列表
     * @param {string} [filter='all'] - 过滤条件：all, running, completed, failed, queued
     * @param {string} [userId] - 若提供，则只返回该用户的任务
     */
    getTasks(filter = 'all', userId) {
        let allTasks = Array.from(this.tasks.values());
        if (userId) {
            allTasks = allTasks.filter(t => t.userId === userId);
        }

        switch (filter) {
            case 'running':
                return allTasks.filter(t => t.status === 'running' || t.status === 'queued');
            case 'completed':
                return allTasks.filter(t => t.status === 'completed');
            case 'failed':
                return allTasks.filter(t => t.status === 'failed' || t.status === 'degraded');
            case 'queued':
                return allTasks.filter(t => t.status === 'queued');
            default:
                return allTasks;
        }
    }

    /**
     * 按状态分组获取任务
     * @param {string} [userId] - 若提供，则只返回该用户的任务
     */
    getTasksGrouped(userId) {
        let tasks = Array.from(this.tasks.values());
        if (userId) {
            tasks = tasks.filter(t => t.userId === userId);
        }

        return {
            all: tasks,
            running: tasks.filter(t => t.status === 'running'),
            queued: tasks.filter(t => t.status === 'queued'),
            completed: tasks.filter(t => t.status === 'completed'),
            failed: tasks.filter(t => ['failed', 'degraded'].includes(t.status)),
            cancelled: tasks.filter(t => t.status === 'cancelled')
        };
    }

    /**
     * 获取单个任务
     * @param {string} taskId
     * @param {string} [userId] - 若提供，则仅当任务属于该用户时才返回
     */
    getTaskById(taskId, userId) {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        if (userId && task.userId !== userId) return null;
        return task;
    }

    /**
     * 获取统计信息
     * @param {string} [userId] - 若提供，则只统计该用户的任务
     */
    getStats(userId) {
        let tasks = Array.from(this.tasks.values());
        if (userId) {
            tasks = tasks.filter(t => t.userId === userId);
        }
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        return {
            total: tasks.length,
            running: tasks.filter(t => t.status === 'running').length,
            queued: tasks.filter(t => t.status === 'queued').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => ['failed', 'degraded'].includes(t.status)).length,
            cancelled: tasks.filter(t => t.status === 'cancelled').length,
            todayCompleted: tasks.filter(t =>
                t.status === 'completed' && t.completedAt > oneDayAgo
            ).length,
            todayFailed: tasks.filter(t =>
                (t.status === 'failed' || t.status === 'degraded') && t.completedAt > oneDayAgo
            ).length
        };
    }

    /**
     * 获取队列状态
     */
    getQueueStatus() {
        const currentTask = this.currentTaskId
            ? this.tasks.get(this.currentTaskId)
            : null;

        return {
            currentTask: currentTask ? {
                id: currentTask.id,
                command: currentTask.command,
                type: currentTask.type,
                status: currentTask.status,
                startedAt: currentTask.startedAt,
                duration: currentTask.startedAt ? Date.now() - currentTask.startedAt : 0
            } : null,
            queueLength: this.pendingQueue.length,
            queuedTasks: this.pendingQueue.slice(0, 10).map(id => {
                const t = this.tasks.get(id);
                return t ? {
                    id: t.id,
                    command: t.command,
                    type: t.type,
                    priority: t.priority,
                    status: t.status
                } : null;
            }).filter(Boolean),
            model: modelDegradation.getStatus()
        };
    }

    /**
     * @description 处理队列，取出下一个待执行任务并开始执行
     */
    _processQueue() {
        if (this.currentTaskId) return; // 已有任务在执行

        const nextTaskId = this.pendingQueue.find(id => {
            const t = this.tasks.get(id);
            return t && t.status === 'queued';
        });

        if (!nextTaskId) return;

        this.pendingQueue = this.pendingQueue.filter(id => id !== nextTaskId);
        this.currentTaskId = nextTaskId;

        const task = this.tasks.get(nextTaskId);
        task.status = 'running';
        task.startedAt = Date.now();

        serviceBus.emit('task:started', this._formatTaskForEvent(task));

        // 执行任务（异步，不阻塞）
        this._executeQueuedTask(nextTaskId);
    }

    /**
     * @description 异步执行队列中的任务，完成后调度下一个
     * @param {string} taskId - 任务ID
     */
    async _executeQueuedTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            this.currentTaskId = null;
            this._processQueue();
            return;
        }

        try {
            // 使用简单的方式执行任务命令
            const result = await this._executeCommand(task.command);

            task.status = 'completed';
            task.completedAt = Date.now();
            task.result = result;

            serviceBus.emit('task:completed', {
                id: task.id,
                command: task.command,
                result: result,
                duration: task.completedAt - task.startedAt
            });

        } catch (e) {
            task.status = 'failed';
            task.completedAt = Date.now();
            task.error = e.message;

            serviceBus.emit('task:failed', {
                id: task.id,
                command: task.command,
                error: e.message
            });
        }

        this.currentTaskId = null;
        this._cleanupOldTasks();
        this._processQueue();
    }

    /**
     * @description 执行命令，调用 workBrainClient 处理
     * @param {string} command - 要执行的命令
     * @returns {Promise<string>} 命令执行输出
     */
    async _executeCommand(command) {
        // 简单的命令执行，使用 workBrainClient
        const workBrainClient = require('../services/workBrainClient');
        const result = await workBrainClient.execute(command, { timeout: COMMAND_EXECUTION_TIMEOUT });
        return result.output || '';
    }

    /**
     * @description 格式化任务对象为事件数据
     * @param {Object} task - 任务对象
     * @returns {Object} 格式化后的事件数据
     */
    _formatTaskForEvent(task) {
        return {
            id: task.id,
            userId: task.userId,
            command: task.command,
            type: task.type,
            status: task.status,
            result: task.result,
            error: task.error,
            duration: task.completedAt && task.startedAt
                ? task.completedAt - task.startedAt
                : null
        };
    }

    /**
     * @description 清理超出历史上限的已完成任务
     */
    _cleanupOldTasks() {
        if (this.tasks.size <= this.maxHistory) return;

        const completedTasks = Array.from(this.tasks.entries())
            .filter(([id, t]) => ['completed', 'failed', 'cancelled', 'degraded'].includes(t.status))
            .sort((a, b) => (a[1].completedAt || 0) - (b[1].completedAt || 0));

        const toDelete = completedTasks.slice(0, this.tasks.size - this.maxHistory);
        toDelete.forEach(([id]) => this.tasks.delete(id));
    }

    /**
     * @description 订阅系统事件（沙箱拦截、断路器、死循环、插件崩溃等）
     */
    _subscribeEvents() {
        serviceBus.subscribe('sandbox:blocked', (data) => {
            console.warn(`[TaskScheduler] 沙箱拦截: ${data.capability} - ${data.reason}`);
        });

        serviceBus.subscribe('model:circuit_open', (data) => {
            console.warn(`[TaskScheduler] 模型断路器: ${data.model} (${data.failures}次失败)`);
        });

        serviceBus.subscribe('model:recovered', (data) => {
            console.log(`[TaskScheduler] 模型恢复: ${data.from} → ${data.to}`);
        });

        serviceBus.subscribe('loopguard:detected', (data) => {
            console.warn(`[TaskScheduler] 死循环检测: ${data.key} (${data.retries}次), 切换到 ${data.strategy}`);
        });

        serviceBus.subscribe('loopguard:recovered', (data) => {
            console.log(`[TaskScheduler] 死循环恢复: ${data.key}`);
        });

        serviceBus.subscribe('plugin:crash', (data) => {
            console.warn(`[TaskScheduler] 插件崩溃: ${data.pluginName} - ${data.error}`);
            this._handlePluginCrash(data);
        });
    }

    /**
     * @description 处理插件崩溃事件，尝试卸载、等待后重新加载并重放缓冲请求
     * @param {Object} data - 崩溃事件数据，包含 pluginName 和 error
     */
    async _handlePluginCrash(data) {
        const pluginName = data.pluginName;
        const plugin = pluginLoader.getPlugin(pluginName);
        if (!plugin) return;

        console.log(`[TaskScheduler] 尝试恢复插件: ${pluginName}`);

        try {
            await pluginLoader.unload(pluginName);
            await new Promise(resolve => setTimeout(resolve, PLUGIN_RESTART_DELAY));
            await pluginLoader.load(plugin.dir);
            console.log(`[TaskScheduler] 插件恢复成功: ${pluginName}`);

            const replayed = serviceBus.replayBuffered(`plugin:${pluginName}`);
            if (replayed > 0) {
                console.log(`[TaskScheduler] 重放 ${replayed} 条缓冲请求`);
            }
        } catch (e) {
            console.error(`[TaskScheduler] 插件恢复失败: ${pluginName} - ${e.message}`);
        }
    }

    /**
     * @description 提交新任务，自动进行意图澄清、任务规划和执行
     * @param {string} description - 任务描述（自然语言）
     * @param {Object} [options={}] - 选项
     * @param {string} [options.sessionId] - 会话ID
     * @param {string} [options.userId] - 用户ID
     * @returns {Promise<Object>} 任务结果，包含 taskId、status 和 result/error
     */
    async submit(description, options = {}) {
        const taskId = this._generateId();
        const sessionId = options.sessionId || 'default';
        const userId = options.userId || 'legacy';

        const task = {
            id: taskId,
            userId,
            description,
            status: 'pending',
            steps: [],
            currentStep: 0,
            result: null,
            error: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            sessionId,
            options
        };

        this.tasks.set(taskId, task);
        sessionStore.setActiveTask(sessionId, { taskId, description });

        try {
            task.status = 'planning';
            serviceBus.emitTaskStart(taskId, { description });
            serviceBus.emitProgress(taskId, { status: 'planning', message: '正在理解任务需求...' });

            const plan = await this._plan(description, options);
            task.steps = plan;

            if (plan.length === 1 && plan[0].type === 'clarify') {
                task.status = 'clarifying';
                task.updatedAt = Date.now();
                sessionStore.addMessage(sessionId, 'system', plan[0].question, { type: 'clarification' });
                return {
                    taskId,
                    status: 'clarifying',
                    question: plan[0].question,
                    options: plan[0].options,
                    clarificationId: plan[0].clarificationId
                };
            }

            task.status = 'executing';
            const result = await this._execute(taskId);

            task.status = 'completed';
            task.result = result;
            task.updatedAt = Date.now();
            sessionStore.clearActiveTask(sessionId);
            sessionStore.addMessage(sessionId, 'assistant', JSON.stringify(result), { type: 'task_result' });
            serviceBus.emitTaskComplete(taskId, result);

            return { taskId, status: 'completed', result };
        } catch (e) {
            task.status = 'failed';
            task.error = e.message;
            task.updatedAt = Date.now();
            sessionStore.clearActiveTask(sessionId);
            serviceBus.emitTaskFail(taskId, e);
            return { taskId, status: 'failed', error: e.message };
        }
    }

    /**
     * @description 任务规划，通过意图澄清器分析用户输入并生成执行步骤
     * @param {string} description - 任务描述
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 执行步骤列表
     */
    async _plan(description, options) {
        const steps = [];

        const clarification = intentClarifier.clarify(description, {
            sessionId: options.sessionId
        });

        if (clarification.needsClarification) {
            return [{
                type: 'clarify',
                question: clarification.question,
                options: clarification.options,
                capability: 'chat',
                clarificationId: clarification.clarificationId,
                round: clarification.round
            }];
        }

        const capability = clarification.intent;
        const params = clarification.params || {};

        if (capability && pluginLoader.hasCapability(capability)) {
            steps.push({
                type: 'execute',
                capability,
                params,
                description: this._describeStep(capability, params, description),
                confidence: clarification.confidence
            });
        }

        if (steps.length === 0) {
            steps.push({
                type: 'fallback',
                capability: 'llm',
                params: { prompt: description },
                description: '使用LLM处理'
            });
        }

        return steps;
    }

    /**
     * @description 根据能力和参数生成步骤描述文本
     * @param {string} capability - 能力标识
     * @param {Object} params - 能力参数
     * @param {string} fallback - 默认描述文本
     * @returns {string} 步骤描述
     */
    _describeStep(capability, params, fallback) {
        const descriptions = {
            'news:search': `搜索新闻${params.category ? '：' + params.category : ''}`,
            'weather:query': `查询${params.city || ''}天气`,
            'system:launch_app': `打开应用${params.app_name ? '：' + params.app_name : ''}`,
            'system:play_music': `播放音乐${params.song ? '：' + params.song : ''}`,
            'system:search_web': `搜索：${params.query || ''}`,
            'system:open_url': `打开网址`,
            'browser:execute': `浏览器操作`,
            'llm:complex_task': '处理复杂任务',
            'llm:chat': '对话'
        };
        return descriptions[capability] || fallback;
    }

    /**
     * @description 执行任务的所有步骤，处理死循环检测和沙箱确认
     * @param {string} taskId - 任务ID
     * @returns {Promise<Array>} 各步骤执行结果
     */
    async _execute(taskId) {
        const task = this.tasks.get(taskId);
        const results = [];

        for (let i = 0; i < task.steps.length; i++) {
            const step = task.steps[i];
            task.currentStep = i;
            task.updatedAt = Date.now();

            if (task.status === 'aborted') {
                results.push({ step: i + 1, capability: step.capability, error: 'ABORTED' });
                break;
            }

            serviceBus.emitProgress(taskId, {
                status: 'executing',
                step: i + 1,
                total: task.steps.length,
                message: step.description || `执行步骤 ${i + 1}/${task.steps.length}`
            });

            const loopKey = `${taskId}:${step.capability}`;
            const loopCheck = loopGuard.check(loopKey, { capability: step.capability });

            if (loopCheck.isLooping) {
                serviceBus.emitProgress(taskId, {
                    status: 'loop_detected',
                    message: loopCheck.message
                });

                const fallbackCapability = loopGuard.getFallbackCapability(step.capability);
                if (fallbackCapability) {
                    step.capability = fallbackCapability;
                    step.params = { prompt: `之前的方法行不通，换个思路完成：${task.description}` };
                    step._switched = true;
                } else {
                    step.capability = 'llm:chat';
                    step.params = { prompt: task.description };
                }
            }

            try {
                // 特殊处理：fallback LLM 能力直接调用 llm_service
                if (step.capability === 'llm') {
                    const llmResult = await sandbox.execute(
                        'llm:chat',
                        step.params,
                        async () => {
                            // 使用 generateReply 进行 LLM 调用，skipWorkflow 避免循环路由
                            const result = await llmService.generateReply(
                                step.params.prompt || task.description,
                                '',
                                null,
                                'normal',
                                null,
                                { skipWorkflow: true }
                            );
                            // generateReply 返回 { success, text, ... }，提取文本内容
                            return result.text || result.content || result.message || String(result);
                        },
                        { taskId, confirmed: step._confirmed }
                    );

                    if (llmResult.needsConfirm) {
                        results.push({
                            step: i + 1,
                            capability: step.capability,
                            needsConfirm: true,
                            confirmId: llmResult.confirmId,
                            message: llmResult.message,
                            riskLevel: llmResult.riskLevel
                        });
                        continue;
                    }

                    if (!llmResult.success) {
                        throw new Error(llmResult.error || 'LLM execution failed');
                    }

                    results.push({ step: i + 1, capability: step.capability, result: llmResult.result });
                    continue;
                }

                const sandboxResult = await sandbox.execute(
                    step.capability,
                    step.params,
                    () => pluginLoader.execute(step.capability, step.params),
                    { taskId, confirmed: step._confirmed }
                );

                if (sandboxResult.needsConfirm) {
                    results.push({
                        step: i + 1,
                        capability: step.capability,
                        needsConfirm: true,
                        confirmId: sandboxResult.confirmId,
                        message: sandboxResult.message,
                        riskLevel: sandboxResult.riskLevel
                    });
                    continue;
                }

                if (!sandboxResult.success) {
                    if (sandboxResult.error && sandboxResult.error.includes('SANDBOX_BLOCKED')) {
                        results.push({
                            step: i + 1,
                            capability: step.capability,
                            blocked: true,
                            error: sandboxResult.error,
                            humanMessage: sandboxResult.humanMessage
                        });
                        continue;
                    }
                    throw new Error(sandboxResult.error || 'Sandbox execution failed');
                }

                results.push({ step: i + 1, capability: step.capability, result: sandboxResult.result });
                loopGuard.recordSuccess(loopKey);
            } catch (e) {
                if (step.capability !== 'llm:chat' && !step._degraded) {
                    results.push({ step: i + 1, capability: step.capability, error: e.message });
                } else {
                    throw e;
                }
            }
        }

        return results;
    }

    /**
     * @description 确认高风险操作并继续执行
     * @param {string} taskId - 任务ID
     * @param {number} stepIndex - 步骤索引
     * @param {string} confirmId - 确认ID
     * @returns {Promise<Object>} 确认结果，包含 success 和 result/error
     */
    async confirmAndContinue(taskId, stepIndex, confirmId) {
        const confirmed = sandbox.confirm(confirmId);
        if (!confirmed.success) {
            return { success: false, error: confirmed.error };
        }

        const task = this.tasks.get(taskId);
        if (!task) return { success: false, error: 'Task not found' };

        const step = task.steps[stepIndex];
        if (!step) return { success: false, error: 'Step not found' };

        step._confirmed = true;

        try {
            const result = await pluginLoader.execute(step.capability, step.params);
            return { success: true, result };
        } catch (e) {
            // Confirmation did not complete the plugin call. Keep this as a
            // hard failure so clients do not show a failed continuation as a
            // successfully confirmed task.
            return { success: false, error: e.message };
        }
    }

    /**
     * @description 拒绝高风险操作确认
     * @param {string} confirmId - 确认ID
     * @returns {Object} 拒绝结果
     */
    rejectConfirmation(confirmId) {
        return sandbox.reject(confirmId);
    }

    /**
     * @description 获取指定任务
     * @param {string} taskId - 任务ID
     * @returns {Object|undefined} 任务对象
     */
    getTask(taskId) {
        return this.tasks.get(taskId);
    }

    /**
     * 获取指定用户的所有任务
     * @param {string} userId
     * @returns {Array}
     */
    getTasksByUser(userId) {
        return Array.from(this.tasks.values()).filter(t => t.userId === userId);
    }

    /**
     * @description 中断指定任务的执行
     * @param {string} taskId - 任务ID
     */
    abort(taskId) {
        const task = this.tasks.get(taskId);
        if (task) {
            task.status = 'aborted';
            task.updatedAt = Date.now();
            serviceBus.publish('task:aborted', { taskId });
        }
    }

    /**
     * @description 获取调度器整体状态，包含任务数、模型、沙箱、会话等子系统状态
     * @returns {Object} 调度器状态
     */
    getStatus() {
        return {
            tasks: this.tasks.size,
            model: modelDegradation.getStatus(),
            sandbox: sandbox.getStats(),
            session: sessionStore.getStats(),
            clarifier: intentClarifier.getStats(),
            loopGuard: loopGuard.getStatus()
        };
    }

    /**
     * @description 生成唯一任务ID
     * @returns {string} 任务ID
     */
    _generateId() {
        return `task_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    }
}

module.exports = new TaskScheduler();
