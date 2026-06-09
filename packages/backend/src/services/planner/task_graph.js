/**
 * @file task_graph.js
 * @description 任务图管理器 - 管理任务间的依赖关系，支持并行任务检测和就绪任务获取
 * @module services/planner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

class TaskGraph {
    constructor() {
        this.graph = new Map();
    }

    /**
     * @description 构建任务依赖图 - 解析任务间的依赖关系并建立双向引用
     * @param {Array<Object>} tasks - 任务列表，每个任务可包含 dependsOn 字段
     * @returns {Promise<Map<string, Object>>} 任务图 Map，key 为任务ID，value 为任务节点
     */
    async build(tasks) {
        const graph = new Map();

        for (const task of tasks) {
            const node = {
                ...task,
                dependencies: task.dependsOn || [],
                dependents: []
            };

            graph.set(task.id, node);
        }

        // 计算依赖关系 - 为每个被依赖的任务添加 dependents 引用
        for (const [id, node] of graph) {
            for (const depId of node.dependencies) {
                const depNode = graph.get(depId);
                if (depNode) {
                    depNode.dependents.push(id);
                }
            }
        }

        this.graph = graph;
        return graph;
    }

    /**
     * @description 获取当前可执行的任务（所有依赖已完成的 pending 任务）
     * @returns {Array<Object>} 就绪任务列表
     */
    getReadyTasks() {
        const ready = [];

        for (const [id, node] of this.graph) {
            if (node.status !== 'pending') continue;

            // 检查依赖是否都已完成
            const allDepsCompleted = node.dependencies.every(depId => {
                const dep = this.graph.get(depId);
                return dep && dep.status === 'completed';
            });

            if (allDepsCompleted) {
                ready.push(node);
            }
        }

        return ready;
    }

    /**
     * @description 更新任务状态
     * @param {string} taskId - 任务ID
     * @param {string} status - 新状态
     * @returns {void}
     */
    updateTaskStatus(taskId, status) {
        const node = this.graph.get(taskId);
        if (node) {
            node.status = status;
        }
    }

    /**
     * @description 获取指定任务节点
     * @param {string} taskId - 任务ID
     * @returns {Object|undefined} 任务节点
     */
    getTask(taskId) {
        return this.graph.get(taskId);
    }

    /**
     * @description 获取所有任务节点
     * @returns {Array<Object>} 任务节点列表
     */
    getAllTasks() {
        return Array.from(this.graph.values());
    }

    /**
     * @description 获取可并行执行的任务分组 - 将无依赖关系的就绪任务归为同一组
     * @returns {Array<Array<Object>>} 并行任务分组列表
     */
    getParallelTasks() {
        // 获取可以并行执行的任务
        const ready = this.getReadyTasks();
        const parallelGroups = [];

        // 按依赖关系分组
        const processed = new Set();

        for (const task of ready) {
            if (processed.has(task.id)) continue;

            const group = [task];
            processed.add(task.id);

            // 查找可以并行的任务
            for (const other of ready) {
                if (processed.has(other.id)) continue;

                // 检查是否有依赖关系
                const hasDependency =
                    task.dependencies.includes(other.id) ||
                    other.dependencies.includes(task.id) ||
                    task.dependents.includes(other.id) ||
                    other.dependents.includes(task.id);

                if (!hasDependency) {
                    group.push(other);
                    processed.add(other.id);
                }
            }

            parallelGroups.push(group);
        }

        return parallelGroups;
    }
}

module.exports = new TaskGraph();