/**
 * @file index.js
 * @description Planner 主入口 - 自主规划Agent，负责理解最终目标并自动拆解、规划、执行复杂任务
 * @module services/planner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心职责：
 * 1. 目标分解 - 将复杂任务拆解为可执行的子任务
 * 2. 依赖管理 - 管理子任务间的依赖关系
 * 3. 并行规划 - 支持子任务并行执行
 * 4. 条件分支 - 支持条件判断和分支
 * 5. 执行追踪 - 追踪任务执行状态
 * 6. 动态调整 - 根据执行结果调整计划
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块 - 避免循环依赖，按需加载
// ============================================================
let _planGenerator = null;
let _taskGraph = null;
let _executionTracker = null;

/**
 * @description 获取计划生成器单例
 * @returns {PlanGenerator} 计划生成器实例
 */
function getPlanGenerator() {
    if (!_planGenerator) _planGenerator = require('./plan_generator');
    return _planGenerator;
}

/**
 * @description 获取任务图管理器单例
 * @returns {TaskGraph} 任务图实例
 */
function getTaskGraph() {
    if (!_taskGraph) _taskGraph = require('./task_graph');
    return _taskGraph;
}

/**
 * @description 获取执行追踪器单例
 * @returns {ExecutionTracker} 执行追踪器实例
 */
function getExecutionTracker() {
    if (!_executionTracker) _executionTracker = require('./execution_tracker');
    return _executionTracker;
}

// ============================================================
// 常量定义 - 任务状态、类型、依赖类型
// ============================================================

/** 任务状态枚举 */
const TaskStatus = {
    PENDING: 'pending',
    PLANNING: 'planning',
    WAITING: 'waiting',
    READY: 'ready',
    EXECUTING: 'executing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
    CANCELLED: 'cancelled'
};

/** 任务类型枚举 */
const TaskType = {
    ACTION: 'action',
    QUERY: 'query',
    CREATE: 'create',
    TRANSFORM: 'transform',
    SEND: 'send',
    ORCHESTRATION: 'orchestration'
};

/** 依赖类型枚举 */
const DependencyType = {
    SEQUENCE: 'sequence',
    PARALLEL: 'parallel',
    CONDITIONAL: 'conditional'
};

class Planner extends EventEmitter {
    constructor() {
        super();

        this.currentPlan = null;
        this.planId = null;
        this.executor = null;
        this.intentCore = null;

        this.planGenerator = getPlanGenerator();
        this.taskGraph = getTaskGraph();
        this.executionTracker = getExecutionTracker();

        logger.info('[Planner] 自主规划器初始化完成');
    }

    /**
     * @description 设置执行器，用于实际执行任务动作
     * @param {Object} executor - 执行器对象，需实现 executeTask 方法
     * @returns {void}
     */
    setExecutor(executor) {
        this.executor = executor;
        logger.info('[Planner] 执行器已设置');
    }

    /**
     * @description 设置意图核心模块，用于理解用户意图
     * @param {Object} intentCore - 意图核心对象
     * @returns {void}
     */
    setIntentCore(intentCore) {
        this.intentCore = intentCore;
    }

    /**
     * @description 规划任务 - 将目标拆解为可执行的子任务并构建依赖图
     * @param {string} goal - 用户目标描述
     * @param {Object} options - 规划选项
     * @returns {Promise<Object>} 规划结果，包含 planId、plan、summary 等
     * @throws {Error} 规划过程出错时抛出异常
     */
    async plan(goal, options = {}) {
        try {
            const planId = `plan_${Date.now()}`;
            this.planId = planId;

            // 生成计划
            const plan = await this.planGenerator.generate(goal, options);

            if (!plan.success) {
                return plan;
            }

            // 构建任务图
            const graph = await this.taskGraph.build(plan.tasks);

            // 存储计划
            this.currentPlan = {
                id: planId,
                goal,
                tasks: plan.tasks,
                graph,
                status: 'planned',
                createdAt: Date.now()
            };

            return {
                success: true,
                planId,
                plan: this.currentPlan,
                summary: plan.summary
            };

        } catch (error) {
            logger.error('[Planner] 规划失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 执行计划 - 按依赖关系依次执行就绪的任务
     * @param {string} planId - 计划ID
     * @param {Object} options - 执行选项，可指定自定义执行器
     * @param {Object} options.executor - 自定义执行器
     * @returns {Promise<Object>} 执行结果，包含 allCompleted、completed、failed 等
     * @throws {Error} 执行过程出错时抛出异常
     */
    async execute(planId, options = {}) {
        const plan = planId === this.planId ? this.currentPlan : null;

        if (!plan) {
            return { success: false, message: '计划不存在' };
        }

        try {
            // 获取可执行任务
            const readyTasks = this.taskGraph.getReadyTasks(plan.graph);

            // 追踪执行
            const results = await this.executionTracker.executeTasks(readyTasks, {
                executor: options.executor || this.executor,
                onProgress: (task, result) => {
                    this.emit('taskProgress', { planId, task, result });
                }
            });

            // 更新状态
            plan.status = results.allCompleted ? 'completed' : 'partial';
            plan.results = results;

            return results;

        } catch (error) {
            logger.error('[Planner] 执行失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 获取任务状态枚举
     * @returns {Object} 任务状态枚举对象
     */
    getTaskStatus() {
        return TaskStatus;
    }

    /**
     * @description 获取任务类型枚举
     * @returns {Object} 任务类型枚举对象
     */
    getTaskType() {
        return TaskType;
    }
}

module.exports = Planner;
