/**
 * @file 记忆服务主入口
 * @description 多用户版记忆服务，关系是动态变量，每轮对话都会变化
 *              六维状态建模：环境、时间、记忆、情感、话题、关系
 * @module services/memory_service
 * @version 1.0.0
 * @date 2026-06-06
 */

const fs = require('fs');
const path = require('path');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../../config/runtimePaths');

// ============================================================
// 常量定义
// ============================================================

/** UUID v4 正则校验 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 实例缓存池 */
const instances = new Map();

// 延迟加载子模块
let _stateManager = null;
let _episodicStore = null;
let _semanticStore = null;
let _relationshipManager = null;

/**
 * 获取状态管理器实例（延迟加载）
 * @returns {Object} 状态管理器
 */
function getStateManager() {
    if (!_stateManager) _stateManager = require('./state_manager');
    return _stateManager;
}

/**
 * 获取情景记忆存储实例（延迟加载）
 * @returns {Object} 情景记忆存储
 */
function getEpisodicStore() {
    if (!_episodicStore) _episodicStore = require('./stores/episodic_store');
    return _episodicStore;
}

/**
 * 获取语义记忆存储实例（延迟加载）
 * @returns {Object} 语义记忆存储
 */
function getSemanticStore() {
    if (!_semanticStore) _semanticStore = require('./stores/semantic_store');
    return _semanticStore;
}

/**
 * 获取关系管理器实例（延迟加载）
 * @returns {Object} 关系管理器
 */
