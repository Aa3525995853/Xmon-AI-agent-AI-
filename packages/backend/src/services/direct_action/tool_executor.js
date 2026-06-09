/**
 * @file tool_executor.js
 * @description 快捷工具执行器 - 执行各类快捷工具操作，包括天气查询、计算器、PPT生成等，
 *              未实现的工具严格返回 success:false，不会用占位文本伪装成功
 * @module services/direct_action
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 快捷工具定义
// ============================================================

/** 快捷工具列表，用于前端展示和意图匹配 */
const QUICK_TOOLS = [
    { id: 'weather', name: '查天气', icon: 'fa-cloud-sun', category: '生活', prompt: '查一下今天的天气' },
    { id: 'alarm', name: '设闹钟', icon: 'fa-bell', category: '生活', prompt: '帮我设一个闹钟' },
    { id: 'schedule', name: '创日程', icon: 'fa-calendar-plus', category: '生活', prompt: '帮我创建一个日程' },
    { id: 'reminder', name: '提醒', icon: 'fa-clock', category: '生活', prompt: '帮我设置一个提醒' },
    { id: 'calculator', name: '计算器', icon: 'fa-calculator', category: '工具', prompt: '打开计算器' },
    { id: 'note', name: '记笔记', icon: 'fa-sticky-note', category: '工具', prompt: '帮我记一下' },
    { id: 'translate', name: '翻译', icon: 'fa-language', category: '工具', prompt: '帮我翻译一下' },
    { id: 'express', name: '快递查询', icon: 'fa-box', category: '工具', prompt: '查一下快递' },
    { id: 'email', name: '发邮件', icon: 'fa-envelope', category: '工具', prompt: '帮我发一封邮件' },
    { id: 'summary', name: '总结', icon: 'fa-file-alt', category: '工具', prompt: '帮我总结一下' }
];

class ToolExecutor {
    /**
     * @description 构造函数，初始化快捷工具列表
     */
    constructor() {
        /** 快捷工具定义列表 */
        this.quickTools = QUICK_TOOLS;
    }

    /**
     * @description 执行指定工具，根据工具ID分发到对应的执行方法
     * @param {string} toolId - 工具标识（weather/calculator/ppt/alarm/schedule/reminder/translate/note/express/email/summary/code）
     * @param {Object} params - 工具参数
     * @returns {Promise<{success: boolean, message?: string, tool: string}>} 执行结果
     */
    async execute(toolId, params = {}) {
        try {
            switch (toolId) {
                case 'weather':
                    return await this._executeWeather(params);
                case 'calculator':
                    return this._executeCalculator(params);
                case 'ppt':
                    return await this._executePPT(params);
                case 'alarm':
                case 'schedule':
                case 'reminder':
                case 'translate':
                case 'note':
                case 'express':
                case 'email':
                case 'summary':
                case 'code':
                    return this._notImplemented(toolId);
                default:
                    return this._notImplemented(toolId);
            }
        } catch (error) {
            logger.error('[ToolExecutor] execution failed:', error);
            return { success: false, message: error.message, tool: toolId };
        }
    }

    /**
     * @description 执行天气查询工具
     * @param {Object} params - 查询参数
     * @param {string} [params.city] - 城市名
     * @param {string} [params.location] - 地点名
     * @param {string} [params.query] - 查询文本
     * @returns {Promise<{success: boolean, weather?: Object, tool: string, message?: string}>} 天气查询结果
     */
    async _executeWeather(params) {
        const city = params.city || params.location || params.query;
        if (!city) {
            return { success: false, message: 'Please provide a city for weather query', tool: 'weather' };
        }

        const weatherSearch = require('../weather_search');
        const weather = await weatherSearch.getCurrentWeather(city);
        return { success: true, weather, tool: 'weather' };
    }

    /**
     * @description 执行计算器工具，仅允许数字和算术运算符，防止任意代码执行
     * @param {Object} params - 计算参数
     * @param {string} params.expression - 算术表达式
     * @returns {{success: boolean, expression?: string, result?: number, tool: string, message?: string}} 计算结果
     */
    _executeCalculator(params) {
        const { expression } = params;
        if (!expression) {
            return { success: false, message: 'Please provide a calculation expression', tool: 'calculator' };
        }

        try {
            // 安全过滤：仅保留数字和算术运算符，防止通过 Function 构造器执行任意代码
            const sanitized = expression.replace(/[^0-9+\-*/().]/g, '');
            if (!sanitized.trim()) {
                return { success: false, message: 'Calculation expression is empty after sanitization', tool: 'calculator' };
            }

            const result = Function('"use strict"; return (' + sanitized + ')')();
            return { success: true, expression, result, tool: 'calculator' };
        } catch (e) {
            return { success: false, message: 'Invalid calculation expression', tool: 'calculator' };
        }
    }

    /**
     * @description 执行 PPT 生成工具
     * @param {Object} params - 生成参数
     * @param {string} [params.description] - PPT 内容描述
     * @returns {Promise<{success: boolean, message?: string, tool: string, filePath?: string, downloadUrl?: string, slides?: number}>} 生成结果
     */
    async _executePPT(params) {
        try {
            const pptGenerator = require('../ppt_generator');
            const result = await pptGenerator.generate(params.description || 'business plan PPT');
            return {
                success: Boolean(result.success),
                message: result.message || result.filePath,
                tool: 'ppt',
                filePath: result.filePath,
                downloadUrl: result.downloadUrl,
                slides: result.slides
            };
        } catch (e) {
            return { success: false, message: e.message, tool: 'ppt' };
        }
    }

    /**
     * @description 返回未实现状态，核心防伪成功守卫：未实现的真实执行器一律返回 success:false
     * @param {string} tool - 工具标识
     * @returns {{success: false, message: string, tool: string}} 未实现结果
     */
    _notImplemented(tool) {
        return {
            success: false,
            message: `Tool "${tool}" is not implemented with a real executor`,
            tool
        };
    }

    /**
     * @description 获取快捷工具列表
     * @returns {Array<Object>} 快捷工具定义列表
     */
    getQuickTools() {
        return this.quickTools;
    }
}

module.exports = new ToolExecutor();
