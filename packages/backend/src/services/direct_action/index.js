/**
 * @file index.js
 * @description Direct Action 服务主入口 - 内容直达服务，将用户自然语言意图直接转化为操作执行，
 *              支持搜索、工具调用和意图路由，严格禁止用占位文本伪装成功
 * @module services/direct_action
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块，避免循环依赖
// ============================================================

/** 意图识别器懒加载实例 */
let _intentRecognizer = null;
/** 搜索执行器懒加载实例 */
let _searchExecutor = null;
/** 工具执行器懒加载实例 */
let _toolExecutor = null;

/**
 * @description 获取意图识别器单例
 * @returns {Object} IntentRecognizer 实例
 */
function getIntentRecognizer() {
    if (!_intentRecognizer) _intentRecognizer = require('./intent_recognizer');
    return _intentRecognizer;
}

/**
 * @description 获取搜索执行器单例
 * @returns {Object} SearchExecutor 实例
 */
function getSearchExecutor() {
    if (!_searchExecutor) _searchExecutor = require('./search_executor');
    return _searchExecutor;
}

/**
 * @description 获取工具执行器单例
 * @returns {Object} ToolExecutor 实例
 */
function getToolExecutor() {
    if (!_toolExecutor) _toolExecutor = require('./tool_executor');
    return _toolExecutor;
}

// ============================================================
// 常量定义
// ============================================================

/** 历史记录最大条数 */
const MAX_HISTORY_SIZE = 50;

/** 历史记录查询返回条数 */
const HISTORY_QUERY_LIMIT = 20;

class DirectActionService {
    /**
     * @description 构造函数，初始化 LLM 服务和历史记录
     * @param {Object} llmService - LLM 服务实例，用于意图识别
     */
    constructor(llmService) {
        /** LLM 服务实例 */
        this.llmService = llmService;
        /** 搜索历史记录 */
        this.searchHistory = [];
        /** 操作历史记录 */
        this.actionHistory = [];
        /** 历史记录最大条数 */
        this.maxHistorySize = MAX_HISTORY_SIZE;
    }

    /**
     * @description 识别用户输入的意图
     * @param {string} text - 用户输入文本
     * @returns {Promise<{type: string, action?: string, searchType?: string, query?: string, params?: Object}>} 意图识别结果
     */
    async recognizeIntent(text) {
        return getIntentRecognizer().recognize(text, this.llmService);
    }

    /**
     * @description 执行搜索操作并记录到历史
     * @param {string} searchType - 搜索类型
     * @param {string} query - 搜索关键词
     * @returns {Promise<Object>} 搜索结果
     */
    async executeSearch(searchType, query) {
        const result = await getSearchExecutor().execute(searchType, query);
        this._addToHistory('search', { type: searchType, query, result });
        return result;
    }

    /**
     * @description 执行工具操作并记录到历史
     * @param {string} toolId - 工具标识
     * @param {Object} params - 工具参数
     * @returns {Promise<Object>} 工具执行结果
     */
    async executeTool(toolId, params = {}) {
        const result = await getToolExecutor().execute(toolId, params);
        this._addToHistory('tool', { toolId, params, result });
        return result;
    }

