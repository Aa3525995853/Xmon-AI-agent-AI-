/**
 * @file unlock_manager.js
 * @description 解锁内容管理器 - 管理关系阶段对应的功能解锁，收集当前及之前阶段的所有已解锁内容
 * @module services/relationship_growth
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：各关系阶段解锁的内容列表
// ============================================================

/**
 * 解锁内容定义，按关系阶段分组
 * 每个解锁项包含 id（唯一标识）、name（名称）、description（描述）
 */
const UNLOCKS = {
    acquaintance: [
        { id: 'basic_chat', name: '基础聊天', description: '日常对话能力' }
    ],
    friend: [
        { id: 'remember_name', name: '记得名字', description: '小梦会记住你的名字' },
        { id: 'proactive_greeting', name: '主动问候', description: '小梦会主动打招呼' }
    ],
    good_friend: [
        { id: 'emotional_support', name: '情感支持', description: '安慰和鼓励' },
        { id: 'habit_learning', name: '习惯学习', description: '了解你的偏好' }
    ],
    intimate: [
        { id: 'nickname', name: '专属昵称', description: '可以叫你宝贝' },
        { id: 'deep_memory', name: '深度记忆', description: '记住重要的事情' }
    ]
};

class UnlockManager {
    /**
     * @description 构造函数，初始化解锁内容定义
     */
    constructor() {
        this.unlocks = UNLOCKS;
    }

    /**
     * @description 获取某阶段及之前所有阶段已解锁的内容
     * @param {string} stage - 关系阶段：stranger/acquaintance/friend/good_friend/intimate
     * @returns {Array<Object>} 已解锁内容数组，每项包含 id、name、description
     */
    getUnlocked(stage) {
        const unlocked = [];

        // 收集当前阶段及之前的所有解锁
        const stages = ['stranger', 'acquaintance', 'friend', 'good_friend', 'intimate'];
        const stageIndex = stages.indexOf(stage);

        for (let i = 0; i <= stageIndex; i++) {
            const s = stages[i];
            if (this.unlocks[s]) {
                unlocked.push(...this.unlocks[s]);
            }
        }

        return unlocked;
    }

    /**
     * @description 获取从旧阶段到新阶段新增的解锁内容
     * @param {string} oldStage - 旧关系阶段
     * @param {string} newStage - 新关系阶段
     * @returns {Array<Object>} 新增解锁内容数组
     */
    getNewUnlocks(oldStage, newStage) {
        const oldUnlocked = this.getUnlocked(oldStage);
        const newUnlocked = this.getUnlocked(newStage);

        const oldIds = new Set(oldUnlocked.map(u => u.id));

        return newUnlocked.filter(u => !oldIds.has(u.id));
    }

    /**
     * @description 检查特定功能在当前阶段是否已解锁
     * @param {string} unlockId - 功能唯一标识
     * @param {string} stage - 当前关系阶段
     * @returns {boolean} 是否已解锁
     */
    isUnlocked(unlockId, stage) {
        const unlocked = this.getUnlocked(stage);
        return unlocked.some(u => u.id === unlockId);
    }
}

module.exports = new UnlockManager();