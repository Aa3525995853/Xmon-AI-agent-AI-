/**
 * @file plan_generator.js
 * @description 计划生成器 - 根据目标生成执行计划，支持模板匹配和智能分解
 * @module services/planner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

class PlanGenerator {
    constructor() {
        this.templates = this._initTemplates();
    }

    /**
     * @description 初始化内置任务模板
     * @returns {Object} 模板映射表，key 为模板名，value 包含 trigger、steps
     */
    _initTemplates() {
        return {
            generate_report: {
                trigger: ['生成报告', '写报告', '整理报告', '周报', '月报'],
                steps: [
                    { action: 'collect_data', name: '收集数据' },
                    { action: 'analyze_data', name: '分析数据' },
                    { action: 'write_report', name: '撰写报告' },
                    { action: 'save_report', name: '保存报告' }
                ]
            },
            analyze_document: {
                trigger: ['分析文档', '看看报告', '查看文件'],
                steps: [
                    { action: 'read_document', name: '读取文档' },
                    { action: 'extract_keyinfo', name: '提取关键信息' },
                    { action: 'generate_summary', name: '生成摘要' }
                ]
            },
            excel_operation: {
                trigger: ['整理表格', 'Excel', '处理数据'],
                steps: [
                    { action: 'read_excel', name: '读取表格' },
                    { action: 'analyze_data', name: '分析数据' },
                    { action: 'process_data', name: '处理数据' },
                    { action: 'save_excel', name: '保存结果' }
                ]
            }
        };
    }

    /**
     * @description 根据目标生成执行计划 - 优先匹配模板，否则智能分解
     * @param {string} goal - 用户目标描述
     * @param {Object} options - 生成选项
     * @returns {Promise<Object>} 生成结果，包含 success、tasks、summary、source
     */
    async generate(goal, options = {}) {
        try {
            // 匹配模板
            const template = this._matchTemplate(goal);

            if (template) {
                return this._useTemplate(template, goal, options);
            }

            // 智能分解
            return this._smartDecompose(goal, options);

        } catch (error) {
            logger.error('[计划生成] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 匹配目标到预设模板
     * @param {string} goal - 目标描述
     * @returns {Object|null} 匹配到的模板对象，未匹配返回 null
     */
    _matchTemplate(goal) {
        const lowerGoal = goal.toLowerCase();

        for (const [name, template] of Object.entries(this.templates)) {
            for (const trigger of template.trigger) {
                if (lowerGoal.includes(trigger.toLowerCase())) {
                    return { name, ...template };
                }
            }
        }

        return null;
    }

    /**
     * @description 使用模板生成任务列表
     * @param {Object} template - 匹配到的模板
     * @param {string} goal - 原始目标
     * @param {Object} options - 选项
     * @returns {Object} 生成结果，包含 success、tasks、summary、source
     */
    _useTemplate(template, goal, options) {
        const tasks = template.steps.map((step, index) => ({
            id: `task_${index}`,
            action: step.action,
            name: step.name,
            status: 'pending',
            dependsOn: index > 0 ? [`task_${index - 1}`] : []
        }));

        return {
            success: true,
            tasks,
            summary: `使用「${template.name}」模板，共 ${tasks.length} 个步骤`,
            source: 'template'
        };
    }

    /**
     * @description 智能分解目标 - 通过关键词检测将目标拆解为子任务
     * @param {string} goal - 目标描述
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 分解结果，包含 success、tasks、summary、source
     */
    async _smartDecompose(goal, options) {
        // 简单的智能分解
        const tasks = [];

        // 检测关键词
        if (goal.includes('分析')) {
            tasks.push({ id: 'task_0', action: 'analyze', name: '分析', status: 'pending' });
        }

        if (goal.includes('生成') || goal.includes('创建')) {
            tasks.push({ id: 'task_1', action: 'create', name: '生成', status: 'pending' });
        }

        if (goal.includes('保存') || goal.includes('存储')) {
            tasks.push({ id: 'task_2', action: 'save', name: '保存', status: 'pending' });
        }

        // 默认任务
        if (tasks.length === 0) {
            tasks.push({ id: 'task_0', action: 'execute', name: '执行', status: 'pending' });
        }

        return {
            success: true,
            tasks,
            summary: `智能分解，共 ${tasks.length} 个步骤`,
            source: 'smart'
        };
    }
}

module.exports = new PlanGenerator();