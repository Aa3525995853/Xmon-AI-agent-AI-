/**
 * @file milestone_tracker.js
 * @description 里程碑追踪器 - 定义和追踪关系成长里程碑，根据交互类型和积分判断里程碑达成
 * @module services/relationship_growth
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：里程碑列表和阶段阈值
// ============================================================

/**
 * 里程碑定义列表
 * 每个里程碑包含 id（唯一标识）、name（名称）、points（所需积分）、type（交互类型）
 */
const MILESTONES = [
    { id: 'first_meet', name: '初次相遇', points: 10, type: 'meet' },
    { id: 'voice_meet', name: '声音相遇', points: 20, type: 'voice' },
    { id: 'chat_10', name: '聊10次', points: 50, type: 'chat' },
    { id: 'chat_50', name: '聊50次', points: 100, type: 'chat' },
    { id: 'chat_100', name: '聊100次', points: 200, type: 'chat' },
    { id: 'chat_500', name: '聊500次', points: 500, type: 'chat' },
    { id: 'deep_talk', name: '深度交流', points: 80, type: 'deep' },
    { id: 'happy_together', name: '一起开心', points: 60, type: 'happy' },
    { id: 'comfort', name: '安慰时刻', points: 70, type: 'comfort' },
    { id: 'week_7', name: '连续7天', points: 150, type: 'streak' },
    { id: 'month_30', name: '连续30天', points: 300, type: 'streak' },
    { id: 'share_name', name: '分享名字', points: 30, type: 'personal' },
    { id: 'share_birthday', name: '分享生日', points: 40, type: 'personal' }
];

/**
 * 阶段阈值定义，积分达到对应阈值即升级到该阶段
 * stranger(0) → acquaintance(50) → friend(150) → good_friend(300) → intimate(500)
 */
const STAGE_THRESHOLDS = {
    stranger: 0,
    acquaintance: 50,
    friend: 150,
    good_friend: 300,
    intimate: 500
};

class MilestoneTracker {
    /**
     * @description 构造函数，初始化里程碑和阶段阈值
     */
    constructor() {
        this.milestones = MILESTONES;
        this.thresholds = STAGE_THRESHOLDS;
    }

    /**
     * @description 检查是否有新里程碑达成，对比已达成里程碑列表找出新达成的
     * @param {Array<Object>} currentMilestones - 已达成的里程碑列表
     * @param {string} interactionType - 当前交互类型
     * @param {number} totalPoints - 当前总积分
     * @returns {Array<Object>} 新达成的里程碑列表，每项包含里程碑信息和 achievedAt 时间戳
     */
    check(currentMilestones, interactionType, totalPoints) {
        const newMilestones = [];
        const achievedIds = new Set(currentMilestones.map(m => m.id));

        for (const milestone of this.milestones) {
            if (achievedIds.has(milestone.id)) continue;

            // 检查是否达成
            if (this._checkMilestone(milestone, interactionType, totalPoints)) {
                newMilestones.push({
                    ...milestone,
                    achievedAt: Date.now()
                });
            }
        }

        return newMilestones;
    }

    /**
     * @description 检查单个里程碑是否达成，优先按交互类型匹配，其次按积分判断
     * @param {Object} milestone - 里程碑定义
     * @param {string} interactionType - 当前交互类型
     * @param {number} totalPoints - 当前总积分
     * @returns {boolean} 是否达成
     * @private
     */
    _checkMilestone(milestone, interactionType, totalPoints) {
        // 按类型检查
        if (milestone.type === interactionType) {
            return totalPoints >= milestone.points;
        }

        // 按积分检查
        return totalPoints >= milestone.points;
    }

    /**
     * @description 获取下一个尚未达成的里程碑
     * @param {Array<Object>} achievedMilestones - 已达成的里程碑列表
     * @returns {Object|null} 下一个里程碑，全部达成返回 null
     */
    getNext(achievedMilestones) {
        const achievedIds = new Set(achievedMilestones.map(m => m.id));

        for (const milestone of this.milestones) {
            if (!achievedIds.has(milestone.id)) {
                return milestone;
            }
        }

        return null;
    }

    /**
     * @description 获取所有里程碑定义列表
     * @returns {Array<Object>} 里程碑定义数组
     */
    getAll() {
        return this.milestones;
    }

    /**
     * @description 根据积分获取对应的关系阶段
     * @param {number} points - 当前总积分
     * @returns {string} 关系阶段名称：stranger/acquaintance/friend/good_friend/intimate
     */
    getStageForPoints(points) {
        let stage = 'stranger';

        for (const [stageName, threshold] of Object.entries(this.thresholds)) {
            if (points >= threshold) {
                stage = stageName;
            }
        }

        return stage;
    }
}

module.exports = new MilestoneTracker();