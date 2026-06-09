/**
 * @file completion_generator.js
 * @description 完成语生成器 - 根据任务难度和类型生成温暖的完成反馈语，
 *              支持多种任务类型（发票/文件/搜索/报告/邮件）的格式化输出
 * @module services/emotion_feedback
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义：完成语前缀
// ============================================================

/** 按难度分级的完成语前缀 */
const COMPLETION_PREFIXES = {
    easy: ['搞定啦！', '完成咯～', '好啦！', '搞定咯！', '分分钟搞定', '小意思'],
    normal: ['搞定啦！', '完成咯～', '好啦！', '搞定咯！'],
    hard: ['终于搞定啦！', '历尽千辛万苦完成啦！', '费了好大劲，终于搞定了！']
};

// ============================================================
// CompletionGenerator 类：完成语生成核心逻辑
// ============================================================

class CompletionGenerator {
    /**
     * @description 根据任务难度获取完成语前缀
     * @param {string} taskType - 任务类型
     * @param {string} effort - 任务难度（easy/normal/hard/complex）
     * @returns {string} 随机选择的完成语前缀
     */
    getPrefix(taskType, effort) {
        const prefixes = effort === 'easy' ? COMPLETION_PREFIXES.easy
            : effort === 'hard' || effort === 'complex' ? COMPLETION_PREFIXES.hard
            : COMPLETION_PREFIXES.normal;

        return this.randomPick(prefixes);
    }

    /**
     * @description 根据任务类型格式化核心内容，委托给对应的格式化方法
     * @param {Object} taskResult - 任务结果
     * @param {string} taskResult.taskType - 任务类型
     * @param {string} [taskResult.summary] - 任务摘要
     * @param {Object} [taskResult.details] - 任务详情
     * @returns {string} 格式化后的核心内容文本
     */
    formatCoreContent(taskResult) {
        const { taskType, summary, details } = taskResult;

        switch (taskType) {
            case 'organize_invoice':
                return this.formatInvoiceSummary(details);
            case 'organize_files':
                return this.formatFileSummary(details);
            case 'search_info':
                return this.formatSearchSummary(details);
            case 'generate_report':
                return this.formatReportSummary(details);
            case 'send_email':
                return this.formatEmailSummary(details);
            default:
                return summary || '任务完成了';
        }
    }

    /**
     * @description 格式化发票整理结果，包含数量、总额、重复和问题提示
     * @param {Object} details - 发票详情
     * @param {number} details.count - 发票数量
     * @param {number} details.total - 总金额
     * @param {boolean} [details.duplicateFound=false] - 是否发现重复发票
     * @param {Array} [details.issues=[]] - 有问题的发票列表
     * @returns {string} 格式化文本
     */
    formatInvoiceSummary(details) {
        const { count, total, duplicateFound = false, issues = [] } = details;
        let text = `一共${count}张发票，总共${total}块`;

        if (duplicateFound) text += '（已经帮你排除了重复的）';
        if (issues.length > 0) text += `。有${issues.length}张有点小问题，我已经标记出来了`;

        return text;
    }

    /**
     * @description 格式化文件整理结果，包含整理数量和分类信息
     * @param {Object} details - 文件整理详情
     * @param {number} details.organized - 整理的文件数
     * @param {boolean} [details.moved] - 是否已移动文件
     * @param {Array<string>} [details.categories] - 分类名称列表
     * @returns {string} 格式化文本
     */
    formatFileSummary(details) {
        const { organized, moved, categories } = details;
        let text = `整理了${organized}个文件`;

        if (moved) text += '，帮你归好类了';
        if (categories?.length > 0) text += `（${categories.slice(0, 3).join('、')}...）`;

        return text;
    }

    /**
     * @description 格式化搜索结果，包含结果数量和筛选提示
     * @param {Object} details - 搜索详情
     * @param {Array} [details.results] - 搜索结果列表
     * @param {number} details.count - 结果总数
     * @returns {string} 格式化文本
     */
    formatSearchSummary(details) {
        const { results, count } = details;
        let text = `找到了${count}条相关信息`;

        if (results?.length > 0) {
            text += `，帮你筛选了最相关的${Math.min(3, results.length)}条`;
        }

        return text;
    }

    /**
     * @description 格式化报告生成结果，包含章节数和字数
     * @param {Object} details - 报告详情
     * @param {number} [details.sections] - 章节数
     * @param {number} [details.wordCount] - 字数
     * @returns {string} 格式化文本
     */
    formatReportSummary(details) {
        const { sections, wordCount } = details;
        let text = '帮你写好了汇报内容';

        if (sections) text += `，一共${sections}个部分`;
        if (wordCount) text += `，大约${wordCount}字`;

        return text;
    }

    /**
     * @description 格式化邮件发送结果，包含收件人和附件信息
     * @param {Object} details - 邮件详情
     * @param {string} [details.recipients] - 收件人
     * @param {string} [details.subject] - 邮件主题
     * @param {boolean} [details.attachment] - 是否有附件
     * @returns {string} 格式化文本
     */
    formatEmailSummary(details) {
        const { recipients, subject, attachment } = details;
        let text = '邮件已经发出去啦';

        if (recipients) text += `给${recipients}`;
        if (attachment) text += '，附件也一起发了';

        return text;
    }

    /**
     * @description 为文本添加语气词，使反馈更温暖自然
     * @param {string} text - 原始文本
     * @param {Array<string>} particles - 语气词列表
     * @returns {string} 添加语气词后的文本
     */
    addParticles(text, particles) {
        if (!particles?.length) return text;

        const hasParticle = particles.some(p => text.endsWith(p));
        if (!hasParticle) {
            text += this.randomPick(particles);
        }

        return text;
    }

    /**
     * @description 从数组中随机选择一个元素
     * @param {Array} array - 候选数组
     * @returns {*} 随机选中的元素
     */
    randomPick(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

module.exports = new CompletionGenerator();