/**
 * @file report_generator.js
 * @description 报告生成器 - 支持多种报告类型（日报/周报/月报/总结/分析/通用），
 *              根据输入数据自动生成 Markdown 格式的结构化报告内容
 * @module services/content_generation
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// ReportGenerator 类：报告生成核心逻辑
// ============================================================

class ReportGenerator {
    constructor() {}

    /**
     * @description 根据类型生成报告，支持 daily/weekly/monthly/summary/analysis/generic 六种类型
     * @param {Object} params - 生成参数
     * @param {string} params.type - 报告类型（daily/weekly/monthly/summary/analysis/generic）
     * @param {Object} params.data - 报告数据，不同类型需要不同字段
     * @param {Object} [params.options={}] - 额外选项
     * @returns {Promise<{success: boolean, type: string, content: string, metadata: Object}>} 生成结果
     * @throws {Error} 当数据缺失或模板渲染失败时抛出异常
     */
    async generate(params) {
        const { type, data, options = {} } = params;

        try {
            switch (type) {
                case 'daily':
                    return await this._generateDailyReport(data, options);
                case 'weekly':
                    return await this._generateWeeklyReport(data, options);
                case 'monthly':
                    return await this._generateMonthlyReport(data, options);
                case 'summary':
                    return await this._generateSummaryReport(data, options);
                case 'analysis':
                    return await this._generateAnalysisReport(data, options);
                default:
                    return await this._generateGenericReport(data, options);
            }

        } catch (error) {
            logger.error('[报告生成] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 生成日报，包含今日完成事项和明日计划
     * @param {Object} data - 日报数据
     * @param {string} [data.date] - 日期字符串，默认为当天
     * @param {Array<{task: string}>} [data.items=[]] - 完成事项列表
     * @param {string} [data.summary] - 总结内容
     * @param {Object} options - 额外选项
     * @returns {Promise<{success: boolean, type: string, content: string, metadata: Object}>} 生成结果
     */
    async _generateDailyReport(data, options) {
        const { date, items = [], summary } = data;

        const content = `# 日报 - ${date || new Date().toLocaleDateString()}

## 今日完成

${items.map((item, i) => `${i + 1}. ${item.task || item}`).join('\n')}

${summary ? `## 总结\n\n${summary}` : ''}

## 明日计划

-

---
*由小梦自动生成*`;

        return {
            success: true,
            type: 'daily',
            content,
            metadata: { date: date || new Date().toISOString().split('T')[0] }
        };
    }

    /**
     * @description 生成周报，包含本周完成事项和下周计划
     * @param {Object} data - 周报数据
     * @param {string} data.weekStart - 周开始日期
     * @param {string} data.weekEnd - 周结束日期
     * @param {Array} [data.items=[]] - 完成事项列表
     * @param {string} [data.summary] - 总结内容
     * @param {Object} options - 额外选项
     * @returns {Promise<{success: boolean, type: string, content: string, metadata: Object}>} 生成结果
     */
    async _generateWeeklyReport(data, options) {
        const { weekStart, weekEnd, items = [], summary } = data;

        const content = `# 周报 - ${weekStart} 至 ${weekEnd}

## 本周完成

${items.map((item, i) => `${i + 1}. ${item.task || item.description || item}`).join('\n')}

${summary ? `## 总结\n\n${summary}` : ''}

## 下周计划

-

---
*由小梦自动生成*`;

        return {
            success: true,
            type: 'weekly',
            content,
            metadata: { weekStart, weekEnd }
        };
    }

    /**
     * @description 生成月报，包含本月完成事项、数据统计和总结
     * @param {Object} data - 月报数据
     * @param {string} [data.month] - 月份描述
     * @param {Array} [data.items=[]] - 完成事项列表
     * @param {Object} [data.stats={}] - 数据统计键值对
     * @param {string} [data.summary] - 总结内容
     * @param {Object} options - 额外选项
     * @returns {Promise<{success: boolean, type: string, content: string, metadata: Object}>} 生成结果
     */
    async _generateMonthlyReport(data, options) {
        const { month, items = [], stats = {}, summary } = data;

        const content = `# 月报 - ${month || new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}

## 本月完成

${items.map((item, i) => `${i + 1}. ${item.task || item}`).join('\n')}

${Object.keys(stats).length > 0 ? `## 数据统计

${Object.entries(stats).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}` : ''}

${summary ? `## 总结\n\n${summary}` : ''}

---
*由小梦自动生成*`;

        return {
            success: true,
            type: 'monthly',
            content,
            metadata: { month: month || new Date().toISOString().slice(0, 7) }
        };
    }

    /**
     * @description 生成总结报告，包含多个章节和可选结论
     * @param {Object} data - 总结报告数据
     * @param {string} [data.title] - 报告标题
     * @param {Array<{title: string, content: string}>} [data.sections=[]] - 章节列表
     * @param {string} [data.conclusion] - 结论内容
     * @param {Object} options - 额外选项
     * @returns {Promise<{success: boolean, type: string, content: string, metadata: Object}>} 生成结果
     */
    async _generateSummaryReport(data, options) {
        const { title, sections = [], conclusion } = data;

        const content = `# ${title || '总结报告'}

${sections.map((s, i) => `## ${s.title || `章节 ${i + 1}`}

${s.content || s}

`).join('\n')}

${conclusion ? `## 结论

${conclusion}

` : ''}
---
*由小梦自动生成*`;

        return {
            success: true,
            type: 'summary',
            content,
            metadata: { title }
        };
    }

    /**
     * @description 生成分析报告，包含数据概览、关键洞察和建议
     * @param {Object} data - 分析报告数据
     * @param {string} [data.subject] - 分析主题
     * @param {Object} [data.data={}] - 数据概览键值对
     * @param {Array<string>} [data.insights=[]] - 关键洞察列表
     * @param {Array<string>} [data.recommendations=[]] - 建议列表
     * @param {Object} options - 额外选项
     * @returns {Promise<{success: boolean, type: string, content: string, metadata: Object}>} 生成结果
     */
    async _generateAnalysisReport(data, options) {
        const { subject, data: analysisData = {}, insights = [], recommendations = [] } = data;

        const content = `# 分析报告 - ${subject || '主题'}

## 数据概览

${Object.entries(analysisData).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}

${insights.length > 0 ? `## 关键洞察

${insights.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : ''}

${recommendations.length > 0 ? `## 建议

${recommendations.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : ''}

---
*由小梦自动生成*`;

        return {
            success: true,
            type: 'analysis',
            content,
            metadata: { subject }
        };
    }

    /**
     * @description 生成通用报告，支持自定义标题、内容和多章节
     * @param {Object} data - 通用报告数据
     * @param {string} [data.title] - 报告标题
     * @param {string} [data.content] - 自定义正文内容
     * @param {Array<{title: string, content: string}>} [data.sections=[]] - 章节列表
     * @param {Object} options - 额外选项
     * @returns {Promise<{success: boolean, type: string, content: string, metadata: Object}>} 生成结果
     */
    async _generateGenericReport(data, options) {
        const { title, content: customContent, sections = [] } = data;

        const content = `# ${title || '报告'}

${customContent || ''}

${sections.map((s, i) => `## ${s.title || `章节 ${i + 1}`}

${s.content || s}

`).join('\n')}

---
*由小梦自动生成*`;

        return {
            success: true,
            type: 'generic',
            content,
            metadata: { title }
        };
    }

    /**
     * @description 获取所有支持的报告类型列表
     * @returns {Array<string>} 报告类型名称数组
     */
    getReportTypes() {
        return ['daily', 'weekly', 'monthly', 'summary', 'analysis', 'generic'];
    }
}

module.exports = new ReportGenerator();