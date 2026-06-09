/**
 * Knowledge 主入口 - 个人知识助理
 *
 * 构建个人知识图谱，学习用户习惯，实现持续学习
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');

// 延迟加载子模块
let _graphManager = null;
let _semanticMemory = null;
let _proceduralMemory = null;
let _episodicMemory = null;
let _profileManager = null;
let _forgetting = null;
let _storage = null;

function getGraphManager() {
    if (!_graphManager) _graphManager = require('./graph_manager');
    return _graphManager;
}

function getSemanticMemory() {
    if (!_semanticMemory) _semanticMemory = require('./semantic_memory');
    return _semanticMemory;
}

function getProceduralMemory() {
    if (!_proceduralMemory) _proceduralMemory = require('./procedural_memory');
    return _proceduralMemory;
}

function getEpisodicMemory() {
    if (!_episodicMemory) _episodicMemory = require('./episodic_memory');
    return _episodicMemory;
}

function getProfileManager() {
    if (!_profileManager) _profileManager = require('./profile_manager');
    return _profileManager;
}

function getForgetting() {
    if (!_forgetting) _forgetting = require('./forgetting');
    return _forgetting;
}

function getStorage() {
    if (!_storage) _storage = require('./storage');
    return _storage;
}

// 知识类型枚举
const KnowledgeType = {
    USER_PROFILE: 'user_profile',
    RELATIONSHIP: 'relationship',
    PREFERENCE: 'preference',
    HABIT: 'habit',
    PROJECT: 'project',
    CONTEXT: 'context'
};

// 记忆级别枚举
const MemoryLevel = {
    EPISODIC: 'episodic',
    SEMANTIC: 'semantic',
    PROCEDURAL: 'procedural'
};

class Knowledge extends EventEmitter {
    constructor() {
        super();

        this.graphManager = getGraphManager();
        this.semanticMemory = getSemanticMemory();
        this.proceduralMemory = getProceduralMemory();
        this.episodicMemory = getEpisodicMemory();
        this.profileManager = getProfileManager();
        this.forgetting = getForgetting();
        this.storage = getStorage();

        // 加载已有知识
        this._loadKnowledge();

        logger.info('[Knowledge] 个人知识助理初始化完成');
    }

    /**
     * 加载已有知识
     */
    _loadKnowledge() {
        this.storage.load(this);
    }

    /**
     * 保存知识
     */
    save() {
        this.storage.save(this);
    }

    /**
     * 学习新信息
     */
    learn(input, context = {}) {
        const timestamp = Date.now();

        // 1. 学习实体
        if (context.entities) {
            for (const entity of context.entities) {
                this.graphManager.learnEntity(entity, timestamp, this.graph);
            }
        }

        // 2. 学习关系
        if (context.relations) {
            for (const relation of context.relations) {
                this.graphManager.learnRelation(relation, timestamp, this.graph);
            }
        }

        // 3. 学习偏好
        if (context.preference) {
            this.semanticMemory.learn(context.preference, context.action, this.semanticMemory);
            this.profileManager.update(this.profileManager.profile, context.preference.profileUpdate);
        }

        // 4. 学习习惯
        if (context.action && context.success) {
            this.proceduralMemory.learn(context.action, context, this.proceduralMemory);
        }

        // 5. 记录情景
        if (context.event) {
            this.episodicMemory.record(context.event, context, this.episodicMemory);
        }

        // 应用遗忘
        this.forgetting.apply(
            this.semanticMemory,
            this.proceduralMemory,
            this.episodicMemory
        );

        // 延迟保存
        this._debouncedSave();
    }

    /**
     * 检索知识
     */
    retrieve(query, options = {}) {
        const { maxResults = 5 } = options;

        return {
            query,
            results: [],  // 简化的检索结果
            totalFound: 0,
            retrievalTime: 0
        };
    }

    /**
     * 获取用户画像
     */
    getProfile() {
        return this.profileManager.get();
    }

    /**
     * 更新用户画像
     */
    updateProfile(updates) {
        this.profileManager.update(this.profileManager.profile, updates);
        this._debouncedSave();
        return this.profileManager.profile;
    }

    /**
     * 延迟保存
     */
    _debouncedSave() {
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => this.save(), 5000);
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            totalMemories: 0,
            graphNodes: this.graph?.nodes?.size || 0,
            graphEdges: this.graph?.edges?.length || 0,
            episodicCount: this.episodicMemory?.memories?.length || 0
        };
    }

    /**
     * 清除所有记忆
     */
    clearAll() {
        this.graphManager?.clear();
        this.semanticMemory?.clear();
        this.proceduralMemory?.clear();
        this.episodicMemory?.clear();
        this.profileManager?.clear();
        this.save();
    }
}

const instance = new Knowledge();
module.exports = instance;
module.exports.Knowledge = Knowledge;
module.exports.KnowledgeType = KnowledgeType;
module.exports.MemoryLevel = MemoryLevel;