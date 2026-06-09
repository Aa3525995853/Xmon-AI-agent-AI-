/**
 * @file episodic_store.js
 * @description 情景记忆存储 - 管理短期记忆和对话片段，支持时间衰减和相关性检索
 * @module memory_service/stores
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class EpisodicStore {
    constructor() {
        /** 最大存储条目数 - 超过则裁剪最旧的记录 */
        this.maxSize = 50;
        /** 记忆有效期（毫秒） - 24小时后自动过期 */
        this.ttl = 24 * 60 * 60 * 1000;
    }

    /**
     * @description 添加情景记忆 - 自动附加时间戳并清理过期记录
     * @param {Object} state - 当前状态对象
     * @param {Object} episode - 情景记忆对象 { content, emotion, topic }
     * @returns {Object} 更新后的状态对象
     */
    add(state, episode) {
        if (!state.memory.episodes) state.memory.episodes = [];

        state.memory.episodes.push({
            ...episode,
            timestamp: Date.now()
        });

        // 限制大小
        if (state.memory.episodes.length > this.maxSize) {
            state.memory.episodes = state.memory.episodes.slice(-this.maxSize);
        }

        // 清理过期记忆
        this._cleanup(state);

        return state;
    }

    /**
     * @description 回忆情景记忆 - 按查询关键词过滤并按时间排序
     * @param {Object} state - 当前状态对象
     * @param {string} query - 查询关键词
     * @param {number} limit - 最大返回条数
     * @returns {Array<Object>} 匹配的情景记忆列表 { content, timestamp, relevance }
     */
    recall(state, query, limit = 10) {
        if (!state.memory.episodes) return [];

        const now = Date.now();
        const episodes = state.memory.episodes
            .filter(e => now - e.timestamp < this.ttl)
            .filter(e => this._matches(e, query))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);

        return episodes.map(e => ({
            content: e.content,
            timestamp: e.timestamp,
            relevance: this._calculateRelevance(e, query)
        }));
    }

    /**
     * @description 判断情景记忆是否匹配查询 - 匹配内容、情绪和话题
     * @param {Object} episode - 情景记忆对象
     * @param {string} query - 查询关键词
     * @returns {boolean} 是否匹配
     */
    _matches(episode, query) {
        if (!query) return true;
        const q = query.toLowerCase();
        return (
            episode.content?.toLowerCase().includes(q) ||
            episode.emotion?.includes(q) ||
            episode.topic?.includes(q)
        );
    }

    /**
     * @description 计算情景记忆与查询的相关性分数 - 综合内容匹配、话题匹配和时间衰减
     * @param {Object} episode - 情景记忆对象
     * @param {string} query - 查询关键词
     * @returns {number} 相关性分数（0-1）
     */
    _calculateRelevance(episode, query) {
        if (!query) return 0.5;
        const q = query.toLowerCase();
        let score = 0;

        if (episode.content?.toLowerCase().includes(q)) score += 0.5;
        if (episode.topic?.toLowerCase().includes(q)) score += 0.3;
        if (episode.emotion === query) score += 0.2;

        // 时间衰减 - 越久远的记忆分数越低，最低保留 0.3
        const age = Date.now() - episode.timestamp;
        const ageFactor = Math.max(0.3, 1 - age / this.ttl);
        score *= ageFactor;

        return score;
    }

    /**
     * @description 清理过期的情景记忆
     * @param {Object} state - 当前状态对象
     */
    _cleanup(state) {
        const now = Date.now();
        state.memory.episodes = state.memory.episodes.filter(
            e => now - e.timestamp < this.ttl
        );
    }
}

module.exports = new EpisodicStore();