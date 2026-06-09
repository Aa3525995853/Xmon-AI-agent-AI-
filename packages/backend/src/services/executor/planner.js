/**
 * @file planner.js
 * @description 任务规划器 - 根据意图类型生成执行计划，并按步骤执行任务
 * @module services/executor
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

/** 每个步骤的估算执行时间（毫秒），用于计算计划总耗时 */
const ESTIMATED_TIME_PER_STEP = 5000;

class Planner {
    /**
     * @description 构造函数，初始化WebSocket广播器
     */
    constructor() {
        /** @type {Object|null} WebSocket广播器引用 */
        this._wsBroadcaster = null;
    }

    /**
     * @description 设置WebSocket广播器，用于向前端推送计划状态
     * @param {Object} broadcaster - WebSocket广播器实例
     */
    setWsBroadcaster(broadcaster) {
        this._wsBroadcaster = broadcaster;
    }

    /**
     * @description 根据意图类型生成执行计划，包含步骤列表和预估时间
     * @param {string} input - 用户原始输入
     * @param {Object} [context={}] - 上下文信息
     * @param {Object} context.intent - 意图对象，包含 type、originalInput 等字段
     * @param {Object} [context.knowledgeContext] - 知识上下文
     * @returns {Promise<Object>} 执行计划 { id, intent, steps, estimatedTime, createdAt }
     */
    async plan(input, context = {}) {
        const { intent, knowledgeContext } = context;

        const plan = {
            id: 'plan_' + Date.now(),
            intent: intent,
            steps: [],
            estimatedTime: 0,
            createdAt: Date.now()
        };

        // 根据意图类型生成计划
        switch (intent.type) {
            case 'search':
                plan.steps = this._planSearch(intent);
                break;
            case 'file_operation':
                plan.steps = this._planFileOperation(intent);
                break;
            case 'app_control':
                plan.steps = this._planAppControl(intent);
                break;
            case 'email':
                plan.steps = this._planEmail(intent);
                break;
            case 'complex':
                plan.steps = this._planComplexTask(intent);
                break;
            default:
                plan.steps = [{ action: 'generic', description: input }];
        }

        // 估算时间：每步按固定时间计算
        plan.estimatedTime = plan.steps.length * ESTIMATED_TIME_PER_STEP;

        logger.info(`[Planner] 生成计划: ${plan.id}`, {
            steps: plan.steps.length,
            type: intent.type
        });

        return plan;
    }

    /**
     * @description 按步骤执行计划，支持失败恢复和错误继续策略
     * @param {Object} plan - 执行计划对象
     * @param {Object} [context={}] - 执行上下文
     * @param {Object} context.executor - 任务执行器实例
     * @param {Object} [context.healer] - 恢复器实例，用于失败后自动恢复
     * @returns {Promise<Object>} 执行结果 { status, planId, results, successCount, totalSteps }
     */
    async execute(plan, context = {}) {
        const { executor, healer } = context;
        const results = [];

        for (const step of plan.steps) {
            try {
                const result = await executor.executeTask(step.action, step.params, { step });

                results.push({
                    step: step.id || step.action,
                    success: true,
                    result
                });

                // 检查是否需要恢复
                if (!result.success && healer) {
                    const recovery = healer.analyzeAndRecover(step, result);
                    if (recovery) {
                        results.push({ step: step.action + '_recovery', success: true, result: recovery });
                    }
                }

            } catch (error) {
                results.push({
                    step: step.id || step.action,
                    success: false,
                    error: error.message
                });

                // 遇到失败可以停止或继续
                if (plan.continueOnError !== true) {
                    break;
                }
            }
        }

        const allSuccess = results.every(r => r.success);

        return {
            status: allSuccess ? 'completed' : 'partial',
            planId: plan.id,
            results,
            successCount: results.filter(r => r.success).length,
            totalSteps: plan.steps.length
        };
    }

    /**
     * @description 生成搜索类型意图的执行步骤
     * @param {Object} intent - 意图对象
     * @returns {Array<Object>} 步骤列表
     * @private
     */
    _planSearch(intent) {
        return [{
            action: 'search',
            params: { query: intent.originalInput },
            description: `搜索: ${intent.originalInput}`
        }];
    }

    /**
     * @description 生成文件操作类型意图的执行步骤
     * @param {Object} intent - 意图对象，包含 action（read/write/list）和 targets
     * @returns {Array<Object>} 步骤列表
     * @private
     */
    _planFileOperation(intent) {
        const steps = [];

        if (intent.action === 'read') {
            steps.push({
                action: 'file_read',
                params: { path: intent.targets?.[0]?.path || intent.originalInput },
                description: '读取文件'
            });
        } else if (intent.action === 'write') {
            steps.push({
                action: 'file_write',
                params: { path: intent.targets?.[0]?.path, content: intent.entities?.content },
                description: '写入文件'
            });
        } else {
            steps.push({
                action: 'file_list',
                params: { path: intent.targets?.[0]?.path || '.' },
                description: '列出目录'
            });
        }

        return steps;
    }

    /**
     * @description 生成应用控制类型意图的执行步骤
     * @param {Object} intent - 意图对象，包含 targets 中的应用名称
     * @returns {Array<Object>} 步骤列表
     * @private
     */
    _planAppControl(intent) {
        return [{
            action: 'launch_app',
            params: { app_name: intent.targets?.[0]?.name || intent.originalInput },
            description: `启动应用: ${intent.targets?.[0]?.name}`
        }];
    }

    /**
     * @description 生成邮件类型意图的执行步骤
     * @param {Object} intent - 意图对象，包含 targets 中的收件人和 entities 中的主题
     * @returns {Array<Object>} 步骤列表
     * @private
     */
    _planEmail(intent) {
        return [{
            action: 'email_compose',
            params: {
                to: intent.targets?.[0]?.email,
                subject: intent.entities?.subject,
                body: intent.originalInput
            },
            description: `发送邮件给: ${intent.targets?.[0]?.email}`
        }];
    }

    /**
     * @description 生成复杂任务的执行步骤，拆分为收集信息→分析整理→生成结果三步
     * @param {Object} intent - 意图对象
     * @returns {Array<Object>} 步骤列表
     * @private
     */
    _planComplexTask(intent) {
        // 复杂任务拆分为多个步骤
        const steps = [];

        // 步骤1：收集信息
        steps.push({
            action: 'search',
            params: { query: intent.originalInput },
            description: '收集相关信息'
        });

        // 步骤2：分析整理
        steps.push({
            action: 'analyze',
            params: {},
            description: '分析整理信息'
        });

        // 步骤3：生成结果
        steps.push({
            action: 'generate',
            params: {},
            description: '生成结果'
        });

        return steps;
    }
}

module.exports = new Planner();