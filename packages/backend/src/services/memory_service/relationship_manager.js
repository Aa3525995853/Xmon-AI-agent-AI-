/**
 * @file relationship_manager.js
 * @description 关系管理器 - 管理用户与 AI 之间的关系等级、称呼、信任度和熟悉度
 * @module memory_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class RelationshipManager {
    constructor() {
        // ============================================================
        // 模块名称：关系等级定义
        // 功能说明：定义5个关系等级，从陌生人到亲密伙伴
        // ============================================================

        /** 关系等级枚举 */
        this.LEVELS = {
            STRANGER: 1,      // 陌生人
            ACQUAINTANCE: 2,  // 认识的人
            FRIEND: 3,        // 朋友
            GOOD_FRIEND: 4,   // 好朋友
            CLOSE: 5          // 亲密伙伴
        };

        // 称呼映射：默认称呼永远为"老大"，不随关系阶段变化
        // 关系加深只影响小梦关心的主动程度，不影响称呼
        this.ADDRESS_FORMS = {
            1: '老大',
            2: '老大',
            3: '老大',
            4: '老大',
            5: '老大'
        };
    }

    /**
     * @description 获取关系等级的中文名称
     * @param {number} level - 关系等级数字（1-5）
     * @returns {string} 等级中文名称
     */
    getLevelName(level) {
        const names = {
            1: '陌生人',
            2: '认识的人',
            3: '朋友',
            4: '好朋友',
            5: '亲密伙伴'
        };
        return names[level] || '陌生人';
    }

    /**
     * @description 获取指定等级的称呼方式
     * @param {number} level - 关系等级数字
     * @returns {string} 称呼方式
     */
    getAddressForm(level) {
        return this.ADDRESS_FORMS[level] || '老大';
    }

    /**
     * @description 判断是否满足升级条件 - 基于互动次数和熟悉度的多级阈值
     * @param {Object} state - 当前状态对象
     * @param {Object} state.relationship - 关系状态
     * @param {number} state.relationship.level - 当前等级
     * @param {number} state.relationship.recentInteractions - 最近互动次数
     * @param {number} state.relationship.familiarity - 熟悉度（0-1）
     * @returns {boolean} 是否满足升级条件
     */
    shouldLevelUp(state) {
        const interactions = state.relationship.recentInteractions;
        const familiarity = state.relationship.familiarity;

        // 升级条件
        if (state.relationship.level >= 5) return false;
        if (interactions >= 50 && familiarity >= 0.8) return true;
        if (interactions >= 20 && familiarity >= 0.6) return true;
        if (interactions >= 10 && familiarity >= 0.5) return true;

        return false;
    }

    /**
     * @description 执行升级操作 - 提升关系等级并重置互动计数
     * @param {Object} state - 当前状态对象
     * @returns {Object} 更新后的状态对象
     */
    levelUp(state) {
        if (state.relationship.level < 5) {
            state.relationship.level++;
        }
        state.relationship.recentInteractions = 0;
        return state;
    }

    /**
     * @description 更新熟悉度 - 在 0-1 范围内增减
     * @param {Object} state - 当前状态对象
     * @param {number} delta - 熟悉度变化量（正数增加，负数减少）
     * @returns {Object} 更新后的状态对象
     */
    updateFamiliarity(state, delta) {
        state.relationship.familiarity = Math.max(0, Math.min(1,
            state.relationship.familiarity + delta
        ));
        return state;
    }

    /**
     * @description 更新信任度 - 在 0-1 范围内增减
     * @param {Object} state - 当前状态对象
     * @param {number} delta - 信任度变化量
     * @returns {Object} 更新后的状态对象
     */
    updateTrust(state, delta) {
        state.relationship.trust = Math.max(0, Math.min(1,
            state.relationship.trust + delta
        ));
        return state;
    }

    /**
     * @description 获取关系摘要信息
     * @param {Object} state - 当前状态对象
     * @returns {Object} 关系摘要 { level, levelName, addressForm, trust, familiarity, interactions }
     */
    getRelationshipSummary(state) {
        return {
            level: state.relationship.level,
            levelName: this.getLevelName(state.relationship.level),
            addressForm: this.getAddressForm(state.relationship.level),
            trust: state.relationship.trust,
            familiarity: state.relationship.familiarity,
            interactions: state.relationship.recentInteractions
        };
    }

    /**
     * @description 检查是否达成里程碑 - 基于互动次数和关系等级
     * @param {Object} state - 当前状态对象
     * @returns {Array<string>} 达成的里程碑描述列表
     */
    checkMilestones(state) {
        const milestones = [];
        const interactions = state.relationship.recentInteractions;

        if (interactions === 10) milestones.push('聊了10次');
        if (interactions === 50) milestones.push('聊了50次');
        if (interactions === 100) milestones.push('聊了100次');
        if (state.relationship.level === 3) milestones.push('成为朋友');
        if (state.relationship.level === 4) milestones.push('成为好朋友');
        if (state.relationship.level === 5) milestones.push('成为亲密伙伴');

        return milestones;
    }
}

module.exports = new RelationshipManager();