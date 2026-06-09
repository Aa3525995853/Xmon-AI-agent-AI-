/**
 * @file index.js
 * @description Executor 主入口 - 任务执行引擎，
 *              整合意图理解、知识查询、计划规划、审核确认和任务执行，
 *              提供从输入到交付的完整任务处理流程
 * @module services/executor
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：执行引擎配置
// ============================================================

/** 任务历史最大保留条数 */
const MAX_TASK_HISTORY = 100;

/** 默认 Shell 命令执行超时（毫秒） */
const SHELL_TIMEOUT = 30000;

/** 每步骤估算时间（毫秒） */
const STEP_ESTIMATED_TIME = 5000;

// ============================================================
// 延迟加载子模块：避免循环依赖，按需初始化
// ============================================================
let _intentCore = null;
let _knowledge = null;
let _reviewHub = null;
let _planner = null;
let _healer = null;
let _inputLayer = null;

// ============================================================
// Executor 类：任务执行引擎主类
// ============================================================

class Executor extends EventEmitter {
    /**
     * @description 初始化执行引擎，设置默认配置和状态
     */
    constructor() {
        super();

        this.currentTask = null;
        this.taskHistory = [];

        this.config = {
            autoReview: true,
            reviewTimeout: 60000,
            maxParallelTasks: 3,
            defaultTimeout: 60000,
            learnFromSuccess: true,
            learnFromFailure: true,
            maxRetries: 3,
            retryDelay: 2000
        };

        this._wsBroadcaster = null;
        logger.info('[Executor] 执行引擎初始化完成');
    }

    // ============ 延迟加载子模块 ============

    /** @type {IntentCore} 意图理解核心 */
    get intentCore() {
        if (!_intentCore) _intentCore = require('./intent_core');
        return _intentCore;
    }

    /** @type {Knowledge} 知识管理模块 */
    get knowledge() {
        if (!_knowledge) _knowledge = require('./knowledge');
        return _knowledge;
    }

    /** @type {ReviewHub} 审核中心 */
    get reviewHub() {
        if (!_reviewHub) _reviewHub = require('./review_hub');
        return _reviewHub;
    }

    /** @type {Planner} 任务规划器 */
    get planner() {
        if (!_planner) _planner = require('./planner');
        return _planner;
    }

    /** @type {Object} 恢复器（Healer） */
    get healer() {
        if (!_healer) _healer = require('./healer');
        return _healer;
    }

    /** @type {InputLayer} 输入解析层 */
    get inputLayer() {
        if (!_inputLayer) _inputLayer = require('./input_layer');
        return _inputLayer;
    }

    /**
     * @description 设置 WebSocket 广播器，用于实时推送任务事件
     * @param {Object} broadcaster - WebSocket 广播器实例
     */
    setWsBroadcaster(broadcaster) {
        this._wsBroadcaster = broadcaster;
        if (_reviewHub) _reviewHub.setWsBroadcaster(broadcaster);
        if (_planner) _planner.setWsBroadcaster(broadcaster);
    }

    // ============================================================
    // 主入口：任务执行流程
    // ============================================================

    /**
     * @description 执行任务，完整流程：输入解析→意图理解→知识查询→消歧/确认→计划→执行→交付
     * @param {string|Object} input - 用户输入（文本/URL/文件路径等）
     * @param {Object} [options={}] - 执行选项
     * @returns {Promise<{success: boolean, status: string, taskId: string, result?: Object}>} 执行结果
     */
    async execute(input, options = {}) {
        const startTime = Date.now();
        const taskId = this._generateTaskId();

        logger.info(`[Executor] 开始执行任务: ${taskId}`, {
            input: typeof input === 'string' ? input.substring(0, 50) : 'object'
        });

        this.currentTask = { id: taskId, input, startTime, status: 'running' };
        this._broadcast('task:start', { taskId, input });

        try {
            // 1. 输入解析
            const parsedInput = await this._parseInput(input);

            // 2. 意图理解
            const intent = await this._understandIntent(parsedInput.text, { parsedInput, ...options });

            // 3. 知识查询
            const knowledgeContext = await this._queryKnowledge(intent);

            // 4. 意图补全 + 置信度检查
            if (intent.disambiguation?.needed) {
                return this._handleDisambiguation(taskId, intent, knowledgeContext);
            }

            // 5. 判断执行路径
            if (intent.confidence.level === 'high' && intent.suggestedAction.action === 'execute') {
                return this._planAndExecute(taskId, intent, knowledgeContext, options);
            } else if (intent.suggestedAction.action === 'confirm_first') {
                return this._confirmAndExecute(taskId, intent, knowledgeContext, options);
            } else {
                return this._planAndExecute(taskId, intent, knowledgeContext, options);
            }

        } catch (error) {
            return this._handleExecutionError(taskId, error, options);
        }
    }

