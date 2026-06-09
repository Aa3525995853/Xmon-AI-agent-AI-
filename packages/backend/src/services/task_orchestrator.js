/**
 * @file task_orchestrator.js
 * @description 统一任务编排器，根据任务复杂度路由到不同执行器（模板/调度器/LLM协调器），提供任务状态查询和事件流
 * @module services/task_orchestrator
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

// 延迟加载子模块（避免循环依赖）
let _templateRegistry = null;
let _llmCoordinator = null;
let _toolHandlers = null;
let _recoveryManager = null;
let _taskScheduler = null;
let _llmService = null;

// ============================================================
// 常量配置：任务编排相关参数
// ============================================================

/** 复杂度阈值，分数达到此值路由到 workflow 引擎 */
const COMPLEXITY_THRESHOLD = 3;

/** 复杂任务最大执行步骤数 */
const MAX_STEPS = 8;

/** 复杂任务超时时间（毫秒） */
const TASK_TIMEOUT_MS = 120000;

// ============================================================
// 任务编排器类
// ============================================================

class TaskOrchestrator extends EventEmitter {
    /**
     * @description 构造函数，初始化任务队列和复杂度配置
     */
    constructor() {
        super();

        this._desktopPath = null;
        this._initialized = false;

        // 任务记录
        this.tasks = new Map();
        this.taskQueue = [];

        // 复杂度阈值
        this.COMPLEXITY_THRESHOLD = COMPLEXITY_THRESHOLD;

        // 复杂任务执行的配置
        this.maxSteps = MAX_STEPS;
        this.timeout = TASK_TIMEOUT_MS;
        this.conversationHistory = [];
        this.workDir = this.detectWorkDir();

        // 任务持久化器
        this._taskSnapshot = new Map();
        this._lastWrittenContent = '';

        logger.info('[TaskOrchestrator] 模块化版本已加载');
    }

    // ============ 延迟加载子模块 ============

    /**
     * @description 延迟加载模板注册表子模块
     * @returns {Object} 模板注册表实例
     */
    get templateRegistry() {
        if (!_templateRegistry) {
            _templateRegistry = require('./task_orchestrator/template_registry');
        }
        return _templateRegistry;
    }

    /**
     * @description 延迟加载 LLM 协调器子模块
     * @returns {Object} LLM 协调器实例
     */
    get llmCoordinator() {
        if (!_llmCoordinator) {
            _llmCoordinator = require('./task_orchestrator/llm_coordinator');
        }
        return _llmCoordinator;
    }

    /**
     * @description 延迟加载工具处理器子模块
     * @returns {Object} 工具处理器实例
     */
    get toolHandlers() {
        if (!_toolHandlers) {
            _toolHandlers = require('./task_orchestrator/tool_handlers');
        }
        return _toolHandlers;
    }

    /**
     * @description 延迟加载恢复管理器子模块
     * @returns {Object} 恢复管理器实例
     */
    get recoveryManager() {
        if (!_recoveryManager) {
            _recoveryManager = require('./task_orchestrator/recovery_manager');
        }
        return _recoveryManager;
    }

    /**
     * @description 延迟加载任务调度器子模块
     * @returns {Object} 任务调度器实例
     */
    get taskScheduler() {
        if (!_taskScheduler) {
            _taskScheduler = require('../core/task-scheduler');
        }
        return _taskScheduler;
    }

    /**
     * @description 延迟加载 LLM 服务模块
     * @returns {Object} LLM 服务实例
     */
    get llmService() {
        if (!_llmService) {
            _llmService = require('./llm_service');
        }
        return _llmService;
    }

    // ============ 初始化 ============

    /**
     * @description 初始化编排器，加载任务调度器
     * @returns {Promise<void>}
     */
    async init() {
        if (this._initialized) return;
        if (this.taskScheduler.init) {
            await this.taskScheduler.init();
        }
        this._initialized = true;
        logger.info('[TaskOrchestrator] 初始化完成');
    }

