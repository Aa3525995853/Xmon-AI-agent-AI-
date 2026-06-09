/**
 * @file taskHistory_routes.js
 * @description 历史任务查询路由模块，提供任务记录、列表查询、统计、分组、详情、
 *              今日任务、搜索、删除、清空及更新等 API 接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const router = express.Router();
const taskPersistence = require('../services/task_persistence');

/** 分组任务列表最大返回条数 */
const MAX_GROUPED_TASKS = 100;

/** 任务列表默认返回条数 */
const DEFAULT_TASK_LIMIT = 50;

/** 一天的毫秒数，用于日期范围计算 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================
// 模块名称：初始化
// 功能说明：确保任务持久化服务已初始化
// ============================================================

/** 标记任务持久化服务是否已初始化 */
let _initialized = false;

/**
 * @description 确保任务持久化服务已初始化，首次调用时执行初始化
 * @returns {Promise<void>}
 */
async function ensureInit() {
    if (!_initialized) {
        await taskPersistence.init();
        _initialized = true;
    }
}

// ============================================================
// 模块名称：任务记录
// 功能说明：记录新任务到持久化存储
// ============================================================

/**
 * @description 记录新任务（供内部调用），将任务信息持久化存储
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.description - 任务描述（必填）
 * @param {string} [req.body.id] - 任务 ID
 * @param {string} [req.body.type] - 任务类型
 * @param {string} [req.body.status] - 任务状态
 * @param {*} [req.body.result] - 任务结果
 * @param {string} [req.body.error] - 错误信息
 * @param {number} [req.body.progress] - 进度百分比
 * @param {Array} [req.body.steps] - 执行步骤
 * @param {string} [req.body.sessionId] - 会话 ID
 * @param {string} [req.body.userId] - 用户 ID
 * @param {Object} [req.body.metadata] - 元数据
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 task 对象
 */
