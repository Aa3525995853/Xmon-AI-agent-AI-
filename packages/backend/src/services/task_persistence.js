/**
 * @file task_persistence.js
 * @description 任务持久化存储服务，将执行过的任务持久化到 JSON 文件，提供统一的任务记录、查询和清理接口
 * @module services/task_persistence
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const { DATA_DIR, ensureDir } = require('../config/runtimePaths');

const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

// ============================================================
// 常量配置：任务持久化相关参数
// ============================================================

/** 最多保存的任务数 */
const MAX_TASKS_COUNT = 1000;

/** 任务保留天数 */
const RETENTION_DAYS = 30;

/** 保存防抖延迟（毫秒） */
const SAVE_DEBOUNCE_MS = 500;

/** 定时清理间隔（毫秒），每小时检查一次 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const DEFAULT_CONFIG = {
    maxTasks: MAX_TASKS_COUNT,
    retentionDays: RETENTION_DAYS,
    autoCleanup: true
};

// ============================================================
// 任务持久化服务类
// ============================================================

class TaskPersistence {
    /**
     * @description 构造函数，初始化任务存储和配置
     */
    constructor() {
        this.tasks = new Map();
        this.config = { ...DEFAULT_CONFIG };
        this._initialized = false;
        this._saveDebounceTimer = null;
    }

    /**
     * @description 初始化服务，加载历史任务并启动定时清理
     * @returns {Promise<void>}
     */
    async init() {
        if (this._initialized) return;

        // 确保 data 目录存在
        ensureDir(DATA_DIR);

        // 加载历史任务
        await this._loadFromFile();

        // 启动定时清理
        this._startCleanupTimer();

        this._initialized = true;
        console.log(`[TaskPersistence] 初始化完成，已加载 ${this.tasks.size} 个历史任务`);
    }

    /**
     * @description 从 JSON 文件加载历史任务数据
     * @returns {Promise<void>}
     */
    async _loadFromFile() {
        try {
            if (fs.existsSync(TASKS_FILE)) {
                const data = fs.readFileSync(TASKS_FILE, 'utf-8');
                const parsed = JSON.parse(data);

                if (parsed.tasks && Array.isArray(parsed.tasks)) {
                    for (const task of parsed.tasks) {
                        if (task.id) {
                            this.tasks.set(task.id, this._normalizeTask(task));
                        }
                    }
                }

                if (parsed.config) {
                    this.config = { ...this.config, ...parsed.config };
                }

                console.log(`[TaskPersistence] 从文件加载了 ${this.tasks.size} 个任务`);
            }
        } catch (error) {
            console.error('[TaskPersistence] 加载任务文件失败:', error.message);
        }
    }

    /**
     * @description 保存任务到文件（防抖，500ms 内最多保存一次）
     * @returns {void}
     */
    _saveToFile() {
        // 防抖：500ms 内最多保存一次
        if (this._saveDebounceTimer) {
            clearTimeout(this._saveDebounceTimer);
        }

        this._saveDebounceTimer = setTimeout(() => {
            this._doSaveToFile();
        }, SAVE_DEBOUNCE_MS);
    }

    /**
     * @description 立即将任务数据写入 JSON 文件
     * @returns {void}
     */
    _doSaveToFile() {
        try {
            const tasksArray = Array.from(this.tasks.values())
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            const data = {
                version: 1,
                updatedAt: Date.now(),
                config: this.config,
                tasks: tasksArray
            };

            fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`[TaskPersistence] 已保存 ${tasksArray.length} 个任务到文件`);
        } catch (error) {
            console.error('[TaskPersistence] 保存任务文件失败:', error.message);
        }
    }

    /**
     * @description 规范化任务对象，补全缺失字段
     * @param {Object} task - 原始任务数据
     * @returns {Object} 规范化后的任务对象
     */
    _normalizeTask(task) {
        return {
            id: task.id || this._generateId(),
            description: task.description || task.command || task.content || '',
            type: task.type || 'general',
            status: task.status || 'unknown',
            result: task.result || null,
            error: task.error || null,
            progress: task.progress || null,
            steps: task.steps || [],
            createdAt: task.createdAt || Date.now(),
            startedAt: task.startedAt || null,
            completedAt: task.completedAt || null,
            updatedAt: task.updatedAt || Date.now(),
            sessionId: task.sessionId || 'default',
            userId: task.userId || 'default',
            metadata: task.metadata || {}
        };
    }

    /**
     * @description 生成唯一任务 ID
     * @returns {string} 任务ID，格式为 task_{时间戳36进制}_{随机4位}
     */
    _generateId() {
        return `task_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    }

    /**
     * @description 记录新任务，自动补全缺失字段并持久化
     * @param {Object} taskData - 任务数据
     * @returns {Object} 记录后的任务对象
     */
    record(taskData) {
        const task = this._normalizeTask(taskData);

        // 如果没有提供 ID，生成一个新 ID
        if (!task.id || this.tasks.has(task.id)) {
            task.id = this._generateId();
        }

        this.tasks.set(task.id, task);
        this._saveToFile();

        console.log(`[TaskPersistence] 记录任务: ${task.id} - ${task.description.substring(0, 30)}...`);
        return task;
    }

    /**
     * @description 更新任务状态和内容
     * @param {string} taskId - 任务ID
     * @param {Object} updates - 更新内容
     * @returns {Object|null} 更新后的任务对象，任务不存在时返回 null
     */
    update(taskId, updates) {
        const task = this.tasks.get(taskId);
        if (!task) {
            console.warn(`[TaskPersistence] 任务不存在: ${taskId}`);
            return null;
        }

        // 合并更新
        const updatedTask = {
            ...task,
            ...updates,
            updatedAt: Date.now()
        };

        this.tasks.set(taskId, updatedTask);
        this._saveToFile();

        return updatedTask;
    }

    /**
     * @description 获取单个任务
     * @param {string} taskId - 任务ID
     * @returns {Object|null} 任务对象，不存在时返回 null
     */
    get(taskId) {
        return this.tasks.get(taskId) || null;
    }

    /**
     * @description 获取任务列表，支持按状态/用户/会话过滤和分页
     * @param {Object} [options={}] - 查询选项
     * @param {string} [options.filter='all'] - 过滤类型（all/running/pending/completed/failed）
     * @param {string} [options.userId] - 按用户ID过滤
     * @param {string} [options.sessionId] - 按会话ID过滤
     * @param {number} [options.limit=100] - 返回数量限制
     * @param {number} [options.offset=0] - 偏移量
     * @returns {Array<Object>} 任务列表
     */
    getTasks(options = {}) {
        const {
            filter = 'all',
            userId = null,
            sessionId = null,
            limit = 100,
            offset = 0
        } = options;

        let tasks = Array.from(this.tasks.values());

        // 按用户过滤
        if (userId) {
            tasks = tasks.filter(t => t.userId === userId);
        }

        // 按会话过滤
        if (sessionId) {
            tasks = tasks.filter(t => t.sessionId === sessionId);
        }

        // 按状态过滤
        switch (filter) {
            case 'running':
                tasks = tasks.filter(t => t.status === 'running' || t.status === 'executing');
                break;
            case 'pending':
                tasks = tasks.filter(t => t.status === 'pending' || t.status === 'queued');
                break;
            case 'completed':
                tasks = tasks.filter(t => t.status === 'completed');
                break;
            case 'failed':
                tasks = tasks.filter(t => t.status === 'failed' || t.status === 'error');
                break;
        }

        // 排序（最新的在前）
        tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // 分页
        return tasks.slice(offset, offset + limit);
    }

    /**
     * @description 获取任务统计数据，包含各状态数量和今日/本周统计
     * @returns {Object} 统计对象
     */
    getStats() {
        const tasks = Array.from(this.tasks.values());
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

        return {
            total: tasks.length,
            running: tasks.filter(t => t.status === 'running' || t.status === 'executing').length,
            pending: tasks.filter(t => t.status === 'pending' || t.status === 'queued').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed' || t.status === 'error').length,
            todayTotal: tasks.filter(t => t.createdAt > oneDayAgo).length,
            todayCompleted: tasks.filter(t => t.completedAt > oneDayAgo && t.status === 'completed').length,
            weekTotal: tasks.filter(t => t.createdAt > sevenDaysAgo).length
        };
    }

    /**
     * @description 删除指定任务
     * @param {string} taskId - 任务ID
     * @returns {Object} 删除结果，包含 success 字段
     */
    delete(taskId) {
        if (this.tasks.delete(taskId)) {
            this._saveToFile();
            return { success: true };
        }
        return { success: false, error: '任务不存在' };
    }

    /**
     * @description 批量清空指定状态的任务
     * @param {string} [filter='completed'] - 要清空的任务类型（completed/failed/all/自定义状态）
     * @returns {Object} 清理结果，包含 success 和 cleared 数量
     */
    clear(filter = 'completed') {
        let cleared = 0;

        const shouldDelete = (task) => {
            switch (filter) {
                case 'completed':
                    return task.status === 'completed';
                case 'failed':
                    return task.status === 'failed' || task.status === 'error';
                case 'all':
                    return true;
                default:
                    return task.status === filter;
            }
        };

        for (const [taskId, task] of this.tasks) {
            if (shouldDelete(task)) {
                this.tasks.delete(taskId);
                cleared++;
            }
        }

        this._saveToFile();
        return { success: true, cleared };
    }

    /**
     * @description 启动定时清理任务，每小时检查一次过期任务
     * @returns {void}
     */
    _startCleanupTimer() {
        // 每小时检查一次
        setInterval(() => {
            if (this.config.autoCleanup) {
                this._cleanup();
            }
        }, CLEANUP_INTERVAL_MS);
    }

    /**
     * @description 清理过期任务，删除超过保留期的已完成任务，以及超出数量限制的最老任务
     * @returns {void}
     */
    _cleanup() {
        const now = Date.now();
        const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = now - retentionMs;

        let cleaned = 0;

        for (const [taskId, task] of this.tasks) {
            // 删除超过保留期的已完成任务
            if (task.completedAt && task.completedAt < cutoffTime) {
                this.tasks.delete(taskId);
                cleaned++;
            }
        }

        // 如果任务数超过限制，删除最老的
        if (this.tasks.size > this.config.maxTasks) {
            const tasks = Array.from(this.tasks.values())
                .sort((a, b) => (a.completedAt || a.createdAt) - (b.completedAt || b.createdAt));

            const toDelete = tasks.slice(0, this.tasks.size - this.config.maxTasks);
            for (const task of toDelete) {
                this.tasks.delete(task.id);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this._saveToFile();
            console.log(`[TaskPersistence] 清理了 ${cleaned} 个过期任务`);
        }
    }

    /**
     * @description 按状态分组获取任务
     * @returns {Object} 分组结果，包含 all/running/pending/completed/failed 数组
     */
    getTasksGrouped() {
        const tasks = Array.from(this.tasks.values());

        return {
            all: tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
            running: tasks.filter(t => t.status === 'running' || t.status === 'executing'),
            pending: tasks.filter(t => t.status === 'pending' || t.status === 'queued'),
            completed: tasks.filter(t => t.status === 'completed'),
            failed: tasks.filter(t => t.status === 'failed' || t.status === 'error')
        };
    }
}

// 单例
const taskPersistence = new TaskPersistence();

module.exports = taskPersistence;
module.exports.TaskPersistence = TaskPersistence;
