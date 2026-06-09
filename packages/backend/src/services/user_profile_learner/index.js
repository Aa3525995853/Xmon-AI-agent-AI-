/**
 * @file index.js
 * @description UserProfileLearner 主入口 - 用户画像学习，从对话中自动提取和更新用户信息
 * @module services/user_profile_learner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

// 延迟加载子模块
let _extractor = null;
let _updater = null;

function getExtractor() {
    if (!_extractor) _extractor = require('./profile_extractor');
    return _extractor;
}

function getUpdater() {
    if (!_updater) _updater = require('./profile_updater');
    return _updater;
}

/** 用户实例缓存 */
const instances = new Map();
/** UUID 正则 - 验证用户ID格式 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @description 获取用户画像学习器实例（按用户ID缓存）
 * @param {string} userId - 用户ID，默认为 'legacy'
 * @returns {UserProfileLearner} 画像学习器实例
 * @throws {Error} 用户ID格式无效时抛出异常
 */
function getUserProfileLearner(userId = 'legacy') {
    if (process.env.ENABLE_AUTH !== 'true') {
        return instances.get('legacy') || createLegacyInstance();
    }

    if (userId !== 'legacy' && !UUID_REGEX.test(userId)) {
        throw new Error('Invalid User ID format');
    }

    if (!instances.has(userId)) {
        instances.set(userId, new UserProfileLearner(userId));
    }
    return instances.get(userId);
}

/**
 * @description 创建 legacy 模式的画像学习器实例
 * @returns {UserProfileLearner} 画像学习器实例
 */
function createLegacyInstance() {
    if (!instances.has('legacy')) {
        instances.set('legacy', new UserProfileLearner('legacy'));
    }
    return instances.get('legacy');
}

/**
 * @description 清理指定用户的画像缓存
 * @param {string} userId - 用户ID
 * @returns {void}
 */
function clearUserProfileCache(userId) {
    if (instances.has(userId)) {
        instances.delete(userId);
        console.log(`[用户画像] 已清理用户缓存: ${userId}`);
    }
}

class UserProfileLearner {
    constructor(userId = 'legacy') {
        this.userId = userId;
        this.profilePath = this._getProfilePath(userId);

        this.extractor = getExtractor();
        this.updater = getUpdater();

        this.profile = this.loadProfile();
        this.recentConversations = [];
        this.maxRecentConversations = 10;

        logger.info(`[用户画像] 初始化 (userId: ${userId})`);
    }

    _getProfilePath(userId) {
        if (userId === 'legacy') {
            return path.join(__dirname, '..', 'data', 'user_profile.json');
        }
        return path.join(__dirname, '..', 'data', 'users', userId, 'profile.json');
    }

    loadProfile() {
        try {
            if (fs.existsSync(this.profilePath)) {
                const data = fs.readFileSync(this.profilePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (e) {
            console.error(`[用户画像] 加载失败 (userId: ${this.userId}):`, e.message);
        }
        return this.getDefaultProfile();
    }

    getDefaultProfile() {
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

    saveProfile() {
        try {
            const dataDir = path.dirname(this.profilePath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            this.profile.updatedAt = Date.now();
            const tmpPath = this.profilePath + '.tmp';
            fs.writeFileSync(tmpPath, JSON.stringify(this.profile, null, 2), 'utf8');
            fs.renameSync(tmpPath, this.profilePath);

        } catch (e) {
            console.error(`[用户画像] 保存失败 (userId: ${this.userId}):`, e.message);
        }
    }

    /**
     * 从对话中学习
     */
    async learnFromConversation(conversation) {
        this.recentConversations.push(conversation);

        if (this.recentConversations.length > this.maxRecentConversations) {
            this.recentConversations.shift();
        }

        // 提取信息
        const extracted = await this.extractor.extract(conversation);

        // 更新画像
        this.updater.updateProfile(this.profile, extracted);

        this.saveProfile();

        return {
            success: true,
            extracted,
            profile: this.profile
        };
    }

    /**
     * 获取画像
     */
    getProfile() {
        return this.profile;
    }

    /**
     * 获取昵称
     */
    getNickname() {
        return this.profile.nickname || this.profile.name || '朋友';
    }

    /**
     * 获取偏好
     */
    getPreferences() {
        return this.profile.preferences || {};
    }

    /**
     * 增量更新
     */
    updateField(field, value) {
        this.profile[field] = value;
        this.saveProfile();
    }

    /**
     * 获取画像摘要（供上下文引擎使用）
     */
    getProfileSummary() {
        const p = this.profile;
        const lines = [];

        if (p.name) {
            lines.push(`- 姓名: ${p.name}`);
        }
        if (p.nickname) {
            lines.push(`- 称呼: ${p.nickname}`);
        }
        if (p.occupation) {
            lines.push(`- 职业: ${p.occupation}`);
        }
        if (p.location) {
            lines.push(`- 地点: ${p.location}`);
        }
        if (p.personality && p.personality.length > 0) {
            lines.push(`- 性格: ${p.personality.join('、')}`);
        }
        if (p.interests && p.interests.length > 0) {
            lines.push(`- 兴趣: ${p.interests.join('、')}`);
        }
        if (p.importantEvents && p.importantEvents.length > 0) {
            const events = p.importantEvents.slice(-3).map(e =>
                typeof e === 'string' ? e : e.content
            );
            lines.push(`- 重要事项: ${events.join('、')}`);
        }
        if (p.anniversaries && p.anniversaries.length > 0) {
            lines.push(`- 纪念日: ${p.anniversaries.join('、')}`);
        }
        if (p.happyMoments && p.happyMoments.length > 0) {
            const happy = p.happyMoments.slice(-2).map(e =>
                typeof e === 'string' ? e : e.content
            );
            lines.push(`- 开心的事: ${happy.join('、')}`);
        }
        if (p.sadMoments && p.sadMoments.length > 0) {
            const sad = p.sadMoments.slice(-2).map(e =>
                typeof e === 'string' ? e : e.content
            );
            lines.push(`- 难过的事: ${sad.join('、')}`);
        }
        if (p.interactionCount > 0) {
            lines.push(`- 互动次数: ${p.interactionCount}`);
        }

        if (lines.length === 0) {
            return '（暂无用户画像数据）';
        }
        return lines.join('\n');
    }
}

module.exports = {
    getUserProfileLearner,
    clearUserProfileCache
};