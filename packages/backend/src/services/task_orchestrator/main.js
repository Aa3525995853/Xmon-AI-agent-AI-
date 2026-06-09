/**
 * @file main.js
 * @description TaskOrchestrator 主入口 - 任务编排核心，负责路由决策、复杂度评估和状态管理
 * @module services/task_orchestrator
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块 - 避免循环依赖
// ============================================================
let _templateRegistry = null;
let _llmCoordinator = null;
let _toolHandlers = null;
let _recoveryManager = null;

class TaskOrchestrator extends EventEmitter {
    constructor() {
        super();
        this._desktopPath = null;
        this._taskScheduler = null;
        this._llmService = null;
        this._initialized = false;

        // 任务记录
        this.tasks = new Map();
        this.taskQueue = [];

        // 复杂度阈值 - 超过此值使用 workflow 引擎
        this.COMPLEXITY_THRESHOLD = 3;
        /** 最大执行步骤数 */
        this.maxSteps = 8;
        /** 任务超时时间（毫秒） */
        this.timeout = 120000;
        this.conversationHistory = [];

        // 工作目录
        this.workDir = this.detectWorkDir();
    }

    // ============ 延迟加载子模块 ============
    get templateRegistry() {
        if (!_templateRegistry) {
            _templateRegistry = require('./template_registry');
        }
        return _templateRegistry;
    }

    get llmCoordinator() {
        if (!_llmCoordinator) {
            _llmCoordinator = require('./llm_coordinator');
        }
        return _llmCoordinator;
    }

    get toolHandlers() {
        if (!_toolHandlers) {
            _toolHandlers = require('./tool_handlers');
        }
        return _toolHandlers;
    }

    get recoveryManager() {
        if (!_recoveryManager) {
            _recoveryManager = require('./recovery_manager');
        }
        return _recoveryManager;
    }

    get taskScheduler() {
        if (!this._taskScheduler) {
            this._taskScheduler = require('../../core/task-scheduler');
        }
        return this._taskScheduler;
    }

    get llmService() {
        if (!this._llmService) {
            this._llmService = require('./llm_service');
        }
        return this._llmService;
    }

    // ============ 初始化 ============
    /**
     * @description 初始化任务编排器
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
     * @description 检测用户工作目录，优先使用 OneDrive 桌面
     * @returns {string} 工作目录路径
     */
    detectWorkDir() {
        const os = require('os');
        const path = require('path');
        const home = os.homedir();
        const candidates = [
            path.join(home, 'OneDrive', 'Desktop'),
            path.join(home, 'OneDrive', '桌面'),
            path.join(home, 'Desktop'),
            path.join(home, '桌面'),
            home
        ];
        for (const p of candidates) {
            if (require('fs').existsSync(p)) return p;
        }
        return home;
    }

    /**
     * @description 获取桌面路径（带缓存）
     * @returns {string} 桌面路径
     */
    _getDesktopPath() {
        if (this._desktopPath) return this._desktopPath;
        const os = require('os');
        const path = require('path');
        const home = os.homedir();
        const onedriveDesktop = path.join(home, 'OneDrive', 'Desktop');
        const normalDesktop = path.join(home, 'Desktop');
        if (require('fs').existsSync(onedriveDesktop)) {
            this._desktopPath = onedriveDesktop;
        } else if (require('fs').existsSync(normalDesktop)) {
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
     * @returns {Object} 评估结果，包含 score（1-10）和 reasons 数组
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
     * @description 执行任务 - 依次尝试模板匹配、复杂度评估后路由到对应引擎
     * @param {string} description - 任务描述
     * @param {Object} options - 执行选项，可指定 forceEngine 强制引擎
     * @returns {Promise<Object>} 执行结果
     * @throws {Error} 任务执行失败时抛出异常
     */
    async execute(description, options = {}) {
        const taskId = this._generateId();
        const isPPTTask = /(PPT|幻灯片|pptx)/.test(description);

        // 模板匹配
        const template = this.templateRegistry.match(description);
        console.log(`[TaskOrchestrator.execute] 任务描述: "${description.substring(0, 30)}..."`);
        console.log(`[TaskOrchestrator.execute] 模板匹配结果: ${template ? template.name : 'null'}`);
        if (template) {
            console.log(`[TaskOrchestrator] 模板匹配成功: ${template.name}`);
            try {
                const result = await this.executeFromTemplate(template, taskId, description, options);
                // 如果是PPT生成成功，直接返回
                if (result.pptGenerated) {
                    return {
                        taskId,
                        engine: 'template',
                        template: template.name,
                        response: result.response,
                        filePath: result.filePath,
                        downloadUrl: result.downloadUrl,
                        pptGenerated: true,
                        status: 'completed'
                    };
                }
                return {
                    taskId,
                    engine: 'template',
                    template: template.name,
                    ...result
                };
            } catch (error) {
                console.error(`[TaskOrchestrator] 模板执行失败: ${template.name}`, error);
            }
        }

        // 评估复杂度
        const complexity = this.assessComplexity(description);
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
     * @description 使用调度器引擎执行简单任务
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
        // 更新本地任务记录状态
        const task = this.tasks.get(taskId);
        if (task) {
            task.status = result.status === 'completed' ? 'completed' : 'failed';
            task.result = result.result;
            task.error = result.error;
        }
        return {
            taskId,
            engine: 'scheduler',
            status: result.status,
            response: result.result ? JSON.stringify(result.result) : (result.error || '任务完成'),
            result: result.result,
            error: result.error
        };
    }

    /**
     * @description 使用模板执行任务
     * @param {Object} template - 匹配到的模板
     * @param {string} taskId - 任务ID
     * @param {string} description - 任务描述
     * @param {Object} options - 执行选项
     * @returns {Promise<Object>} 执行结果
     */
    async executeFromTemplate(template, taskId, description, options = {}) {
        // 委托给模板注册表
        return await this.templateRegistry.executeTemplate(template, description, options);
    }

    /**
     * @description 使用 LLM 协调器执行复杂任务
     * @param {string} taskId - 任务ID
     * @param {string} description - 任务描述
     * @param {Object} options - 执行选项
     * @returns {Promise<Object>} 执行结果
     */
    async _executeWithWorkflow(taskId, description, options) {
        // 委托给 LLM 协调器
        return await this.llmCoordinator.executeComplexTask(taskId, description, options);
    }

    /**
     * @description 生成唯一任务ID
     * @returns {string} 格式为 task_{timestamp}_{random} 的ID
     */
    _generateId() {
        return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ============ 任务状态查询 ============
    /**
     * @description 查询任务状态
     * @param {string} taskId - 任务ID
     * @returns {Object|null} 任务状态对象，不存在返回 null
     */
    async getTaskStatus(taskId) {
        return this.tasks.get(taskId) || null;
    }

    /**
     * @description 列出任务，可按状态过滤
     * @param {Object} filter - 过滤条件，支持 status 字段
     * @returns {Promise<Array<Object>>} 任务列表
     */
    async listTasks(filter = {}) {
        const tasks = Array.from(this.tasks.values());
        if (filter.status) {
            return tasks.filter(t => t.status === filter.status);
        }
        return tasks;
    }

    // ============ 任务恢复 ============
    /**
     * @description 恢复中断的任务
     * @param {string} taskId - 任务ID
     * @returns {Promise<Object>} 恢复结果
     */
    async restoreTask(taskId) {
        return await this.recoveryManager.restoreTask(taskId);
    }

    /**
     * @description 重试失败的任务
     * @param {string} taskId - 任务ID
     * @returns {Promise<Object>} 重试结果
     */
    async retryTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) return { error: '任务不存在' };
        return await this.execute(task.description, { forceEngine: task.engine });
    }

    /**
     * @description 澄清任务意图后重新执行
     * @param {string} taskId - 任务ID
     * @param {string} answer - 用户澄清回答
     * @returns {Promise<Object>} 执行结果
     */
    async clarify(taskId, answer) {
        const task = this.tasks.get(taskId);
        if (!task) return { error: '任务不存在' };
        task.context = task.context || {};
        task.context.clarification = answer;
        return await this.execute(task.description + ' ' + answer, { forceEngine: task.engine });
    }

    /**
     * @description 按状态分组获取任务列表
     * @returns {Object} 分组结果，包含 all、running、completed、failed、queued
     */
    getTasksGrouped() {
        const tasks = Array.from(this.tasks.values());
        return {
            all: tasks,
            running: tasks.filter(t => t.status === 'running'),
            completed: tasks.filter(t => t.status === 'completed'),
            failed: tasks.filter(t => t.status === 'failed'),
            queued: tasks.filter(t => t.status === 'queued' || t.status === 'pending')
        };
    }

    /**
     * @description 获取任务统计信息
     * @returns {Object} 统计数据，包含 total、running、completed、failed
     */
    getStats() {
        const tasks = Array.from(this.tasks.values());
        return {
            total: tasks.length,
            running: tasks.filter(t => t.status === 'running').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length
        };
    }
}

module.exports = new TaskOrchestrator();