router.post('/record', async (req, res) => {
    await ensureInit();

    try {
        const { id, description, type, status, result, error, progress, steps, sessionId, userId, metadata } = req.body;

        if (!description) {
            return res.status(400).json({ success: false, error: '缺少 description 参数' });
        }

        const task = taskPersistence.record({
            id,
            description,
            type,
            status,
            result,
            error,
            progress,
            steps,
            sessionId,
            userId,
            metadata,
            createdAt: Date.now()
        });

        res.json({ success: true, task });
    } catch (error) {
        console.error('[TaskHistory] 记录任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：任务查询
// 功能说明：任务列表、统计、分组、详情、今日任务、搜索
// ============================================================

/**
 * @description 获取任务列表，支持按状态过滤和分页
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.filter='all'] - 过滤条件：all/running/completed/failed/pending
 * @param {string} [req.query.userId] - 用户 ID 过滤
 * @param {number} [req.query.limit=50] - 返回条数上限
 * @param {number} [req.query.offset=0] - 偏移量
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 filter、tasks、count、offset、limit
 */
router.get('/list', async (req, res) => {
    await ensureInit();

    try {
        const { filter = 'all', userId, limit = DEFAULT_TASK_LIMIT, offset = 0 } = req.query;

        const tasks = taskPersistence.getTasks({
            filter,
            userId,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            filter,
            tasks,
            count: tasks.length,
            offset: parseInt(offset),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('[TaskHistory] 获取任务列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 获取任务统计信息，包含各状态任务数量等汇总数据
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 stats 对象
 */
router.get('/stats', async (req, res) => {
    await ensureInit();

    try {
        const stats = taskPersistence.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('[TaskHistory] 获取统计失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 按状态分组获取任务列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 all、running、pending、completed、failed 分组
 */
router.get('/grouped', async (req, res) => {
    await ensureInit();

    try {
        const grouped = taskPersistence.getTasksGrouped();

        res.json({
            success: true,
            all: grouped.all.slice(0, MAX_GROUPED_TASKS),
            running: grouped.running,
            pending: grouped.pending,
            completed: grouped.completed.slice(0, MAX_GROUPED_TASKS),
            failed: grouped.failed,
            total: taskPersistence.tasks.size
        });
    } catch (error) {
        console.error('[TaskHistory] 获取分组任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 获取指定任务的详细信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 task 对象
 */
router.get('/detail/:id', async (req, res) => {
    await ensureInit();

    try {
        const task = taskPersistence.get(req.params.id);

        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }

        res.json({ success: true, task });
    } catch (error) {
        console.error('[TaskHistory] 获取任务详情失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 获取今日创建的任务列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 tasks、count、date
 */
router.get('/today', async (req, res) => {
    await ensureInit();

    try {
        const tasks = taskPersistence.getTasks({
            filter: 'all',
            limit: MAX_GROUPED_TASKS
        });

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        const todayTasks = tasks.filter(t => (t.createdAt || 0) >= startOfDay);

        res.json({
            success: true,
            tasks: todayTasks,
            count: todayTasks.length,
            date: now.toLocaleDateString('zh-CN')
        });
    } catch (error) {
        console.error('[TaskHistory] 获取今日任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 搜索任务，支持关键词、类型、日期过滤
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.q] - 搜索关键词
 * @param {string} [req.query.type] - 任务类型过滤
 * @param {string} [req.query.date] - 日期过滤
 * @param {number} [req.query.limit=50] - 返回条数上限
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 query、tasks、count
 */
router.get('/search', async (req, res) => {
    await ensureInit();

    try {
        const { q, type, date, limit = DEFAULT_TASK_LIMIT } = req.query;

        let tasks = Array.from(taskPersistence.tasks.values());

        // 关键词搜索
        if (q) {
            const query = q.toLowerCase();
            tasks = tasks.filter(t =>
                t.description.toLowerCase().includes(query) ||
                (t.result && JSON.stringify(t.result).toLowerCase().includes(query))
            );
        }

        // 类型过滤
        if (type) {
            tasks = tasks.filter(t => t.type === type);
        }

        // 日期过滤
        if (date) {
            const targetDate = new Date(date);
            const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
            const endOfDay = startOfDay + MS_PER_DAY;
            tasks = tasks.filter(t => {
                const createdAt = t.createdAt || 0;
                return createdAt >= startOfDay && createdAt < endOfDay;
            });
        }

        // 排序
        tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // 限制数量
        tasks = tasks.slice(0, parseInt(limit));

        res.json({
            success: true,
            query: q,
            tasks,
            count: tasks.length
        });
    } catch (error) {
        console.error('[TaskHistory] 搜索任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：任务管理
// 功能说明：删除任务、清空历史任务
// ============================================================

/**
 * @description 删除指定任务
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要删除的任务 ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含删除结果
 */
router.delete('/:id', async (req, res) => {
    await ensureInit();

    try {
        const result = taskPersistence.delete(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('[TaskHistory] 删除任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 清空历史任务，支持按状态过滤
 * @param {Object} req - Express 请求对象
 * @param {string} [req.body.filter='completed'] - 过滤条件：completed/failed/all
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、message、cleared
 */
router.post('/clear', async (req, res) => {
    await ensureInit();

    try {
        const { filter = 'completed' } = req.body;
        const result = taskPersistence.clear(filter);
        res.json({
            success: true,
            message: `已清空 ${result.cleared} 个任务`,
            cleared: result.cleared
        });
    } catch (error) {
        console.error('[TaskHistory] 清空任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：任务更新（供内部调用）
// 功能说明：更新任务状态
// ============================================================

/**
 * @description 更新指定任务的状态和属性
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 任务 ID
 * @param {Object} req.body - 要更新的字段（如 status、progress、result 等）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和更新后的 task 对象
 */
router.patch('/:id', async (req, res) => {
    await ensureInit();

    try {
        const updates = req.body;
        const task = taskPersistence.update(req.params.id, updates);

        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }

        res.json({ success: true, task });
    } catch (error) {
        console.error('[TaskHistory] 更新任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;