/**
 * @file plan_executor.js
 * @description 任务计划执行器 - 解析命令为执行计划并逐步执行
 * @module services/workBrainClient
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

const newsService = require('../newsService');

class PlanExecutor {
    /**
     * @description 解析命令为执行计划 - 识别搜索、浏览等意图
     * @param {string} command - 用户命令
     * @returns {Object} 执行计划，包含 type、steps 等字段
     */
    parseCommand(command) {
        const searchPatterns = [/搜(一下|索)?/, /查一下?/, /查找/, /搜索/];
        const urlPattern = /(https?:\/\/[^\s]+)/;

        const isSearch = searchPatterns.some(p => p.test(command));
        const urlMatch = command.match(urlPattern);

        if (urlMatch) {
            return {
                type: 'browse',
                url: urlMatch[1],
                steps: [{
                    type: 'browse',
                    url: urlMatch[1],
                    description: '正在打开网页...',
                    actions: [
                        { type: 'wait', selector: 'body', timeout: 10000 },
                        { type: 'extract', selector: 'body', format: 'text' }
                    ]
                }]
            };
        }

        if (isSearch) {
            const query = command.replace(/搜(一下|索)?|查一下?|查找|搜索/g, '').trim().replace(/[？?。！!，,]+$/, '');
            return {
                type: 'search',
                query,
                engine: 'bing',
                steps: [
                    { type: 'search', query, engine: 'bing', description: `正在搜索"${query}"...` },
                    { type: 'transform', transform: 'summarize', description: '正在整理搜索结果...' }
                ]
            };
        }

        return {
            type: 'general',
            command,
            steps: [{ type: 'search', query: command, engine: 'bing', description: '正在查找相关信息...' }]
        };
    }

    /**
     * @description 执行计划 - 逐步执行任务计划的每个步骤
     * @param {Object} taskPlan - 任务计划
     * @param {Function} isAborted - 中断检测函数
     * @returns {Promise<Object>} 执行结果，包含 output 和 results
     */
    async executePlan(taskPlan, isAborted) {
        const results = [];
        for (const step of taskPlan.steps) {
            if (isAborted && isAborted()) throw new Error('TASK_ABORTED');
            const result = await this.executeStep(step);
            results.push(result);
        }
        return { output: this.formatResults(taskPlan, results), results };
    }

    /**
     * @description 带进度的执行计划 - 每个步骤执行时回调进度信息
     * @param {Object} taskPlan - 任务计划
     * @param {Function} onProgress - 进度回调函数
     * @param {number} startTime - 任务开始时间戳
     * @param {Function} isAborted - 中断检测函数
     * @returns {Promise<Object>} 执行结果，包含 output 和 results
     */
    async executePlanWithProgress(taskPlan, onProgress, startTime, isAborted) {
        // 新闻类任务走专用 pipeline
        if (taskPlan.type === 'news') {
            onProgress({ status: 'searching', message: '正在搜索新闻...', elapsed: Date.now() - startTime });
            const result = await newsService.searchNews(taskPlan.query);
            onProgress({ status: 'summarizing', message: '正在整理新闻...', elapsed: Date.now() - startTime });
            return { output: newsService.formatOutput(result), results: [result] };
        }

        const results = [];
        for (let i = 0; i < taskPlan.steps.length; i++) {
            if (isAborted && isAborted()) throw new Error('TASK_ABORTED');
            const step = taskPlan.steps[i];

            onProgress({
                status: step.type,
                message: step.description || `执行步骤 ${i + 1}/${taskPlan.steps.length}`,
                step: i + 1,
                total: taskPlan.steps.length,
                elapsed: Date.now() - startTime
            });

            const result = await this.executeStep(step);
            results.push(result);
        }

        return { output: this.formatResults(taskPlan, results), results };
    }

    /**
     * @description 执行单个步骤 - 根据步骤类型分发到浏览器服务
     * @param {Object} step - 步骤对象，包含 type、url、actions 等
     * @returns {Promise<Object>} 步骤执行结果
     */
    async executeStep(step) {
        const browserService = require('../browserService');

        switch (step.type) {
            case 'browse':
                return await browserService.execute({
                    url: step.url,
                    actions: step.actions || [{ type: 'extract', selector: 'body', format: 'text' }]
                });

            case 'search':
                return await browserService.searchAndExtract(step.query, { engine: step.engine || 'bing' });

            case 'extract':
                return await browserService.extractContent(step.url, {
                    selector: step.selector,
                    format: step.format || 'text'
                });

            case 'transform':
                return { type: 'transform', data: step.input || 'transformed' };

            default:
                return { type: step.type, data: null };
        }
    }

    /**
     * @description 格式化执行结果 - 将多步骤结果合并为可读文本
     * @param {Object} taskPlan - 任务计划
     * @param {Array<Object>} results - 各步骤执行结果
     * @returns {string} 格式化后的输出文本
     */
    formatResults(taskPlan, results) {
        const extracts = results
            .filter(r => r && r.summary && r.summary.content)
            .map(r => r.summary.content);

        if (extracts.length > 0) {
            const combined = extracts.join('\n\n').substring(0, 3000);
            if (taskPlan.type === 'search') {
                return `我帮你查到了以下信息：\n\n${combined}\n\n以上信息来自网络搜索，如需更详细的内容可以告诉我~`;
            }
            return combined;
        }

        const rawResults = results
            .filter(r => r && r.results)
            .map(r => r.results.filter(sub => sub.data).map(sub => {
                if (typeof sub.data === 'string') return sub.data;
                if (Array.isArray(sub.data)) return sub.data.map(d => typeof d === 'object' ? d.text || d.href || JSON.stringify(d) : d).join('\n');
                return JSON.stringify(sub.data);
            }))
            .flat();

        if (rawResults.length > 0) {
            return `我帮你查到了以下信息：\n\n${rawResults.join('\n\n').substring(0, 3000)}`;
        }

        return '我尝试查找了相关信息，但没有获取到有用的内容。换个方式试试？';
    }
}

module.exports = new PlanExecutor();