    /**
     * @description 检测用户工作目录，优先 OneDrive 桌面
     * @returns {string} 工作目录路径
     */
    detectWorkDir() {
        const home = os.homedir();
        const candidates = [
            path.join(home, 'OneDrive', 'Desktop'),
            path.join(home, 'OneDrive', '桌面'),
            path.join(home, 'Desktop'),
            path.join(home, '桌面'),
            home
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return home;
    }

    /**
     * @description 获取桌面路径，带缓存
     * @returns {string} 桌面路径
     */
    _getDesktopPath() {
        if (this._desktopPath) return this._desktopPath;
        const home = os.homedir();
        const onedriveDesktop = path.join(home, 'OneDrive', 'Desktop');
        const normalDesktop = path.join(home, 'Desktop');
        if (fs.existsSync(onedriveDesktop)) {
            this._desktopPath = onedriveDesktop;
        } else if (fs.existsSync(normalDesktop)) {
            this._desktopPath = normalDesktop;
        } else {
            this._desktopPath = normalDesktop;
        }
        return this._desktopPath;
    }

    // ============ 复杂度评估 ============

    /**
     * @description 评估任务描述的复杂度，返回分数和原因
     * @param {string} description - 任务描述
     * @returns {Object} 复杂度评估结果，包含 score(1-10) 和 reasons 数组
     */
    assessComplexity(description) {
        const complexityIndicators = {
            high: ['分析', '整理', '批量', '多个', '对比', '统计', '复杂', '详细', '全部', '整个', '生成报告', '转换', '处理', '规划'],
            medium: ['打开', '关闭', '搜索', '查找', '创建', '删除', '移动', '复制', '发送', '设置', '提醒'],
            low: ['今天天气', '现在几点'],
            fileOps: ['桌面', '文件夹', '目录', '文件', '文档', '我的电脑', '此电脑', '下载', '我的文档', 'C盘', 'D盘', 'E盘', '本地', '看看有', '有什么', '查看', '列出', '打开看', '进去看'],
            taskKeywords: ['订', '机票', '航班', '火车票', '酒店', '外卖', '买东西', '购物', '帮我', '替我', '请', '任务', '操作', '执行']
        };

        let score = 1;
        const reasons = [];
        const desc = description.toLowerCase();

        for (const keyword of complexityIndicators.taskKeywords) {
            if (desc.includes(keyword)) {
                score = Math.max(score, 4);
                reasons.push(`任务关键词: "${keyword}"`);
                break;
            }
        }

        for (const keyword of complexityIndicators.fileOps) {
            if (desc.includes(keyword)) {
                score = Math.max(score, 3);
                reasons.push(`文件操作: "${keyword}"`);
                break;
            }
        }

        for (const keyword of complexityIndicators.high) {
            if (desc.includes(keyword)) {
                score += 2;
                reasons.push(`包含"${keyword}"`);
                break;
            }
        }

        for (const keyword of complexityIndicators.medium) {
            if (desc.includes(keyword)) {
                score += 1;
                if (!reasons.some(r => r.includes(keyword))) {
                    reasons.push(`包含"${keyword}"`);
                }
                break;
            }
        }

        if (desc.includes('然后') || desc.includes('接着') || desc.includes('再') || desc.includes('和')) {
            score += 1;
            reasons.push('多步骤操作');
        }

        return { score: Math.min(Math.max(score, 1), 10), reasons };
    }

    // ============ 任务执行入口 ============

    /**
     * @description 任务执行主入口，先尝试模板匹配，再根据复杂度路由到调度器或 LLM 协调器
     * @param {string} description - 任务描述
     * @param {Object} [options={}] - 执行选项
     * @param {string} [options.forceEngine] - 强制指定执行引擎
     * @param {string} [options.sessionId] - 会话ID
     * @returns {Promise<Object>} 执行结果，包含 taskId/engine/status 等
     */
    async execute(description, options = {}) {
        const taskId = this._generateId();
        console.log('[TaskOrchestrator.execute] === 开始执行 ===');
        console.log('[TaskOrchestrator.execute] 任务描述:', description.substring(0, 50));
        console.log('[TaskOrchestrator.execute] forceEngine:', options.forceEngine || '未指定');
        const isPPTTask = /(PPT|幻灯片|pptx)/.test(description);
        const isMultiStepTask = /(搜索|搜一下|查一下).*(?:并|然后|接着|再|同时|写成|保存|生成|整理|分析|总结|报告|文档|早报)/.test(description);

        const template = this.templateRegistry.match(description);
        console.log('[TaskOrchestrator.execute] 模板匹配结果:', template ? template.name : 'null');
        const codeDevTemplates = ['代码开发'];
        if (template && !codeDevTemplates.includes(template.name) && !isMultiStepTask) {
            console.log(`[TaskOrchestrator] 模板匹配成功: ${template.name}`);
            try {
                return {
                    taskId,
                    engine: 'template',
                    template: template.name,
                    status: 'completed',
                    ...await this.templateRegistry.executeTemplate(template, description, options)
                };
            } catch (error) {
                console.error(`[TaskOrchestrator] 模板执行失败: ${template.name}`, error);
            }
        }

        if (isMultiStepTask) {
            console.log(`[TaskOrchestrator] 检测到多步骤任务，使用LLM协调器`);
        }

        // 评估复杂度
        const complexity = this.assessComplexity(description);

        // 确定执行引擎
        let engine = 'scheduler';
        if (options.forceEngine) {
            engine = options.forceEngine;
        } else if (complexity.score >= this.COMPLEXITY_THRESHOLD) {
            engine = 'workflow';
        }

        // 记录任务
        this.tasks.set(taskId, {
            id: taskId,
            description,
            engine,
            status: 'running',
            startTime: Date.now(),
            complexity
        });

        try {
            if (engine === 'workflow') {
                return await this._executeWithWorkflow(taskId, description, options);
            } else {
                return await this._executeWithScheduler(taskId, description, options);
            }
        } catch (error) {
            this.tasks.get(taskId).status = 'failed';
            throw error;
        }
    }

    /**
     * @description 使用任务调度器执行简单任务
     * @param {string} taskId - 任务ID
     * @param {string} description - 任务描述
     * @param {Object} options - 执行选项
     * @returns {Promise<Object>} 执行结果
     */
    async _executeWithScheduler(taskId, description, options) {
        // 使用 TaskScheduler.submit 方法执行简单任务（自然语言描述 → 意图澄清 → 执行）
        const result = await this.taskScheduler.submit(description, {
            ...options,
            sessionId: options.sessionId || 'default'
        });
        // 从 TaskScheduler 返回的步骤结果数组中提取可读文本
        const rawResult = result.result;
        const safeResult = this._extractStepResults(rawResult);
        // 更新本地任务记录状态
        const task = this.tasks.get(taskId);
        if (task) {
            task.status = result.status === 'completed' ? 'completed' : 'failed';
            task.result = safeResult;
            task.error = result.error;
        }
        return {
            taskId,
            engine: 'scheduler',
            status: result.status,
            response: safeResult || (result.error || '任务完成'),
            result: safeResult,
            error: result.error
        };
    }

    /**
     * @description 从 TaskScheduler 返回的步骤结果数组中提取可读文本
     * @param {*} rawResult - 原始结果（可能是数组、对象或字符串）
     * @returns {string} 可读文本结果
     */
    _extractStepResults(rawResult) {
        if (typeof rawResult === 'string') return rawResult;
        if (rawResult == null) return '';

        // 数组格式：[{step, capability, result/error}, ...]
        if (Array.isArray(rawResult)) {
            const parts = [];
            for (const step of rawResult) {
                if (step.error) {
                    parts.push(`步骤${step.step || '?'}失败: ${step.error}`);
                } else if (step.result) {
                    const text = (typeof step.result === 'object')
                        ? (step.result.content || step.result.text || step.result.message || JSON.stringify(step.result))
                        : String(step.result);
                    parts.push(text);
                }
            }
            return parts.filter(Boolean).join('\n') || '';
        }

        // 对象格式
        if (typeof rawResult === 'object') {
            return rawResult.content || rawResult.message || rawResult.text ||
                rawResult.translated || rawResult.summary || JSON.stringify(rawResult);
        }

        return String(rawResult);
    }

    /**
     * @description 使用 LLM 协调器执行复杂任务
     * @param {string} taskId - 任务ID
     * @param {string} description - 任务描述
     * @param {Object} options - 执行选项
     * @returns {Promise<Object>} 执行结果
     */
    async _executeWithWorkflow(taskId, description, options) {
        return await this.llmCoordinator.executeComplexTask(taskId, description, options);
    }

    /**
     * @description 生成唯一任务 ID
     * @returns {string} 任务ID
     */
    _generateId() {
        return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ============ 任务状态查询 ============

    /**
     * @description 获取指定任务的状态
     * @param {string} taskId - 任务ID
     * @returns {Object|null} 任务状态对象，不存在时返回 null
     */
    async getTaskStatus(taskId) {
        return this.tasks.get(taskId) || null;
    }

    // ============ 任务列表（带过滤） ============

    /**
     * @description 获取任务列表，支持按状态过滤
     * @param {string} [filter='all'] - 过滤类型（all/running/completed/failed/pending）
     * @returns {Array<Object>} 任务列表
     */
    getTasks(filter = 'all') {
        const tasks = Array.from(this.tasks.values());
        if (filter === 'all') return tasks;
        if (filter === 'running') return tasks.filter(t => t.status === 'running');
        if (filter === 'completed') return tasks.filter(t => t.status === 'completed');
        if (filter === 'failed') return tasks.filter(t => t.status === 'failed');
        if (filter === 'pending') return tasks.filter(t => t.status === 'pending' || t.status === 'queued');
        return tasks;
    }

    /**
     * @description 获取任务列表（按状态过滤的另一种接口）
     * @param {Object} [filter={}] - 过滤条件
     * @param {string} [filter.status] - 任务状态
     * @returns {Array<Object>} 任务列表
     */
    async listTasks(filter = {}) {
        const tasks = Array.from(this.tasks.values());
        if (filter.status) {
            return tasks.filter(t => t.status === filter.status);
        }
        return tasks;
    }

    // ============ 任务恢复（委托给 recovery_manager）============

    /**
     * @description 恢复指定任务（委托给恢复管理器）
     * @param {string} taskId - 任务ID
     * @returns {Promise<Object>} 恢复结果
     */
    async restoreTask(taskId) {
        return await this.recoveryManager.restoreTask(taskId);
    }

    /**
     * @description 重试指定任务
     * @param {string} taskId - 任务ID
     * @returns {Promise<Object>} 重试结果
     */
    async retryTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return { error: '任务不存在' };
        return await this.execute(task.description, { forceEngine: task.engine });
    }

    /**
     * @description 对需要澄清的任务提供回答并重新执行
     * @param {string} taskId - 任务ID
     * @param {string} answer - 澄清回答
     * @returns {Promise<Object>} 执行结果
     */
    async clarify(taskId, answer) {
        const task = this.tasks.get(taskId);
        if (!task) return { error: '任务不存在' };
        task.context = task.context || {};
        task.context.clarification = answer;
        return await this.execute(task.description + ' ' + answer, { forceEngine: task.engine });
    }

    // ============ 任务分组查询 ============

    /**
     * @description 按状态分组获取任务，附带统计信息
     * @returns {Object} 分组结果，包含 all/running/pending/completed/failed/queued/stats
     */
    getTasksGrouped() {
        const tasks = Array.from(this.tasks.values());
        return {
            all: tasks,
            running: tasks.filter(t => t.status === 'running'),
            pending: tasks.filter(t => t.status === 'pending' || t.status === 'queued'),
            completed: tasks.filter(t => t.status === 'completed'),
            failed: tasks.filter(t => t.status === 'failed'),
            queued: tasks.filter(t => t.status === 'queued' || t.status === 'pending'),
            stats: this.getStats()
        };
    }

    // ============ 任务统计 ============

    /**
     * @description 获取任务统计数据，包含各状态数量、按引擎分组和平均复杂度
     * @returns {Object} 统计对象
     */
    getStats() {
        const tasks = Array.from(this.tasks.values());
        const byEngine = {};
        let complexityTotal = 0;

        for (const task of tasks) {
            const engine = task.engine || 'unknown';
            byEngine[engine] = (byEngine[engine] || 0) + 1;
            complexityTotal += Number(task.complexity?.score || 0);
        }

        return {
            total: tasks.length,
            running: tasks.filter(t => t.status === 'running').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length,
            byEngine,
            avgComplexity: tasks.length ? complexityTotal / tasks.length : 0
        };
    }

    // ============ 按ID获取任务 ============

    /**
     * @description 按ID获取单个任务
     * @param {string} taskId - 任务ID
     * @returns {Object|null} 任务对象，不存在时返回 null
     */
    getTaskById(taskId) {
        return this.tasks.get(taskId) || null;
    }
}

// 导出单例
module.exports = new TaskOrchestrator();
