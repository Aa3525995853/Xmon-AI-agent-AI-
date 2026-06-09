/**
 * @file knowledge.js
 * @description 个人知识管理 - 检索相关知识、构建意图上下文、学习成功经验和失败模式
 * @module services/executor
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const memoryService = require('../memory_service');

/** 习惯模式最大保存数量，超过后保留最近的记录 */
const MAX_HABIT_PATTERNS = 100;

/** 失败模式最大保存数量，超过后保留最近的记录 */
const MAX_CUSTOM_RULES = 50;

class Knowledge {
    /**
     * @description 构造函数，初始化偏好、习惯模式和自定义规则
     */
    constructor() {
        /** @type {Object} 用户偏好映射，key为"类型_操作"，value为使用统计 */
        this.preferences = {};
        /** @type {Array<Object>} 习惯模式列表，记录成功的操作模式 */
        this.habitPatterns = [];
        /** @type {Array<Object>} 自定义规则列表，记录失败的模式 */
        this.customRules = [];
    }

    /**
     * @description 检索与查询相关的知识，从记忆和习惯模式中匹配
     * @param {string} query - 查询关键词
     * @param {Object} [options={}] - 检索选项
     * @param {number} [options.maxResults=5] - 最大返回结果数
     * @returns {Array<Object>} 匹配的知识列表
     */
    retrieve(query, options = {}) {
        const { maxResults = 5 } = options;

        const memory = memoryService.legacyMemoryService;

        // 从记忆中检索
        let results = [];

        if (memory && memory.recall) {
            const recallResult = memory.recall(query, { limit: maxResults });
            if (recallResult.semantic) {
                results = results.concat(recallResult.semantic.facts || []);
            }
        }

        // 从习惯模式中匹配
        const matchedHabits = this._matchHabits(query);
        results = results.concat(matchedHabits);

        return results.slice(0, maxResults);
    }

    /**
     * @description 构建意图上下文，整合用户偏好、最近话题和习惯模式
     * @param {string} query - 查询关键词
     * @returns {Object} 意图上下文 { preferences, recentTopics, patterns, relevantPreferences? }
     */
    buildIntentContext(query) {
        const context = {
            preferences: this.preferences,
            recentTopics: this._getRecentTopics(),
            patterns: this.habitPatterns
        };

        // 添加用户偏好到上下文
        const matchedPreferences = this._matchPreferences(query);
        if (matchedPreferences.length > 0) {
            context.relevantPreferences = matchedPreferences;
        }

        return context;
    }

    /**
     * @description 获取用户画像摘要，包含偏好、习惯数量、规则数量和最近话题
     * @returns {Object} 用户画像 { preferences, habitCount, ruleCount, recentTopics, memoryLoaded }
     */
    getProfile() {
        const memory = memoryService.legacyMemoryService;

        return {
            preferences: this.preferences,
            habitCount: this.habitPatterns.length,
            ruleCount: this.customRules.length,
            recentTopics: this._getRecentTopics(),
            memoryLoaded: !!memory
        };
    }

    /**
     * @description 从成功的意图执行中学习，记录习惯模式和用户偏好
     * @param {Object} intent - 意图对象，包含 originalInput、type、action、targets
     * @param {Object} result - 执行结果
     */
    learn(intent, result) {
        // 提取习惯模式
        const habit = {
            input: intent.originalInput,
            type: intent.type,
            action: intent.action,
            targets: intent.targets,
            timestamp: Date.now()
        };

        // 避免重复
        const exists = this.habitPatterns.some(h =>
            h.input === habit.input && h.type === habit.type
        );

        if (!exists) {
            this.habitPatterns.push(habit);
            // 超过上限时保留最近的记录，避免内存无限增长
            if (this.habitPatterns.length > MAX_HABIT_PATTERNS) {
                this.habitPatterns = this.habitPatterns.slice(-MAX_HABIT_PATTERNS);
            }
        }

        // 学习偏好
        if (intent.targets?.length > 0) {
            const key = `${intent.type}_${intent.action}`;
            this.preferences[key] = {
                lastUsed: Date.now(),
                count: (this.preferences[key]?.count || 0) + 1,
                value: intent.targets
            };
        }
    }

    /**
     * @description 从失败的意图执行中学习，记录失败模式供后续避免
     * @param {Object} intent - 意图对象，包含 originalInput
     * @param {Object} result - 执行结果，包含 error 信息
     */
    learnFromFailure(intent, result) {
        // 记录失败模式
        const failure = {
            input: intent.originalInput,
            error: result.error,
            timestamp: Date.now()
        };

        this.customRules.push(failure);
        // 超过上限时保留最近的记录，避免内存无限增长
        if (this.customRules.length > MAX_CUSTOM_RULES) {
            this.customRules = this.customRules.slice(-MAX_CUSTOM_RULES);
        }
    }

    /**
     * @description 获取最近的话题列表
     * @returns {Array<Object>} 最近5个话题
     * @private
     */
    _getRecentTopics() {
        const memory = memoryService.legacyMemoryService;
        if (memory && memory.state && memory.state.topic) {
            return memory.state.topic.history?.slice(-5) || [];
        }
        return [];
    }

    /**
     * @description 从习惯模式中匹配与查询相关的模式
     * @param {string} query - 查询关键词
     * @returns {Array<Object>} 匹配的习惯模式，最多返回3条
     * @private
     */
    _matchHabits(query) {
        const q = query.toLowerCase();
        return this.habitPatterns
            .filter(h => h.input.toLowerCase().includes(q))
            .slice(-3);
    }

    /**
     * @description 从用户偏好中匹配与查询相关的偏好项
     * @param {string} query - 查询关键词
     * @returns {Array<Object>} 匹配的偏好项列表
     * @private
     */
    _matchPreferences(query) {
        const matched = [];
        const q = query.toLowerCase();

        for (const [key, pref] of Object.entries(this.preferences)) {
            if (key.toLowerCase().includes(q)) {
                matched.push({ key, ...pref });
            }
        }

        return matched;
    }
}

module.exports = new Knowledge();