    /**
     * @description 解析用户输入，非纯文本输入委托给 InputLayer 处理
     * @param {string|Object} input - 用户输入
     * @returns {Promise<{text: string, parsed: Object|null, type: string}>} 解析结果
     */
    async _parseInput(input) {
        if (typeof input !== 'string' || this._hasSpecialInput(input)) {
            const result = await this.inputLayer.process(input);
            return { text: result.text || input, parsed: result, type: result.type };
        }
        return { text: input, parsed: null, type: 'text' };
    }

    /**
     * @description 检测输入是否为特殊类型（URL 或 data URI），需要 InputLayer 处理
     * @param {*} input - 用户输入
     * @returns {boolean} 是否为特殊输入
     */
    _hasSpecialInput(input) {
        if (typeof input !== 'string') return true;
        return /^https?:\/\//i.test(input) || /^data:/i.test(input);
    }

    /**
     * @description 调用意图理解核心分析用户意图
     * @param {string} text - 解析后的文本输入
     * @param {Object} context - 上下文信息
     * @returns {Promise<Object>} 意图理解结果
     */
    async _understandIntent(text, context) {
        const ic = this.intentCore;
        logger.debug(`[Executor] intentCore type: ${typeof ic}, understand: ${typeof ic.understand}`);
        const result = await ic.understand(text, context);
        logger.debug(`[Executor] intent result: ${JSON.stringify(result).substring(0, 200)}`);
        return result;
    }

    /**
     * @description 查询知识库获取相关上下文，包含记忆检索、意图上下文和用户画像
     * @param {Object} intent - 意图理解结果
     * @returns {Promise<{retrieval: Array, intentContext: Object, profile: Object}>} 知识上下文
     */
    async _queryKnowledge(intent) {
        const queryContext = intent.originalInput;
        const retrieval = this.knowledge.retrieve(queryContext, { maxResults: 5 });
        const intentContext = this.knowledge.buildIntentContext(queryContext);

        return {
            retrieval,
            intentContext,
            profile: this.knowledge.getProfile()
        };
    }

    /**
     * @description 处理意图消歧，返回需要用户澄清的问题和选项
     * @param {string} taskId - 任务 ID
     * @param {Object} intent - 意图对象
     * @param {Object} knowledgeContext - 知识上下文
     * @returns {{success: boolean, status: string, taskId: string, question: string, options: Array}} 消歧结果
     */
    _handleDisambiguation(taskId, intent, knowledgeContext) {
        this._broadcast('task:clarify', {
            taskId,
            question: intent.disambiguation.question,
            options: intent.disambiguation.options,
            intent: intent.intent
        });

        return {
            success: true,
            status: 'clarifying',
            taskId,
            question: intent.disambiguation.question,
            options: intent.disambiguation.options,
            intent: intent.intent
        };
    }

    /**
     * @description 低置信度时请求用户确认意图，通过审核中心创建确认审核
     * @param {string} taskId - 任务 ID
     * @param {Object} intent - 意图对象
     * @param {Object} knowledgeContext - 知识上下文
     * @param {Object} options - 执行选项
     * @returns {Promise<Object>} 确认结果或直接执行结果
     */
    async _confirmAndExecute(taskId, intent, knowledgeContext, options) {
        const targetsStr = (intent.intent?.targets || []).map(t => t.type || t).join(', ') || '';

        const reviewResult = await this.reviewHub.createReview({
            scene: 'plan_review',
            taskId,
            title: '📋 确认任务理解',
            content: `你的意思是：${intent.intent.action} ${targetsStr}？`,
            context: { intent, knowledgeContext },
            options: [
                { id: 'confirm', label: '是的，开始执行', icon: '✓', style: 'primary' },
                { id: 'modify', label: '不完全对', icon: '✏️', style: 'secondary' },
                { id: 'cancel', label: '取消', icon: '❌', style: 'ghost' }
            ]
        });

        if (!reviewResult.requiresResponse) {
            return this._planAndExecute(taskId, intent, knowledgeContext, options);
        }

        return {
            success: true,
            status: 'awaiting_confirmation',
            taskId,
            reviewId: reviewResult.reviewId,
            message: '请确认你的意图'
        };
    }

