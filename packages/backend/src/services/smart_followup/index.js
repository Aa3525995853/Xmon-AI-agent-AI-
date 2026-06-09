/**
 * @file index.js
 * @description SmartFollowupService 主入口 - 智能后续服务。
 *              核心能力：分析任务结果、判断后续建议、生成智能后续提示、处理用户的后续选择
 * @module smart_followup
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载：子模块按需引入，减少启动时内存占用
// ============================================================

/** @type {ActionRegistry|null} 动作注册器延迟加载缓存 */
let _actionRegistry = null;
/** @type {HintGenerator|null} 提示语生成器延迟加载缓存 */
let _hintGenerator = null;
/** @type {ActionHandler|null} 动作处理器延迟加载缓存 */
let _actionHandler = null;

/**
 * @description 延迟加载动作注册器模块
 * @returns {ActionRegistry} 动作注册器实例
 */
function getActionRegistry() {
    if (!_actionRegistry) _actionRegistry = require('./action_registry');
    return _actionRegistry;
}

/**
 * @description 延迟加载提示语生成器模块
 * @returns {HintGenerator} 提示语生成器实例
 */
function getHintGenerator() {
    if (!_hintGenerator) _hintGenerator = require('./hint_generator');
    return _hintGenerator;
}

/**
 * @description 延迟加载动作处理器模块
 * @returns {ActionHandler} 动作处理器实例
 */
function getActionHandler() {
    if (!_actionHandler) _actionHandler = require('./action_handler');
    return _actionHandler;
}

// ============================================================
// 核心类：SmartFollowupService
// 功能说明：协调动作注册、提示生成和动作执行的智能后续服务
// ============================================================

/** 历史记录最大保留条数 */
const MAX_HISTORY_LENGTH = 10;

/** 历史记录对外返回的最大条数 */
const HISTORY_RETURN_LIMIT = 5;

/** 后续建议返回的最大数量 */
const SUGGESTION_RETURN_LIMIT = 3;

/** 长回复的字符阈值，超过此长度使用换行分隔提示语 */
const LONG_RESPONSE_THRESHOLD = 200;

class SmartFollowupService {

    /**
     * @description 构造函数，初始化子模块和状态
     */
    constructor() {
        this.actionRegistry = getActionRegistry();
        this.hintGenerator = getHintGenerator();
        this.actionHandler = getActionHandler();

        /** @type {Object|null} 最近一次任务结果 */
        this.lastResult = null;
        /** @type {string|null} 最近一次检测到的任务类型 */
        this.lastResultType = null;
        /** @type {Array<{type: string, taskText: string, timestamp: number}>} 操作历史记录 */
        this.history = [];

        logger.info('[SmartFollowup] 智能后续服务初始化完成');
    }

    /**
     * @description 分析任务结果，检测任务类型并生成后续建议
     * @param {string} taskText - 原始任务文本
     * @param {Object} result - 任务执行结果对象
     * @param {string} [responseContent=''] - 助手回复内容
     * @returns {{type: string, suggestions: Array, hint: string|null, canFollowup: boolean}} 分析结果，包含类型、建议列表和提示语
     */
    analyzeResult(taskText, result, responseContent = '') {
        // 将任务文本、回复内容和结果合并后进行类型检测
        const combinedText = `${taskText} ${responseContent} ${JSON.stringify(result || {})}`;

        // 检测任务类型
        let detectedType = this.actionRegistry.detectType(combinedText);

        // 更新最近结果，供后续 generateFollowupPrompt 使用
        this.lastResult = result;
        this.lastResultType = detectedType;

        // 获取后续建议
        let suggestions = this.actionRegistry.getSuggestions(detectedType);

        // 记录历史，保留最近 MAX_HISTORY_LENGTH 条
        this.history.unshift({ type: detectedType, taskText, timestamp: Date.now() });
        if (this.history.length > MAX_HISTORY_LENGTH) this.history = this.history.slice(0, MAX_HISTORY_LENGTH);

        // 生成提示语
        const hint = this.hintGenerator.generate(detectedType, suggestions);

        return {
            type: detectedType,
            suggestions: suggestions.slice(0, SUGGESTION_RETURN_LIMIT),
            hint,
            canFollowup: suggestions.length > 0
        };
    }

    /**
     * @description 根据最近的任务类型生成后续提示语，追加到回复内容末尾
     * @param {string} responseContent - 当前回复内容
     * @returns {string} 追加了后续提示的回复内容，无后续时返回空字符串
     */
    generateFollowupPrompt(responseContent) {
        if (!this.lastResultType || !this.canFollowup()) return '';

        const suggestions = this.actionRegistry.getSuggestions(this.lastResultType);
        if (suggestions.length === 0) return '';

        const hint = this.hintGenerator.generate(this.lastResultType, suggestions);

        // 长回复使用换行分隔，短回复使用空格分隔
        if (responseContent.length > LONG_RESPONSE_THRESHOLD) {
            return `\n\n💡 ${hint}`;
        } else {
            return ` ${hint}`;
        }
    }

    /**
     * @description 处理用户选择的后续动作
     * @param {string} action - 动作标识符
     * @returns {{success: boolean, action?: string, prompt?: string, implemented?: boolean, message?: string}} 动作执行结果
     */
    handleFollowupAction(action) {
        return this.actionHandler.execute(action);
    }

    /**
     * @description 获取最近一次检测到的任务类型
     * @returns {string|null} 任务类型标识
     */
    getLastType() {
        return this.lastResultType;
    }

    /**
     * @description 获取最近的操作历史记录（最多5条）
     * @returns {Array<{type: string, taskText: string, timestamp: number}>} 历史记录列表
     */
    getHistory() {
        return this.history.slice(0, HISTORY_RETURN_LIMIT);
    }

    /**
     * @description 检查当前是否可以进行后续操作
     * @returns {boolean} 是否有可用的后续建议
     */
    canFollowup() {
        return this.lastResultType !== null && this.actionRegistry.hasSuggestions(this.lastResultType);
    }
}

const instance = new SmartFollowupService();
module.exports = instance;
module.exports.SmartFollowupService = SmartFollowupService;
module.exports.FOLLOWUP_ACTIONS = getActionRegistry().FOLLOWUP_ACTIONS;