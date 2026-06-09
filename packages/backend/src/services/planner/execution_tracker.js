/**
 * @file execution_tracker.js
 * @description 执行追踪器 - 追踪规划器任务的执行进度和结果
 * @module services/planner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 严格完成规则：
 * 追踪进度不等于执行。本模块不会仅因为时间流逝就标记任务成功。
 * 只有当真正的执行器被提供并返回成功时，任务才算完成。
 */

const { logger } = require('../../utils/logger');

class ExecutionTracker {
    constructor() {
        this.executionHistory = new Map();
    }

    /**
     * @description 批量执行任务列表，追踪每个任务的执行状态
     * @param {Array<Object>} tasks - 待执行的任务列表
     * @param {Object} options - 执行选项
     * @param {Object} options.executor - 任务执行器，需实现 executeTask 方法
     * @param {Function} options.onProgress - 进度回调函数
     * @returns {Promise<Object>} 执行结果汇总，包含 success、allCompleted、total、completed、failed、results
     */
    async executeTasks(tasks, options = {}) {
        const results = [];
        let completedCount = 0;
        let failedCount = 0;

        for (const task of tasks) {
            try {
                task.status = 'executing';
                const result = await this._executeTask(task, options);

                if (result.success) {
                    task.status = 'completed';
                    completedCount++;
                } else {
                    task.status = 'failed';
                    failedCount++;
                }

                results.push({ taskId: task.id, ...result });
                if (options.onProgress) options.onProgress(task, result);
            } catch (error) {
                logger.error(`[ExecutionTracker] task ${task.id} failed:`, error);
                task.status = 'failed';
                failedCount++;
                results.push({ taskId: task.id, success: false, error: error.message });
            }
        }

        return {
            success: failedCount === 0,
            allCompleted: completedCount === tasks.length,
            total: tasks.length,
            completed: completedCount,
            failed: failedCount,
            results
        };
    }

    /**
     * @description 执行单个任务，委托给实际执行器
     * @param {Object} task - 任务对象，包含 action、params 等
     * @param {Object} options - 执行选项
     * @param {Object} options.executor - 任务执行器
     * @returns {Promise<Object>} 执行结果，包含 success、result 或 error
     */
    async _executeTask(task, options) {
        const executor = options.executor;

        if (!executor || typeof executor.executeTask !== 'function') {
            return {
                success: false,
                error: 'No real executor was provided for planner task execution',
                implemented: false
            };
        }

        const result = await executor.executeTask(task.action, task.params || {}, { task });
        if (!result || result.success !== true) {
            return {
                success: false,
                error: result?.error || result?.message || `Task action failed: ${task.action}`,
                result
            };
        }

        return {
            success: true,
            result
        };
    }

    /**
     * @description 获取指定计划的执行历史
     * @param {string} planId - 计划ID
     * @returns {Array<Object>} 执行历史记录列表
     */
    getExecutionHistory(planId) {
        return this.executionHistory.get(planId) || [];
    }

    /**
     * @description 保存执行结果到历史记录
     * @param {string} planId - 计划ID
     * @param {Object} results - 执行结果
     * @returns {void}
     */
    saveExecution(planId, results) {
        this.executionHistory.set(planId, {
            results,
            executedAt: Date.now()
        });
    }
}

module.exports = new ExecutionTracker();