    /**
     * @description 生成执行计划并执行，包含计划审核步骤
     * @param {string} taskId - 任务 ID
     * @param {Object} intent - 意图对象
     * @param {Object} knowledgeContext - 知识上下文
     * @param {Object} options - 执行选项
     * @returns {Promise<Object>} 执行交付结果
     */
    async _planAndExecute(taskId, intent, knowledgeContext, options) {
        const startTime = Date.now();

        // 生成计划
        const plan = await this.planner.plan(intent.originalInput, {
            intent: intent.intent,
            knowledgeContext,
            ...options
        });

        // 请求计划审核
        const reviewResult = await this.reviewHub.createPlanReview(taskId, plan);

        if (reviewResult.requiresResponse) {
            return {
                success: true,
                status: 'awaiting_plan_approval',
                taskId,
                reviewId: reviewResult.reviewId,
                plan,
                message: '请确认执行计划'
            };
        }

        // 执行计划
        const executionResult = await this.planner.execute(plan, {
            executor: this,
            healer: this.healer,
            ...options
        });

        return this._handleDelivery(taskId, executionResult);
    }

    /**
     * @description 处理任务交付，记录历史并广播完成事件
     * @param {string} taskId - 任务 ID
     * @param {Object} executionResult - 执行结果
     * @returns {Promise<{success: boolean, status: string, taskId: string, result: Object, duration: number}>} 交付结果
     */
    async _handleDelivery(taskId, executionResult) {
        const duration = Date.now() - (this.currentTask?.startTime || Date.now());

        this._broadcast('task:complete', { taskId, result: executionResult });

        // 记录任务历史
        this.taskHistory.push({
            id: taskId,
            result: executionResult,
            duration,
            timestamp: Date.now()
        });

        // 保留最近的任务历史，防止内存无限增长
        if (this.taskHistory.length > MAX_TASK_HISTORY) {
            this.taskHistory = this.taskHistory.slice(-MAX_TASK_HISTORY);
        }

        return {
            success: true,
            status: executionResult.status,
            taskId,
            result: executionResult,
            duration
        };
    }

    /**
     * @description 处理执行失败，尝试恢复并从失败中学习
     * @param {string} taskId - 任务 ID
     * @param {Object} plan - 执行计划
     * @param {Object} result - 执行结果
     * @param {Object} intent - 意图对象
     * @returns {Promise<Object>} 失败处理结果
     */
    async _handleExecutionFailure(taskId, plan, result, intent) {
        const failedTasks = result.failedTasks || [];

        // 尝试恢复
        const recovery = await this._tryRecovery(taskId, plan, failedTasks);

        if (recovery.success) {
            return this._handleDelivery(taskId, recovery);
        }

        // 学习失败
        await this._learnFromExecution(intent, result, false);

        return {
            success: false,
            status: 'failed',
            taskId,
            error: result.error,
            failedTasks,
            recoveryAttempts: result.recoveryAttempts || 0
        };
    }

