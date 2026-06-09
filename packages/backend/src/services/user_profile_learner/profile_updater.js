/**
 * @file profile_updater.js
 * @description 画像更新器 - 合并提取到的用户信息到画像数据中
 * @module services/user_profile_learner
 * @author xiaomeng
 * @version 1.1.0
 * @date 2026-06-09
 */

const { logger } = require('../../utils/logger');

class ProfileUpdater {
    constructor() {}

    /**
     * @description 更新画像 - 将提取到的信息合并到现有画像中
     * @param {Object} profile - 现有画像数据
     * @param {Object} extracted - 提取到的信息
     * @returns {Object} 更新后的画像
     */
    updateProfile(profile, extracted) {
        // 合并字符串字段
        if (extracted.name) {
            profile.name = extracted.name;
        }

        if (extracted.nickname) {
            profile.nickname = extracted.nickname;
        }

        if (extracted.occupation) {
            profile.occupation = extracted.occupation;
        }

        if (extracted.location) {
            profile.location = extracted.location;
        }

        // 合并数组字段 - 兴趣
        if (extracted.interests && extracted.interests.length > 0) {
            const existingInterests = profile.interests || [];
            profile.interests = [...new Set([...existingInterests, ...extracted.interests])];
        }

        // 合并性格特点
        if (extracted.personality && extracted.personality.length > 0) {
            const existingPersonality = profile.personality || [];
            profile.personality = [...new Set([...existingPersonality, ...extracted.personality])];
        }

        // 合并重要事情（追加，不去重以保留时间线）
        if (extracted.importantEvents && extracted.importantEvents.length > 0) {
            const existingEvents = profile.importantEvents || [];
            // 添加时间戳标记
            const timestampedEvents = extracted.importantEvents.map(event => ({
                content: event,
                createdAt: Date.now()
            }));
            profile.importantEvents = [...existingEvents, ...timestampedEvents];
        }

        // 合并纪念日
        if (extracted.anniversaries && extracted.anniversaries.length > 0) {
            const existingAnniversaries = profile.anniversaries || [];
            profile.anniversaries = [...new Set([...existingAnniversaries, ...extracted.anniversaries])];
        }

        // 合并开心时刻（追加，不去重以保留时间线）
        if (extracted.happyMoments && extracted.happyMoments.length > 0) {
            const existingHappy = profile.happyMoments || [];
            const timestampedHappy = extracted.happyMoments.map(moment => ({
                content: moment,
                createdAt: Date.now()
            }));
            profile.happyMoments = [...existingHappy, ...timestampedHappy];
        }

        // 合并难过时刻（追加，不去重以保留时间线）
        if (extracted.sadMoments && extracted.sadMoments.length > 0) {
            const existingSad = profile.sadMoments || [];
            const timestampedSad = extracted.sadMoments.map(moment => ({
                content: moment,
                createdAt: Date.now()
            }));
            profile.sadMoments = [...existingSad, ...timestampedSad];
        }

        // 合并生气时刻（追加，不去重以保留时间线）
        if (extracted.angryMoments && extracted.angryMoments.length > 0) {
            const existingAngry = profile.angryMoments || [];
            const timestampedAngry = extracted.angryMoments.map(moment => ({
                content: moment,
                createdAt: Date.now()
            }));
            profile.angryMoments = [...existingAngry, ...timestampedAngry];
        }

        // 更新偏好
        if (extracted.preferences) {
            profile.preferences = {
                ...profile.preferences,
                ...extracted.preferences
            };
        }

        // 增加互动计数
        profile.interactionCount = (profile.interactionCount || 0) + 1;

        return profile;
    }

    /**
     * @description 更新画像中的特定字段
     * @param {Object} profile - 画像数据
     * @param {string} field - 字段名
     * @param {*} value - 字段值
     * @returns {Object} 更新后的画像
     */
    updateField(profile, field, value) {
        profile[field] = value;
        return profile;
    }

    /**
     * @description 添加兴趣标签（去重）
     * @param {Object} profile - 画像数据
     * @param {string} interest - 兴趣标签
     * @returns {Object} 更新后的画像
     */
    addInterest(profile, interest) {
        const interests = profile.interests || [];
        if (!interests.includes(interest)) {
            interests.push(interest);
            profile.interests = interests;
        }
        return profile;
    }

    /**
     * @description 添加性格特点
     * @param {Object} profile - 画像数据
     * @param {string} trait - 性格特点
     * @returns {Object} 更新后的画像
     */
    addPersonality(profile, trait) {
        const personality = profile.personality || [];
        if (!personality.includes(trait)) {
            personality.push(trait);
            profile.personality = personality;
        }
        return profile;
    }

    /**
     * @description 添加重要事情
     * @param {Object} profile - 画像数据
     * @param {string} event - 重要事情
     * @returns {Object} 更新后的画像
     */
    addImportantEvent(profile, event) {
        const events = profile.importantEvents || [];
        events.push({
            content: event,
            createdAt: Date.now()
        });
        profile.importantEvents = events;
        return profile;
    }

    /**
     * @description 添加纪念日
     * @param {Object} profile - 画像数据
     * @param {string} anniversary - 纪念日
     * @returns {Object} 更新后的画像
     */
    addAnniversary(profile, anniversary) {
        const anniversaries = profile.anniversaries || [];
        if (!anniversaries.includes(anniversary)) {
            anniversaries.push(anniversary);
            profile.anniversaries = anniversaries;
        }
        return profile;
    }

    /**
     * @description 添加开心时刻
     * @param {Object} profile - 画像数据
     * @param {string} moment - 开心的事
     * @returns {Object} 更新后的画像
     */
    addHappyMoment(profile, moment) {
        const happyMoments = profile.happyMoments || [];
        happyMoments.push({
            content: moment,
            createdAt: Date.now()
        });
        profile.happyMoments = happyMoments;
        return profile;
    }

    /**
     * @description 添加难过时刻
     * @param {Object} profile - 画像数据
     * @param {string} moment - 难过的事
     * @returns {Object} 更新后的画像
     */
    addSadMoment(profile, moment) {
        const sadMoments = profile.sadMoments || [];
        sadMoments.push({
            content: moment,
            createdAt: Date.now()
        });
        profile.sadMoments = sadMoments;
        return profile;
    }

    /**
     * @description 添加生气时刻
     * @param {Object} profile - 画像数据
     * @param {string} moment - 生气的事
     * @returns {Object} 更新后的画像
     */
    addAngryMoment(profile, moment) {
        const angryMoments = profile.angryMoments || [];
        angryMoments.push({
            content: moment,
            createdAt: Date.now()
        });
        profile.angryMoments = angryMoments;
        return profile;
    }

    /**
     * @description 设置偏好项
     * @param {Object} profile - 画像数据
     * @param {string} key - 偏好键
     * @param {*} value - 偏好值
     * @returns {Object} 更新后的画像
     */
    setPreference(profile, key, value) {
        const preferences = profile.preferences || {};
        preferences[key] = value;
        profile.preferences = preferences;
        return profile;
    }

    /**
     * @description 重置画像为初始空状态
     * @param {Object} profile - 画像数据（忽略）
     * @returns {Object} 空画像数据
     */
    resetProfile(profile) {
        return {
            name: '',
            nickname: '',
            occupation: '',
            location: '',
            interests: [],
            personality: [],
            importantEvents: [],
            anniversaries: [],
            happyMoments: [],
            sadMoments: [],
            angryMoments: [],
            preferences: {},
            interactionCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }
}

module.exports = new ProfileUpdater();