    /**
     * @description 直接执行用户文本，自动识别意图并路由到对应的执行器
     * @param {string} text - 用户输入文本
     * @returns {Promise<{success: boolean, message?: string}>} 执行结果
     */
    async directExecute(text) {
        try {
            const intent = await this.recognizeIntent(text);

            switch (intent.type) {
                case 'search':
                    return await this.executeSearch(intent.searchType, intent.query);
                case 'tool':
                    return await this.executeTool(intent.toolId, intent.params);
                case 'intent':
                    return await this.executeIntent(intent);
                default:
                    return { success: false, message: `Unrecognized intent type: ${intent.type}` };
            }
        } catch (error) {
            logger.error('[DirectActionService] direct execution failed:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 执行已识别的意图，根据动作类型路由到对应工具
     * @param {Object} intent - 意图对象
     * @param {string} intent.action - 动作类型
     * @param {Object} intent.params - 动作参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeIntent(intent) {
        const action = intent.action || intent.toolId;
        const params = intent.params || {};

        switch (action) {
            case 'weather':
            case 'alarm':
            case 'schedule':
            case 'reminder':
            case 'translate':
            case 'note':
            case 'calculator':
            case 'email':
            case 'summary':
            case 'code':
            case 'ppt':
                return await this.executeTool(action, params);
            default:
                return this.executeGenericTool(action, params);
        }
    }

    // ============================================================
    // 快捷执行方法：各工具的语义化入口
    // ============================================================

    /**
     * @description 执行天气查询
     * @param {Object} params - 查询参数
     * @returns {Promise<Object>} 天气查询结果
     */
    async executeWeather(params) {
        return await this.executeTool('weather', params);
    }

    /**
     * @description 执行闹钟设置
     * @param {Object} params - 闹钟参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeAlarm(params) {
        return await this.executeTool('alarm', params);
    }

    /**
     * @description 执行日程创建
     * @param {Object} params - 日程参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeSchedule(params) {
        return await this.executeTool('schedule', params);
    }

    /**
     * @description 执行提醒设置
     * @param {Object} params - 提醒参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeReminder(params) {
        return await this.executeTool('reminder', params);
    }

    /**
     * @description 执行翻译
     * @param {Object} params - 翻译参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeTranslate(params) {
        return await this.executeTool('translate', params);
    }

    /**
     * @description 执行笔记记录
     * @param {Object} params - 笔记参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeNote(params) {
        return await this.executeTool('note', params);
    }

    /**
     * @description 执行计算器
     * @param {Object} params - 计算参数
     * @returns {Promise<Object>} 计算结果
     */
    async executeCalculator(params) {
        return await this.executeTool('calculator', params);
    }

    /**
     * @description 执行邮件发送
     * @param {Object} params - 邮件参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeEmail(params) {
        return await this.executeTool('email', params);
    }

    /**
     * @description 执行内容总结
     * @param {Object} params - 总结参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeSummary(params) {
        return await this.executeTool('summary', params);
    }

    /**
     * @description 执行代码生成
     * @param {Object} params - 代码参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeCode(params) {
        return await this.executeTool('code', params);
    }

    /**
     * @description 执行 PPT 生成
     * @param {Object} params - PPT 参数
     * @returns {Promise<Object>} 执行结果
     */
    async executePPT(params) {
        return await this.executeTool('ppt', params);
    }

    /**
     * @description 执行未注册的通用工具，返回不可用状态
     * @param {string} tool - 工具标识
     * @param {Object} params - 工具参数
     * @returns {{success: false, message: string, tool: string, params: Object}} 不可用结果
     */
    async executeGenericTool(tool, params) {
        return {
            success: false,
            message: `No real direct-action executor is registered for tool: ${tool}`,
            tool,
            params
        };
    }

    // ============================================================
    // 历史记录管理
    // ============================================================

    /**
     * @description 添加操作记录到历史列表，超出上限时移除最早的记录
     * @param {string} type - 记录类型（search/tool）
     * @param {Object} data - 记录数据
     * @returns {void}
     */
    _addToHistory(type, data) {
        const entry = { type, data, timestamp: Date.now() };
        const history = type === 'search' ? this.searchHistory : this.actionHistory;

        history.push(entry);
        // 超出上限时移除最早的记录
        if (history.length > this.maxHistorySize) {
            history.splice(0, history.length - this.maxHistorySize);
        }
    }

    /**
     * @description 获取快捷工具列表
     * @returns {Array<Object>} 快捷工具列表
     */
    getQuickTools() {
        return getToolExecutor().getQuickTools();
    }

    /**
     * @description 获取快捷搜索列表
     * @returns {Array<Object>} 快捷搜索列表
     */
    getQuickSearches() {
        return getSearchExecutor().getQuickSearches();
    }

    /**
     * @description 获取最近20条搜索历史
     * @returns {Array<Object>} 搜索历史列表（按时间倒序）
     */
    getSearchHistory() {
        return this.searchHistory.slice(-HISTORY_QUERY_LIMIT).reverse();
    }

    /**
     * @description 获取最近20条操作历史
     * @returns {Array<Object>} 操作历史列表（按时间倒序）
     */
    getActionHistory() {
        return this.actionHistory.slice(-HISTORY_QUERY_LIMIT).reverse();
    }

    /**
     * @description 清除历史记录
     * @param {string} [type] - 记录类型（search/action），不传则清除全部
     * @returns {void}
     */
    clearHistory(type) {
        if (type === 'search') {
            this.searchHistory = [];
        } else if (type === 'action') {
            this.actionHistory = [];
        } else {
            this.searchHistory = [];
            this.actionHistory = [];
        }
    }
}

DirectActionService.QUICK_TOOLS = getToolExecutor().getQuickTools();

module.exports = DirectActionService;
