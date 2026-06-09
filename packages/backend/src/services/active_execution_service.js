/**
 * @file 主动执行服务（v3.0）
 * @description 从"被动应答"升级到"主动执行"，提供智能定时任务、条件触发、
 *              上下文预判和自动执行能力
 * @module services/active_execution_service
 * @version 3.0.0
 * @date 2026-06-06
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { logger } = require('../utils/logger');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 主动执行服务类
// ============================================================

/**
 * 主动执行服务
 * 提供以下核心能力：
 * 1. 智能定时任务 - 用户说"每天早上8点提醒我"
 * 2. 条件触发 - 当X发生时自动执行Y
 * 3. 上下文预判 - 根据上下文预判用户需求
 * 4. 自动执行 - 无需确认直接执行简单任务
 * @class
 */
class ActiveExecutionService {
    /**
     * 构造函数
     * 初始化任务映射、触发器映射和上下文缓存
     */
    constructor() {
        /** @type {Map<string, Object>} 定时任务映射 */
        this.tasks = new Map();
        /** @type {Map<string, Object>} 条件触发器映射 */
        this.triggers = new Map();
        /** @type {Object} 上下文缓存 */
        this.contextCache = {};
        /** @type {Array} 执行历史记录 */
        this.executionHistory = [];
        /** @type {Object} 用户偏好设置 */
        this.userPreferences = {};

        /** @type {Array} cron 任务引用列表 */
        this.scheduledTasks = [];
        /** @type {NodeJS.Timeout|null} 调度器间隔定时器 */
        this.schedulerInterval = null;
        /** @type {boolean} 服务是否启用 */
        this.enabled = true;

        this.loadTasks();
        this.startScheduler();

        logger.info('[主动执行] v3.0 初始化完成');
    }

    // ==================== 数据持久化 ====================

    /**
     * 获取数据文件路径
     * @private
     * @returns {string} 数据文件完整路径
     */
    _getDataPath() {
        const dataFilePath = dataPath('active_execution.json');
        const dataDir = path.dirname(dataFilePath);
        ensureDir(dataDir);
        return dataFilePath;
    }

    /**
     * 从磁盘加载任务和触发器数据
     */
    loadTasks() {
        try {
            const dataFilePath = this._getDataPath();
            if (fs.existsSync(dataFilePath)) {
                const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
                this.tasks = new Map(Object.entries(data.tasks || {}));
                this.triggers = new Map(Object.entries(data.triggers || {}));
                this.userPreferences = data.userPreferences || {};
            }
        } catch (e) {
            logger.error('[主动执行] 加载任务失败:', e.message);
        }
    }

