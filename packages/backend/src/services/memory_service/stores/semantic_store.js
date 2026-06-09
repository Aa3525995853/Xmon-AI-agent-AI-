/**
 * @file semantic_store.js
 * @description 语义记忆存储 - 管理长期记忆、事实和用户偏好，支持去重和相似度检测
 * @module memory_service/stores
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class SemanticStore {
    constructor() {
        /** 最大事实存储条数 */
        this.maxFacts = 200;
        /** 最大偏好存储条数 */
        this.maxPreferences = 50;
    }

    /**
     * @description 添加事实 - 自动去重（内容相同或相似则跳过）
     * @param {Object} state - 当前状态对象
     * @param {string} fact - 事实内容
     * @param {string} source - 事实来源（默认 'conversation'）
     * @returns {Object} 更新后的状态对象
     */
    addFact(state, fact, source = 'conversation') {
        if (!state.memory.facts) state.memory.facts = [];

        // 检查是否已存在
        const exists = state.memory.facts.some(
            f => f.content === fact || this._isSimilar(f.content, fact)
        );
        if (exists) return state;

        state.memory.facts.push({
            content: fact,
            source,
            timestamp: Date.now(),
            accessCount: 0
        });

        // 限制大小
        if (state.memory.facts.length > this.maxFacts) {
            state.memory.facts = state.memory.facts.slice(-this.maxFacts);
        }

        return state;
    }

    /**
     * @description 添加用户偏好 - 超过上限时删除最旧的偏好
     * @param {Object} state - 当前状态对象
     * @param {string} key - 偏好键名
     * @param {*} value - 偏好值
     * @returns {Object} 更新后的状态对象
     */
    addPreference(state, key, value) {
        if (!state.memory.preferences) state.memory.preferences = {};

        state.memory.preferences[key] = {
            value,
            timestamp: Date.now(),
            confidence: 0.5
        };

        // 限制大小
        const keys = Object.keys(state.memory.preferences);
        if (keys.length > this.maxPreferences) {
            const oldest = keys.sort((a, b) =>
                state.memory.preferences[a].timestamp - state.memory.preferences[b].timestamp
            )[0];
            delete state.memory.preferences[oldest];
        }

        return state;
    }

    /**
     * @description 检索记忆 - 同时搜索事实和偏好
     * @param {Object} state - 当前状态对象
     * @param {string} query - 查询关键词
     * @param {number} limit - 最大返回事实条数
     * @returns {Object} 检索结果 { facts, preferences }
     */
    recall(state, query, limit = 10) {
        const facts = this._searchFacts(state, query, limit);
        const preferences = this._searchPreferences(state, query);
        return { facts, preferences };
    }

    /**
     * @description 搜索事实 - 按关键词过滤，按访问次数排序，自动增加访问计数
     * @param {Object} state - 当前状态对象
     * @param {string} query - 查询关键词
     * @param {number} limit - 最大返回条数
     * @returns {Array<Object>} 匹配的事实列表 { content, confidence }
     */
    _searchFacts(state, query, limit) {
        if (!state.memory.facts) return [];

        const q = query.toLowerCase();
        return state.memory.facts
            .filter(f => !q || f.content.toLowerCase().includes(q))
            .sort((a, b) => b.accessCount - a.accessCount)
            .slice(0, limit)
            .map(f => {
                f.accessCount++;
                return { content: f.content, confidence: Math.min(1, f.accessCount / 10) };
            });
    }

    /**
     * @description 搜索偏好 - 按键名或值匹配
     * @param {Object} state - 当前状态对象
     * @param {string} query - 查询关键词
     * @returns {Object} 匹配的偏好键值对
     */
    _searchPreferences(state, query) {
        if (!state.memory.preferences) return {};
        if (!query) return state.memory.preferences;

        const q = query.toLowerCase();
        const result = {};

        for (const [key, pref] of Object.entries(state.memory.preferences)) {
            if (key.toLowerCase().includes(q) || String(pref.value).toLowerCase().includes(q)) {
                result[key] = pref;
            }
        }

        return result;
    }

    /**
     * @description 简单的相似度检测 - 通过包含关系判断两个字符串是否相似
     * @param {string} a - 字符串A
     * @param {string} b - 字符串B
     * @returns {boolean} 是否相似
     */
    _isSimilar(a, b) {
        // 简单的相似度检测
        const normA = a.toLowerCase().replace(/\s/g, '');
        const normB = b.toLowerCase().replace(/\s/g, '');
        return normA.includes(normB) || normB.includes(normA);
    }
}

module.exports = new SemanticStore();