    /**
     * @description 尝试通过 Healer 创建恢复计划并执行
     * @param {string} taskId - 任务 ID
     * @param {Object} plan - 原始执行计划
     * @param {Array} failedTasks - 失败的任务列表
     * @returns {Promise<{success: boolean, result?: Object, error?: string}>} 恢复结果
     */
    async _tryRecovery(taskId, plan, failedTasks) {
        // 调用 Healer 进行恢复
        const recoveryPlan = this.healer.createRecoveryPlan(plan, failedTasks);

        if (!recoveryPlan) {
            return { success: false };
        }

        // 执行恢复计划
        try {
            const result = await this.planner.execute(recoveryPlan);
            return { success: true, result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * @description 为失败动作生成替代方案
     * @param {string} failedAction - 失败的动作名称
     * @returns {string|null} 替代动作名称，无替代返回 null
     */
    _generateAlternativeAction(failedAction) {
        // 生成替代方案
        const alternatives = {
            search: ['browse', 'list'],
            write: ['create'],
            read: ['preview']
        };
        return alternatives[failedAction]?.[0] || null;
    }

    /**
     * @description 处理执行过程中的异常错误
     * @param {string} taskId - 任务 ID
     * @param {Error} error - 异常对象
     * @param {Object} options - 执行选项
     * @returns {{success: boolean, status: string, taskId: string, error: string}} 错误结果
     */
    async _handleExecutionError(taskId, error, options) {
        logger.error(`[Executor] 任务执行失败: ${taskId}`, { error: error.message });

        this._broadcast('task:error', { taskId, error: error.message });

        return {
            success: false,
            status: 'error',
            taskId,
            error: error.message
        };
    }

    /**
     * @description 从执行结果中学习，成功时学习习惯和偏好，失败时记录失败模式
     * @param {Object} intent - 意图对象
     * @param {Object} result - 执行结果
     * @param {boolean} success - 是否成功
     */
    async _learnFromExecution(intent, result, success) {
        if (success && this.config.learnFromSuccess) {
            this.knowledge.learn(intent, result);
        } else if (!success && this.config.learnFromFailure) {
            this.knowledge.learnFromFailure(intent, result);
        }
    }

    // ============================================================
    // 任务执行：具体动作分发
    // ============================================================

    /**
     * @description 执行具体任务动作，分发到对应的执行方法
     * @param {string} action - 动作名称
     * @param {Object} params - 动作参数
     * @param {Object} [context={}] - 执行上下文
     * @returns {Promise<Object>} 执行结果
     */
    async executeTask(action, params, context = {}) {
        switch (action) {
            case 'search':
                return this._executeSearch(params);
            case 'file_read':
                return this._executeFileRead(params);
            case 'file_write':
                return this._executeFileWrite(params);
            case 'file_list':
                return this._executeFileList(params);
            case 'shell':
                return this._executeShell(params);
            case 'excel_analyze':
                return this._executeExcelAnalyze(params);
            case 'email_compose':
                return this._executeEmailCompose(params);
            case 'report_generate':
                return this._executeReportGenerate(params);
            default:
                return this._executeGeneric(action, params);
        }
    }

    /**
     * @description 执行搜索动作
     * @param {Object} params - 搜索参数
     * @param {string} params.query - 搜索关键词
     * @param {string} [params.engine='baidu'] - 搜索引擎
     * @returns {Promise<Object>} 搜索结果
     */
    async _executeSearch(params) {
        const { query, engine = 'baidu' } = params;
        const searchService = require('../enhancedSearchService');
        return await searchService.search(query, engine);
    }

    /**
     * @description 执行文件读取动作
     * @param {Object} params - 文件参数
     * @param {string} params.path - 文件路径
     * @returns {Promise<Object>} 读取结果
     */
    async _executeFileRead(params) {
        const { path } = params;
        const fileTools = require('../system_control/file_tools');
        return await fileTools.readFile(path);
    }

    /**
     * @description 执行文件写入动作
     * @param {Object} params - 文件参数
     * @param {string} params.path - 文件路径
     * @param {string} params.content - 写入内容
     * @returns {Promise<Object>} 写入结果
     */
    async _executeFileWrite(params) {
        const { path, content } = params;
        const fileTools = require('../system_control/file_tools');
        return await fileTools.writeFile(path, content);
    }

    /**
     * @description 执行目录列表动作
     * @param {Object} params - 目录参数
     * @param {string} params.path - 目录路径
     * @returns {Promise<Object>} 目录列表结果
     */
    async _executeFileList(params) {
        const { path } = params;
        const fileTools = require('../system_control/file_tools');
        return await fileTools.listDirectory(path);
    }

    /**
     * @description 执行 Shell 命令
     * @param {Object} params - 命令参数
     * @param {string} params.command - Shell 命令
     * @returns {Promise<{success: boolean, stdout?: string, stderr?: string, error?: string}>} 执行结果
     */
    async _executeShell(params) {
        const { command } = params;
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);

        try {
            const { stdout, stderr } = await execPromise(command, { timeout: SHELL_TIMEOUT });
            return { success: true, stdout, stderr };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * @description 执行 Excel 分析动作
     * @param {Object} params - Excel 参数
     * @param {string} params.path - Excel 文件路径
     * @param {Object} [params.options={}] - 分析选项
     * @returns {Promise<Object>} 分析结果
     */
    async _executeExcelAnalyze(params) {
        const { path, options = {} } = params;
        const excelService = require('../excel_intelligence');
        return await excelService.analyze(path, options);
    }

    /**
     * @description 执行邮件撰写动作
     * @param {Object} params - 邮件参数
     * @param {string} params.to - 收件人
     * @param {string} params.subject - 主题
     * @param {string} params.body - 正文
     * @param {Array} [params.attachments] - 附件
     * @returns {Promise<Object>} 撰写结果
     */
    async _executeEmailCompose(params) {
        const { to, subject, body, attachments } = params;
        const emailService = require('./email_service');
        return await emailService.compose({ to, subject, body, attachments });
    }

    /**
     * @description 执行报告生成动作
     * @param {Object} params - 报告参数
     * @param {string} params.type - 报告类型
     * @param {Object} params.data - 报告数据
     * @param {Object} [params.options={}] - 生成选项
     * @returns {Promise<Object>} 生成结果
     */
    async _executeReportGenerate(params) {
        const { type, data, options = {} } = params;
        const reportService = require('./report_service');
        return await reportService.generate(type, data, options);
    }

    /**
     * @description 处理未知动作，返回失败而非伪造成功，避免隐藏执行器缺失问题
     * @param {string} action - 动作名称
     * @param {Object} params - 动作参数
     * @returns {{success: boolean, action: string, params: Object, error: string}} 失败结果
     */
    async _executeGeneric(action, params) {
        // 未知动作不执行任何操作，返回失败以便调试和发现缺失的执行器
        return {
            success: false,
            action,
            params,
            error: `No real executor is registered for action: ${action}`
        };
    }

    // ============================================================
    // 任务管理：取消、状态查询、消歧响应、审核响应
    // ============================================================

    /**
     * @description 取消指定任务
     * @param {string} taskId - 任务 ID
     * @returns {{success: boolean, taskId: string}} 取消结果
     */
    async cancel(taskId) {
        logger.info(`[Executor] 取消任务: ${taskId}`);
        if (this.currentTask?.id === taskId) {
            this.currentTask.status = 'cancelled';
        }
        this._broadcast('task:cancel', { taskId });
        return { success: true, taskId };
    }

    /**
     * @description 获取指定任务的状态
     * @param {string} taskId - 任务 ID
     * @returns {Object|undefined} 任务状态对象
     */
    getTaskStatus(taskId) {
        if (taskId === this.currentTask?.id) {
            return this.currentTask;
        }
        return this.taskHistory.find(t => t.id === taskId);
    }

    /**
     * @description 响应消歧问题，使用用户回答重新执行任务
     * @param {string} taskId - 任务 ID
     * @param {string} answer - 用户回答
     * @param {Object} [options={}] - 执行选项
     * @returns {Promise<Object>} 重新执行结果
     */
    async respondToClarification(taskId, answer, options = {}) {
        // 重新执行，使用回答
        return this.execute(answer, { ...options, clarification: true });
    }

    /**
     * @description 响应审核请求，委托给审核中心处理
     * @param {string} reviewId - 审核 ID
     * @param {Object} response - 审核响应
     * @returns {Promise<Object>} 审核处理结果
     */
    async respondToReview(reviewId, response) {
        // 处理审核响应
        return this.reviewHub.handleResponse(reviewId, response);
    }

    // ============================================================
    // 辅助方法：广播、任务 ID 生成、统计
    // ============================================================

    /**
     * @description 通过 WebSocket 和 EventEmitter 广播事件
     * @param {string} event - 事件名称
     * @param {Object} data - 事件数据
     */
    _broadcast(event, data) {
        if (this._wsBroadcaster) {
            this._wsBroadcaster.broadcast(event, data);
        }
        this.emit(event, data);
    }

    /**
     * @description 生成唯一的任务 ID
     * @returns {string} 任务 ID（格式：task_时间戳_随机字符串）
     */
    _generateTaskId() {
        return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    getStats() {
        return {
            currentTask: this.currentTask?.id,
            historyCount: this.taskHistory.length,
            config: this.config
        };
    }
}

module.exports = new Executor();