    /**
     * 将任务和触发器数据保存到磁盘
     */
    saveTasks() {
        try {
            const data = {
                tasks: Object.fromEntries(this.tasks),
                triggers: Object.fromEntries(this.triggers),
                userPreferences: this.userPreferences
            };
            fs.writeFileSync(this._getDataPath(), JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            logger.error('[主动执行] 保存任务失败:', e.message);
        }
    }

    // ==================== 定时任务 ====================

    /**
     * 创建定时任务
     * @param {Object} task - 任务配置
     * @returns {string} 任务ID
     */
    createTask(task) {
        const taskId = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const fullTask = {
            id: taskId,
            name: task.name || '未命名任务',
            schedule: task.schedule,           // cron 表达式
            action: task.action,               // 执行的动作
            params: task.params || {},        // 动作参数
            enabled: task.enabled !== false,
            createdAt: new Date().toISOString(),
            lastRun: null,
            runCount: 0,
            autoExecute: task.autoExecute || false  // 是否自动执行
        };

        this.tasks.set(taskId, fullTask);

        if (fullTask.enabled && fullTask.schedule) {
            this._scheduleTask(fullTask);
        }

        this.saveTasks();
        return taskId;
    }

    /**
     * 创建智能定时任务（从自然语言）
     */
    createTaskFromNaturalLanguage(naturalText) {
        // 解析自然语言时间表达
        const schedule = this._parseNaturalLanguageSchedule(naturalText);
        if (!schedule) {
            return { success: false, message: '无法解析时间表达式' };
        }

        // 提取动作类型
        const action = this._parseAction(naturalText);

        const task = {
            name: naturalText,
            schedule,
            action: action.type,
            params: action.params,
            autoExecute: action.autoExecute
        };

        const taskId = this.createTask(task);
        return { success: true, taskId, message: `已创建任务: ${naturalText}` };
    }

    _parseNaturalLanguageSchedule(text) {
        // 早上的英文
        if (/每天早上\s*\d+/.test(text) || /every\s+morning\s+at\s+\d+/.test(text)) {
            const match = text.match(/\d+/);
            if (match) return `${match[0]} * * *`;
        }
        // 每天几点
        if (/每天\s*\d+/.test(text) || /every\s+day\s+at\s+\d+/.test(text)) {
            const match = text.match(/\d+/);
            if (match) return `${match[0]} * * *`;
        }
        // 每周几
        if (/每周[一二三四五六日天]/.test(text)) {
            const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
            for (const [key, value] of Object.entries(dayMap)) {
                if (text.includes(key)) return `0 9 * * ${value}`;
            }
        }
        // 工作日早上9点
        if (/工作日\s*9/.test(text) || /weekdays\s+9/.test(text)) {
            return '0 9 * * 1-5';
        }
        // 默认：每天早上8点
        if (/每天/.test(text) || /every\s+day/.test(text)) {
            return '0 8 * * *';
        }
        // 每小时
        if (/每小时/.test(text) || /every\s+hour/.test(text)) {
            return '0 * * * *';
        }
        // 每30分钟
        if (/每30分钟/.test(text) || /every\s+30\s+minutes/.test(text)) {
            return '*/30 * * * *';
        }

        return null;
    }

    _parseAction(text) {
        if (/提醒我/.test(text) || /remind me/.test(text) || /提醒/.test(text)) {
            return { type: 'reminder', params: { message: text }, autoExecute: false };
        }
        if (/播放音乐/.test(text) || /播放歌/.test(text)) {
            return { type: 'play_music', params: { keyword: this._extractKeyword(text) }, autoExecute: true };
        }
        if (/打开.*微信/.test(text) || /open.*wechat/.test(text)) {
            return { type: 'activate_window', params: { app_name: '微信' }, autoExecute: true };
        }
        if (/发送.*消息/.test(text) || /send.*message/.test(text)) {
            return { type: 'send_message', params: {}, autoExecute: true };
        }
        if (/总结/.test(text) || /summarize/.test(text)) {
            return { type: 'digest', params: {}, autoExecute: true };
        }
        // 默认：通用提醒
        return { type: 'notification', params: { message: text }, autoExecute: false };
    }

    _extractKeyword(text) {
        // 提取关键词
        const match = text.match(/播放.*(.+)/);
        return match ? match[1].trim() : '轻音乐';
    }

    _scheduleTask(task) {
        try {
            if (!cron.validate(task.schedule)) {
                logger.warn(`[主动执行] 无效的 cron 表达式: ${task.schedule}`);
                return;
            }

            const cronTask = cron.schedule(task.schedule, async () => {
                await this._executeTask(task);
            }, {
                scheduled: true,
                timezone: 'Asia/Shanghai'
            });

            this.scheduledTasks.push({ id: task.id, job: cronTask });
            logger.info(`[主动执行] 任务已调度: ${task.name} (${task.schedule})`);

        } catch (e) {
            logger.error(`[主动执行] 调度任务失败: ${task.name}`, e.message);
        }
    }

    async _executeTask(task) {
        logger.info(`[主动执行] 执行任务: ${task.name}`);

        try {
            // 获取执行器
            const appAutomation = require('../appAutomation');

            // 检查是否需要自动执行
            if (!task.autoExecute) {
                // 需要确认的任务只记录，不执行
                this.contextCache[`pending_${task.id}`] = {
                    task,
                    timestamp: Date.now(),
                    message: `即将执行: ${task.name}`
                };
                return;
            }

            // 自动执行
            const result = await appAutomation.execute('网易云音乐', task.action, task.params);

            // 记录执行结果
            task.lastRun = new Date().toISOString();
            task.runCount++;
            this.tasks.set(task.id, task);

            this.executionHistory.push({
                taskId: task.id,
                taskName: task.name,
                timestamp: new Date().toISOString(),
                success: result.success,
                result: result.message
            });

            // 保持历史记录在100条以内
            if (this.executionHistory.length > 100) {
                this.executionHistory = this.executionHistory.slice(-100);
            }

            this.saveTasks();

        } catch (e) {
            logger.error(`[主动执行] 任务执行失败: ${task.name}`, e.message);
        }
    }

    /**
     * 获取所有任务
     */
    getTasks() {
        return Array.from(this.tasks.values());
    }

    /**
     * 删除任务
     */
    deleteTask(taskId) {
        // 停止 cron 任务
        const scheduled = this.scheduledTasks.find(t => t.id === taskId);
        if (scheduled) {
            scheduled.job.stop();
            this.scheduledTasks = this.scheduledTasks.filter(t => t.id !== taskId);
        }

        this.tasks.delete(taskId);
        this.saveTasks();
        return { success: true };
    }

    /**
     * 启用/禁用任务
     */
    toggleTask(taskId, enabled) {
        const task = this.tasks.get(taskId);
        if (!task) return { success: false, message: '任务不存在' };

        task.enabled = enabled;
        this.tasks.set(taskId, task);

        if (enabled) {
            this._scheduleTask(task);
        } else {
            const scheduled = this.scheduledTasks.find(t => t.id === taskId);
            if (scheduled) {
                scheduled.job.stop();
                this.scheduledTasks = this.scheduledTasks.filter(t => t.id !== taskId);
            }
        }

        this.saveTasks();
        return { success: true, enabled };
    }

    // ==================== 条件触发器 ====================

    /**
     * 创建条件触发器
     */
    createTrigger(config) {
        const triggerId = `trigger_${Date.now()}`;

        const trigger = {
            id: triggerId,
            name: config.name || '未命名触发器',
            condition: config.condition,        // 条件类型
            conditionParams: config.conditionParams,  // 条件参数
            action: config.action,              // 触发动作
            actionParams: config.actionParams,  // 动作参数
            enabled: config.enabled !== false,
            createdAt: new Date().toISOString(),
                lastTriggered: null,
            triggerCount: 0
        };

        this.triggers.set(triggerId, trigger);
        this.saveTasks();
        return triggerId;
    }

    /**
     * 检查并执行触发的动作
     */
    async checkAndExecuteTriggers(context) {
        const executed = [];

        for (const [triggerId, trigger] of this.triggers) {
            if (!trigger.enabled) continue;

            if (this._checkCondition(trigger, context)) {
                await this._executeTrigger(trigger, context);
                executed.push(triggerId);
            }
        }

        return executed;
    }

    _checkCondition(trigger, context) {
        const { condition, conditionParams } = trigger;

        switch (condition) {
            case 'time_range':
                const hour = new Date().getHours();
                return hour >= conditionParams.start && hour <= conditionParams.end;

            case 'keywords':
                const text = context.text || '';
                return conditionParams.keywords.some(kw => text.includes(kw));

            case 'emotion':
                return context.emotion === conditionParams.emotion;

            case 'after_interaction':
                return context.type === 'interaction';

            case 'no_interaction':
                const lastInteraction = context.lastInteractionTime;
                if (!lastInteraction) return false;
                const hoursSince = (Date.now() - lastInteraction) / (1000 * 60 * 60);
                return hoursSince >= conditionParams.hours;

            case 'milestone':
                return context.milestone === conditionParams.milestone;

            default:
                return false;
        }
    }

    async _executeTrigger(trigger, context) {
        try {
            const appAutomation = require('../appAutomation');
            const result = await appAutomation.execute('网易云音乐', trigger.action, trigger.actionParams);

            trigger.lastTriggered = new Date().toISOString();
            trigger.triggerCount++;
            this.triggers.set(trigger.id, trigger);

            this.executionHistory.push({
                triggerId: trigger.id,
                triggerName: trigger.name,
                timestamp: new Date().toISOString(),
                success: result.success,
                context: context.text
            });

            this.saveTasks();

        } catch (e) {
            logger.error(`[主动执行] 触发器执行失败: ${trigger.name}`, e.message);
        }
    }

    // ==================== 上下文预判 ====================

    /**
     * 更新上下文
     */
    updateContext(context) {
        this.contextCache = {
            ...this.contextCache,
            ...context,
            lastUpdate: Date.now()
        };
    }

    /**
     * 获取预判建议
     */
    getPredictions() {
        const predictions = [];

        // 基于时间预测
        const hour = new Date().getHours();
        if (hour >= 6 && hour <= 9) {
            predictions.push({
                type: 'greeting',
                message: '早安问候',
                action: 'send_greeting',
                confidence: 0.9
            });
        }
        if (hour >= 21 && hour <= 23) {
            predictions.push({
                type: 'night_greeting',
                message: '晚安问候',
                action: 'send_night_greeting',
                confidence: 0.9
            });
        }

        // 基于连续未互动预测
        if (this.contextCache.lastInteractionTime) {
            const hoursSince = (Date.now() - this.contextCache.lastInteractionTime) / (1000 * 60 * 60);
            if (hoursSince >= 24) {
                predictions.push({
                    type: 'check_in',
                    message: '好久不见，问候一下',
                    action: 'casual_check_in',
                    confidence: 0.7
                });
            }
        }

        // 基于用户偏好预测
        if (this.userPreferences.musicTime && hour === this.userPreferences.musicTime) {
            predictions.push({
                type: 'music',
                message: '该听音乐了',
                action: 'play_music',
                params: { keyword: this.userPreferences.musicGenre || '轻音乐' },
                confidence: 0.6
            });
        }

        // 基于待处理任务预测
        const pendingTasks = Array.from(this.tasks.values()).filter(t => !t.enabled);
        if (pendingTasks.length > 0) {
            predictions.push({
                type: 'task_reminder',
                message: `有 ${pendingTasks.length} 个暂停的任务`,
                action: 'show_pending_tasks',
                confidence: 0.5
            });
        }

        return predictions;
    }

    /**
     * 获取执行历史
     */
    getHistory(limit = 20) {
        return this.executionHistory.slice(-limit);
    }

    // ==================== 调度器 ====================

    startScheduler() {
        if (this.schedulerInterval) return;

        // 每5分钟检查一次触发器
        this.schedulerInterval = setInterval(() => {
            if (!this.enabled) return;
            this.checkAndExecuteTriggers(this.contextCache);
        }, 5 * 60 * 1000);
        this.schedulerInterval.unref?.();

        logger.info('[主动执行] 调度器已启动');
    }

    stopScheduler() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }

        for (const { job } of this.scheduledTasks) {
            job.stop();
        }
        this.scheduledTasks = [];
        logger.info('[主动执行] 调度器已停止');
    }

    // ==================== 状态 ====================

    getStatus() {
        return {
            enabled: this.enabled,
            taskCount: this.tasks.size,
            triggerCount: this.triggers.size,
            pendingTasks: Array.from(this.tasks.values()).filter(t => !t.enabled).length,
            historyCount: this.executionHistory.length
        };
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.stopScheduler();
        } else {
            this.startScheduler();
        }
    }
}

// 单例
const instance = new ActiveExecutionService();
module.exports = instance;
module.exports.ActiveExecutionService = ActiveExecutionService;
