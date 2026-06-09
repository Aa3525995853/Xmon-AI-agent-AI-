/**
 * @file 关系成长系统主入口
 * @description 情感成长系统，让关系不仅是数字，而是有温度的成长旅程
 *              支持关系阶段升级、里程碑解锁、称呼变化
 * @module services/relationship_growth
 * @version 1.0.0
 * @date 2026-06-06
 */

const { logger } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../../config/runtimePaths');

// ============================================================
// 常量定义
// ============================================================

/** 关系阶段枚举 */
const RELATIONSHIP_STAGES = {
    STRANGER: 'stranger',
    ACQUAINTANCE: 'acquaintance',
    FRIEND: 'friend',
    GOOD_FRIEND: 'good_friend',
    INTIMATE: 'intimate'
};

/** 阶段顺序数组 */
const STAGE_ORDER = [
    RELATIONSHIP_STAGES.STRANGER,
    RELATIONSHIP_STAGES.ACQUAINTANCE,
    RELATIONSHIP_STAGES.FRIEND,
    RELATIONSHIP_STAGES.GOOD_FRIEND,
    RELATIONSHIP_STAGES.INTIMATE
];

/** UUID 正则表达式 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 实例缓存 */
const instances = new Map();

// 延迟加载子模块
let _milestoneTracker = null;
let _addressManager = null;
let _unlockManager = null;

/**
 * 获取里程碑追踪器实例（延迟加载）
 * @returns {Object} 里程碑追踪器
 */
function getMilestoneTracker() {
    if (!_milestoneTracker) _milestoneTracker = require('./milestone_tracker');
    return _milestoneTracker;
}

/**
 * 获取称呼管理器实例（延迟加载）
 * @returns {Object} 称呼管理器
 */
function getAddressManager() {
    if (!_addressManager) _addressManager = require('./address_manager');
    return _addressManager;
}

/**
 * 获取解锁管理器实例（延迟加载）
 * @returns {Object} 解锁管理器
 */
function getUnlockManager() {
    if (!_unlockManager) _unlockManager = require('./unlock_manager');
    return _unlockManager;
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 获取关系成长服务实例（多用户支持）
 * @param {string} userId - 用户ID，默认 'legacy'
 * @returns {RelationshipGrowth} 关系成长服务实例
 */
function getRelationshipGrowth(userId = 'legacy') {
    if (process.env.ENABLE_AUTH !== 'true') {
        return instances.get('legacy') || createLegacyInstance();
    }

    if (userId !== 'legacy' && !UUID_REGEX.test(userId)) {
        throw new Error('Invalid User ID format');
    }

    if (!instances.has(userId)) {
        instances.set(userId, new RelationshipGrowth(userId));
    }
    return instances.get(userId);
}

/**
 * 创建遗留用户实例
 * @returns {RelationshipGrowth} 关系成长服务实例
 */
function createLegacyInstance() {
    if (!instances.has('legacy')) {
        instances.set('legacy', new RelationshipGrowth('legacy'));
    }
    return instances.get('legacy');
}

// ============================================================
// RelationshipGrowth 类
// ============================================================

/**
 * 关系成长服务类
 * 负责管理用户关系阶段、积分、里程碑和解锁内容
 * @class
 */
class RelationshipGrowth {
    /**
     * 构造函数
     * @param {string} userId - 用户ID
     */
    constructor(userId = 'legacy') {
        this.userId = userId;
        this.dataDir = this._getDataDir(userId);
        this.statePath = path.join(this.dataDir, 'relationship_state.json');

        this.milestoneTracker = getMilestoneTracker();
        this.addressManager = getAddressManager();
        this.unlockManager = getUnlockManager();

        this.init();
    }

    /**
     * 获取数据目录路径
     * @param {string} userId - 用户ID
     * @returns {string} 数据目录路径
     */
    _getDataDir(userId) {
        if (userId === 'legacy') {
            return dataPath();
        }
        return dataPath('users', userId);
    }

    /**
     * 初始化服务
     */
    init() {
        ensureDir(this.dataDir);

        if (!fs.existsSync(this.statePath)) {
            this._initState();
        }
    }

    /**
     * 初始化关系状态
     * @private
     */
    _initState() {
        const initialState = {
            stage: RELATIONSHIP_STAGES.STRANGER,
            level: 0,
            points: 0,
            milestones: [],
            unlocked: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        fs.writeFileSync(this.statePath, JSON.stringify(initialState, null, 2), 'utf-8');
    }

    /**
     * 获取当前状态
     * @returns {Object} 关系状态信息
     */
    getStatus() {
        try {
            const state = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));

            return {
                success: true,
                stage: state.stage,
                stageName: this._getStageName(state.stage),
                level: state.level,
                points: state.points,
                nextMilestone: this.milestoneTracker.getNext(state.milestones),
                address: this.addressManager.getAddress(state.stage),
                unlocked: state.unlocked
            };

        } catch (error) {
            logger.error('[关系成长] 获取状态失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * 添加互动
     * @param {string} type - 互动类型
     * @returns {Object} 添加结果
     */
    async addInteraction(type) {
        try {
            const state = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));

            // 添加积分
            state.points += this._getPointsForInteraction(type);

            // 检查里程碑
            const newMilestones = this.milestoneTracker.check(state.milestones, type, state.points);

            if (newMilestones.length > 0) {
                state.milestones.push(...newMilestones);

                // 检查是否升级
                const newStage = this.milestoneTracker.getStageForPoints(state.points);
                if (STAGE_ORDER.indexOf(newStage) > STAGE_ORDER.indexOf(state.stage)) {
                    state.stage = newStage;
                }

                state.level++;
            }

            state.updatedAt = Date.now();
            fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf-8');

            return {
                success: true,
                addedPoints: this._getPointsForInteraction(type),
                newMilestones,
                stage: state.stage
            };

        } catch (error) {
            logger.error('[关系成长] 添加互动失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * 获取当前称呼
     * @returns {string} 称呼
     */
    getAddress() {
        const state = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
        return this.addressManager.getAddress(state.stage);
    }

    /**
     * 获取所有里程碑
     * @returns {Array} 里程碑列表
     */
    getMilestones() {
        return this.milestoneTracker.getAll();
    }

    /**
     * 获取已解锁内容
     * @returns {Array} 解锁内容列表
     */
    getUnlocked() {
        const state = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
        return this.unlockManager.getUnlocked(state.stage);
    }

    /**
     * 获取阶段名称
     * @param {string} stage - 阶段
     * @returns {string} 阶段名称
     */
    _getStageName(stage) {
        const names = {
            stranger: '陌生人',
            acquaintance: '认识的人',
            friend: '朋友',
            good_friend: '好朋友',
            intimate: '亲密伙伴'
        };
        return names[stage] || '陌生人';
    }

    /**
     * 获取互动类型的积分
     * @param {string} type - 互动类型
     * @returns {number} 积分
     */
    _getPointsForInteraction(type) {
        const points = {
            chat: 1,
            voice: 2,
            task: 5,
            celebration: 10
        };
        return points[type] || 1;
    }
}

module.exports = {
    getRelationshipGrowth,
    RELATIONSHIP_STAGES
};