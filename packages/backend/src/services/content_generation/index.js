/**
 * @file index.js
 * @description ContentGenerationService 主入口 - 内容生成服务，
 *              整合表格生成、邮件撰写/发送、报告生成、PPT生成等子模块，
 *              提供一键直达（生成+发送）和批量生成能力
 * @module services/content_generation
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块：避免循环依赖，按需初始化
// ============================================================

/** @type {TableGenerator|null} 表格生成器实例 */
let _tableGenerator = null;
/** @type {EmailGenerator|null} 邮件生成器实例 */
let _emailGenerator = null;
/** @type {ReportGenerator|null} 报告生成器实例 */
let _reportGenerator = null;
/** @type {PPTGenerator|null} PPT生成器实例 */
let _pptGenerator = null;

/**
 * @description 获取表格生成器单例
 * @returns {Object} TableGenerator 实例
 */
function getTableGenerator() {
    if (!_tableGenerator) _tableGenerator = require('./table_generator');
    return _tableGenerator;
}

/**
 * @description 获取邮件生成器单例
 * @returns {Object} EmailGenerator 实例
 */
function getEmailGenerator() {
    if (!_emailGenerator) _emailGenerator = require('./email_generator');
    return _emailGenerator;
}

/**
 * @description 获取报告生成器单例
 * @returns {Object} ReportGenerator 实例
 */
function getReportGenerator() {
    if (!_reportGenerator) _reportGenerator = require('./report_generator');
    return _reportGenerator;
}

/**
 * @description 获取PPT生成器单例
 * @returns {Object} PPTGenerator 实例
 */
function getPPTGenerator() {
    if (!_pptGenerator) _pptGenerator = require('../ppt_generator');
    return _pptGenerator;
}

// ============================================================
// ContentGenerationService 类：内容生成服务主类
// ============================================================

class ContentGenerationService {
    constructor() {
        /** @type {Object|null} LLM 服务实例，延迟加载 */
        this.llmService = null;
    }

    /**
     * @description 延迟获取 LLM 服务实例，避免循环依赖
     * @returns {Object|null} LLM 服务实例，加载失败返回 null
     */
    _getLLMService() {
        if (!this.llmService) {
            try {
                this.llmService = require('../llm_service');
            } catch (e) {
                logger.warn('[内容生成] LLM服务未加载');
            }
        }
        return this.llmService;
    }

    /**
     * @description 生成表格文件（CSV/Excel/Markdown/JSON）
     * @param {Object} params - 表格生成参数，详见 TableGenerator.generate
     * @returns {Promise<Object>} 生成结果
     */
    async generateTable(params) {
        return getTableGenerator().generate(params);
    }

    /**
     * @description 撰写邮件（模板填充或 LLM 智能生成）
     * @param {Object} params - 邮件撰写参数，详见 EmailGenerator.compose
     * @returns {Promise<Object>} 撰写结果
     */
    async composeEmail(params) {
        return getEmailGenerator().compose(params);
    }

    /**
     * @description 发送邮件（通过 SMTP）
     * @param {Object} params - 邮件发送参数，详见 EmailGenerator.send
     * @returns {Promise<Object>} 发送结果
     */
    async sendEmail(params) {
        return getEmailGenerator().send(params);
    }

    /**
     * @description 生成报告（日报/周报/月报/总结/分析/通用）
     * @param {Object} params - 报告生成参数，详见 ReportGenerator.generate
     * @returns {Promise<Object>} 生成结果
     */
    async generateReport(params) {
        return getReportGenerator().generate(params);
    }

    /**
     * @description 生成 PPT 演示文稿
     * @param {Object} params - PPT 生成参数，详见 PPTGenerator.generate
     * @returns {Promise<Object>} 生成结果
     */
    async generatePPT(params) {
        return getPPTGenerator().generate(params);
    }

    /**
     * @description 一键直达 - 先生成内容再发送给收件人，实现从输入到完成的完整流程
     * @param {Object} params - 直达参数
     * @param {string} params.type - 内容类型（email/report/table/ppt）
     * @param {Object} params.data - 生成内容所需的数据
     * @param {Array<string>} [params.recipients] - 收件人列表，提供时自动发送
     * @returns {Promise<{success: boolean, delivery?: Object}>} 生成与发送结果
     * @throws {Error} 当生成或发送过程失败时抛出异常
     */
    async directDeliver(params) {
        const { type, data, recipients } = params;

        try {
            // 根据类型生成内容
            let result;
            switch (type) {
                case 'email':
                case 'report':
                    result = await this.composeEmail(data);
                    break;
                case 'table':
                    result = await this.generateTable(data);
                    break;
                case 'ppt':
                    result = await this.generatePPT(data);
                    break;
                default:
                    result = await this.generateReport(data);
            }

            // 如果有收件人，发送
            if (recipients && recipients.length > 0 && result.success) {
                const sendResult = await this.sendEmail({
                    ...result.content,
                    to: recipients
                });
                return { ...result, delivery: sendResult };
            }

            return result;

        } catch (error) {
            logger.error('[内容生成] 一键直达失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 批量生成多种类型的内容，逐个执行并汇总结果
     * @param {Array<{id: string, type: string, params: Object}>} tasks - 生成任务列表
     * @returns {Promise<{success: boolean, total: number, completed: number, failed: number, results: Array}>} 批量生成汇总结果
     */
    async batchGenerate(tasks) {
        const results = [];

        for (const task of tasks) {
            try {
                let result;
                switch (task.type) {
                    case 'table':
                        result = await this.generateTable(task.params);
                        break;
                    case 'email':
                        result = await this.composeEmail(task.params);
                        break;
                    case 'report':
                        result = await this.generateReport(task.params);
                        break;
                    case 'ppt':
                        result = await this.generatePPT(task.params);
                        break;
                    default:
                        result = { success: false, message: 'Unknown type' };
                }
                results.push({ task: task.id, ...result });
            } catch (error) {
                results.push({ task: task.id, success: false, message: error.message });
            }
        }

        // 【修复】当所有任务都失败时返回 success:false，不伪装成功
        const completedCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;

        return {
            success: completedCount > 0,
            total: tasks.length,
            completed: completedCount,
            failed: failedCount,
            results
        };
    }
}

module.exports = ContentGenerationService;