function getRelationshipManager() {
    if (!_relationshipManager) _relationshipManager = require('./relationship_manager');
    return _relationshipManager;
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 获取记忆服务实例（多用户支持）
 * @param {string} userId - 用户ID，默认 'legacy'
 * @returns {MemoryService} 记忆服务实例
 */
function getMemoryService(userId = 'legacy') {
    if (process.env.ENABLE_AUTH !== 'true') {
        return instances.get('legacy') || createLegacyInstance();
    }

    if (userId !== 'legacy' && !UUID_REGEX.test(userId)) {
        throw new Error('Invalid User ID format');
    }

    if (!instances.has(userId)) {
        instances.set(userId, new MemoryService(userId));
    }
    return instances.get(userId);
}

/**
 * 创建遗留用户实例
 * @returns {MemoryService} 记忆服务实例
 */
function createLegacyInstance() {
    if (!instances.has('legacy')) {
        instances.set('legacy', new MemoryService('legacy'));
    }
    return instances.get('legacy');
}

/**
 * 清理指定用户的记忆缓存
 * @param {string} userId - 用户ID
 */
function clearMemoryCache(userId) {
    if (instances.has(userId)) {
        const instance = instances.get(userId);
        if (instance && typeof instance.stopAsyncSettlement === 'function') {
            instance.stopAsyncSettlement();
        }
        instances.delete(userId);
        console.log(`[记忆服务] 已清理用户缓存: ${userId}`);
    }
}

// ============================================================
// 记忆服务主类
// ============================================================

/**
 * 记忆服务类
 * 负责六维状态建模、异步记忆结算、防模式坍缩
 * @class
 */
class MemoryService {
    /**
     * 构造函数
     * @param {string} userId - 用户ID
     */
    constructor(userId = 'legacy') {
        this.userId = userId;
        this.dataPath = dataPath('users', `user_${userId}`, 'memory.json');
        this.shortTerm = new Map();
        this._saveTimeout = null;

        // 初始化六维状态
        this.state = {
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

        // 加载已有数据
        this._loadData();
    }

    /**
     * 从磁盘加载数据
     * @private
     */
    _loadData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
                this.state = { ...this.state, ...data };
            }
        } catch (e) {
            console.log('[记忆服务] 加载记忆失败:', e.message);
        }
    }

    /**
     * 保存数据到磁盘
     * @private
     */
    _saveData() {
        try {
            const dir = path.dirname(this.dataPath);
            ensureDir(dir);
            fs.writeFileSync(this.dataPath, JSON.stringify(this.state, null, 2), 'utf-8');
        } catch (e) {
            console.error('[记忆服务] 保存记忆失败:', e.message);
        }
    }

    // ============ 核心方法 ============
    async remember(conversation, options = {}) {
        const { autoSave = true } = options;

        // 更新状态
        this._updateTimeState();
        this._updateEmotionState(conversation);
        this._updateTopicState(conversation);

        if (autoSave) {
            this._debouncedSave();
        }

        return { success: true, state: this.state };
    }

    async recall(query, options = {}) {
        const { limit = 10 } = options;

        // 从记忆库检索
        const episodic = getEpisodicStore().recall(this.state, query, limit);
        const semantic = getSemanticStore().recall(this.state, query, limit);

        return {
            episodic,
            semantic,
            currentTopic: this.state.topic.current,
            relationship: this.state.relationship
        };
    }

    async learn(fact, source = 'conversation') {
        const semanticStore = getSemanticStore();
        semanticStore.addFact(this.state, fact, source);
        this._debouncedSave();
        return { success: true };
    }

    async getContext() {
        return {
            userId: this.userId,
            state: this.state,
            recentTopics: this.state.topic.history.slice(-5),
            relationship: this.state.relationship
        };
    }

    _updateTimeState() {
        this.state.time.lastActive = Date.now();
        this.state.time.sessionCount++;
    }

    _updateEmotionState(conversation) {
        // 简化版情绪更新
        const emotions = conversation.map(c => c.emotion).filter(Boolean);
        if (emotions.length > 0) {
            this.state.emotion.recentEmotions = emotions.slice(-5);
            this.state.emotion.dominantEmotion = this._getMostFrequent(emotions);
        }
    }

    _updateTopicState(conversation) {
        const lastMessage = conversation[conversation.length - 1];
        if (lastMessage && lastMessage.content) {
            const topic = this._extractTopic(lastMessage.content);
            if (topic && topic !== this.state.topic.current) {
                this.state.topic.history.push({
                    topic,
                    timestamp: Date.now()
                });
                this.state.topic.current = topic;
                this.state.topic.depth = 1;
            }
        }
    }

    _extractTopic(text) {
        const topicPatterns = [
            /关于(.+?)的/,
            /在谈(.+?)$/,
            /(工作|学习|生活|感情|健康|家庭)方面/
        ];
        for (const p of topicPatterns) {
            const m = text.match(p);
            if (m) return m[1];
        }
        return null;
    }

    _getMostFrequent(arr) {
        const freq = {};
        arr.forEach(v => freq[v] = (freq[v] || 0) + 1);
        return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    }

    _debouncedSave() {
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => this._saveData(), 5000);
    }

    stopAsyncSettlement() {
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
    }
}

// ============ 导出 ============
const legacyMemoryService = getMemoryService('legacy');

// 添加兼容方法到 legacyMemoryService
legacyMemoryService.getFullState = function() {
    return {
        relationship: this.state.relationship,
        environment: this.state.environment,
        time: this.state.time,
        memory: this.state.memory,
        emotion: this.state.emotion,
        topic: this.state.topic
    };
};

legacyMemoryService.getRelationshipStageLabel = function(stage) {
    const labels = {
        stranger: '陌生人',
        acquaintance: '认识的人',
        friend: '朋友',
        close_friend: '好朋友',
        intimate: '亲密伙伴'
    };
    return labels[stage] || '未知';
};

legacyMemoryService.getStats = function() {
    return {
        totalInteractions: this.state.time.sessionCount,
        currentTopic: this.state.topic.current,
        dominantEmotion: this.state.emotion.dominantEmotion,
        relationshipLevel: this.state.relationship.level
    };
};

legacyMemoryService.getAllPreferences = function(category = 'all') {
    return this.state.memory.preferences || [];
};

legacyMemoryService.getFrequentTopics = function(limit = 10) {
    return this.state.topic.history.slice(-limit).map(h => h.topic);
};

legacyMemoryService.getRecentInteractions = function(limit = 10) {
    return [];
};

legacyMemoryService.getEmotionHistory = function(userId, limit = 10) {
    return this.state.emotion.recentEmotions.slice(-limit);
};

