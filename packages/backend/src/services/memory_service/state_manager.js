/**
 * @file state_manager.js
 * @description 状态管理器 - 管理六维状态（环境、时间、记忆、情绪、话题、关系）的更新和持久化
 * @module memory_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/** 情绪历史最大保留条数 */
const MAX_EMOTION_HISTORY = 10;

/** 记忆类型最大保留条数 */
const MAX_MEMORY_ENTRIES = 100;

class StateManager {
    constructor() {
        /** 六维状态默认值 */
        this.defaultState = {
            environment: {
                lastLocation: 'unknown',
                deviceType: 'pc',
                ambientCues: []
            },
            time: {
                lastActive: Date.now(),
                sessionCount: 0,
                dailyActiveHours: []
            },
            memory: {
                topics: [],
                facts: [],
                preferences: []
            },
            emotion: {
                recentEmotions: [],
                dominantEmotion: 'neutral',
                emotionTrend: 'stable'
            },
            topic: {
                current: null,
                history: [],
                depth: 0
            },
            relationship: {
                level: 1,
                trust: 0.5,
                familiarity: 0.3,
                recentInteractions: 0
            }
        };
    }

    /**
     * @description 创建全新的默认状态对象（深拷贝）
     * @returns {Object} 初始状态对象
     */
    createState() {
        return JSON.parse(JSON.stringify(this.defaultState));
    }

    /**
     * @description 更新环境信息
     * @param {Object} state - 当前状态对象
     * @param {Object} info - 环境信息更新字段
     * @returns {Object} 更新后的状态对象
     */
    updateEnvironment(state, info) {
        state.environment = { ...state.environment, ...info };
        return state;
    }

    /**
     * @description 更新时间状态 - 刷新最后活跃时间和会话计数
     * @param {Object} state - 当前状态对象
     * @returns {Object} 更新后的状态对象
     */
    updateTime(state) {
        state.time.lastActive = Date.now();
        state.time.sessionCount++;
        return state;
    }

    /**
     * @description 更新情绪状态 - 记录情绪历史并计算主导情绪
     * @param {Object} state - 当前状态对象
     * @param {string} emotion - 当前情绪标签
     * @returns {Object} 更新后的状态对象
     */
    updateEmotion(state, emotion) {
        state.emotion.recentEmotions.push({
            emotion,
            timestamp: Date.now()
        });
        state.emotion.recentEmotions = state.emotion.recentEmotions.slice(-MAX_EMOTION_HISTORY);

        // 计算主导情绪 - 取最近历史中出现频率最高的情绪
        const freq = {};
        state.emotion.recentEmotions.forEach(e => {
            freq[e.emotion] = (freq[e.emotion] || 0) + 1;
        });
        state.emotion.dominantEmotion = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])[0][0];

        return state;
    }

    /**
     * @description 更新话题状态 - 切换话题时记录历史，延续话题时增加深度
     * @param {Object} state - 当前状态对象
     * @param {string} topic - 当前话题
     * @returns {Object} 更新后的状态对象
     */
    updateTopic(state, topic) {
        if (topic && topic !== state.topic.current) {
            state.topic.history.push({
                topic,
                timestamp: Date.now()
            });
            state.topic.current = topic;
            state.topic.depth = 1;
        } else if (topic) {
            state.topic.depth++;
        }
        return state;
    }

    /**
     * @description 更新关系状态 - 调整等级、信任度、熟悉度并增加互动计数
     * @param {Object} state - 当前状态对象
     * @param {Object} delta - 变化量 { level, trust, familiarity }
     * @returns {Object} 更新后的状态对象
     */
    updateRelationship(state, delta) {
        if (delta.level) state.relationship.level = Math.max(1, Math.min(10, state.relationship.level + delta.level));
        if (delta.trust) state.relationship.trust = Math.max(0, Math.min(1, state.relationship.trust + delta.trust));
        if (delta.familiarity) state.relationship.familiarity = Math.max(0, Math.min(1, state.relationship.familiarity + delta.familiarity));
        state.relationship.recentInteractions++;
        return state;
    }

    /**
     * @description 添加记忆条目 - 按类型存储，超过上限时裁剪最旧的
     * @param {Object} state - 当前状态对象
     * @param {string} type - 记忆类型（topics/facts/preferences）
     * @param {string} content - 记忆内容
     * @returns {Object} 更新后的状态对象
     */
    addMemory(state, type, content) {
        if (!state.memory[type]) state.memory[type] = [];
        state.memory[type].push({
            content,
            timestamp: Date.now()
        });
        // 限制大小 - 保留最近条目
        state.memory[type] = state.memory[type].slice(-MAX_MEMORY_ENTRIES);
        return state;
    }

    /**
     * @description 获取状态摘要 - 提取关键状态信息用于快速查看
     * @param {Object} state - 当前状态对象
     * @returns {Object} 状态摘要 { lastActive, dominantEmotion, currentTopic, relationshipLevel, sessionCount }
     */
    getStateSummary(state) {
        return {
            lastActive: state.time.lastActive,
            dominantEmotion: state.emotion.dominantEmotion,
            currentTopic: state.topic.current,
            relationshipLevel: state.relationship.level,
            sessionCount: state.time.sessionCount
        };
    }
}

module.exports = new StateManager();