legacyMemoryService.clearConversationHistory = function() {
    // 简化实现
    return true;
};

legacyMemoryService.exportMemories = function() {
    return {
        state: this.state,
        userId: this.userId
    };
};

legacyMemoryService.clearAllMemories = function() {
    this.state = {
        environment: { lastLocation: 'unknown', deviceType: 'pc', ambientCues: [] },
        time: { lastActive: Date.now(), sessionCount: 0, dailyActiveHours: [] },
        memory: { topics: [], facts: [], preferences: [] },
        emotion: { recentEmotions: [], dominantEmotion: 'neutral', emotionTrend: 'stable' },
        topic: { current: null, history: [], depth: 0 },
        relationship: { level: 1, trust: 0.5, familiarity: 0.3, recentInteractions: 0 }
    };
    this._saveData();
    return true;
};

legacyMemoryService.getCoreMemories = function() {
    return {
        userFacts: this.state.memory.facts || [],
        preferences: this.state.memory.preferences || [],
        recentTopics: this.state.topic.history.slice(-5)
    };
};

legacyMemoryService.saveData = function() {
    this._saveData();
    return true;
};

legacyMemoryService.addConversation = function(role, content) {
    if (!this._conversationHistory) this._conversationHistory = [];
    this._conversationHistory.push({ role, content, timestamp: Date.now() });
    if (this._conversationHistory.length > 100) {
        this._conversationHistory = this._conversationHistory.slice(-100);
    }
};

legacyMemoryService.getConversationHistory = function(limit = 20) {
    if (!this._conversationHistory) this._conversationHistory = [];
    return this._conversationHistory.slice(-limit);
};

legacyMemoryService.getShortTerm = function(namespace, key) {
    const fullKey = `${namespace}:${key}`;
    return this.shortTerm.get(fullKey) || null;
};

legacyMemoryService.setShortTerm = function(namespace, key, value) {
    const fullKey = `${namespace}:${key}`;
    if (value === null || value === undefined) {
        this.shortTerm.delete(fullKey);
    } else {
        this.shortTerm.set(fullKey, value);
    }
};

legacyMemoryService.updateRelationship = function(userMessage, assistantMessage, emotion = 'neutral') {
    this.state.relationship.recentInteractions++;
    if (this.state.relationship.trust < 1) {
        this.state.relationship.trust = Math.min(1, this.state.relationship.trust + 0.01);
    }
    if (this.state.relationship.familiarity < 1) {
        this.state.relationship.familiarity = Math.min(1, this.state.relationship.familiarity + 0.005);
    }
    if (this.state.relationship.recentInteractions >= 50) {
        this.state.relationship.level = Math.min(5, this.state.relationship.level + 1);
        this.state.relationship.recentInteractions = 0;
    }
    this._debouncedSave();
};

legacyMemoryService.recordInteraction = function(userMessage, assistantMessage, type = 'chat', emotion = 'neutral') {
    this.addConversation('user', userMessage);
    this.addConversation('assistant', assistantMessage);
    this.state.time.lastActive = Date.now();
    this.state.time.sessionCount++;
    this.state.emotion.recentEmotions.push(emotion);
    if (this.state.emotion.recentEmotions.length > 20) {
        this.state.emotion.recentEmotions = this.state.emotion.recentEmotions.slice(-20);
    }
    this._debouncedSave();
};

legacyMemoryService.getPendingTasks = function() {
    if (!this._pendingTasks) this._pendingTasks = [];
    return this._pendingTasks;
};

legacyMemoryService.addPendingTask = function(taskName, description) {
    if (!this._pendingTasks) this._pendingTasks = [];
    this._pendingTasks.push({ name: taskName, description, createdAt: Date.now(), status: 'pending' });
};

legacyMemoryService.completeTask = function(taskName) {
    if (!this._pendingTasks) this._pendingTasks = [];
    const task = this._pendingTasks.find(t => t.name === taskName);
    if (task) task.status = 'completed';
};

module.exports = {
    getMemoryService,
    clearMemoryCache,
    legacyMemoryService
};