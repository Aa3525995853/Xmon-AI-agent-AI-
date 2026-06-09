/**
 * @file profile_manager.js
 * @description 用户配置管理器 - 加载、保存和更新用户画像配置（身份、场所、模式、偏好等）
 * @module context_engine
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');

/** 用户配置文件存储路径 */
const PROFILE_PATH = path.join(__dirname, '..', '..', 'data', 'user_profile.json');

class ProfileManager {
    constructor() {
        /** @type {Object} 用户配置对象 */
        this.profile = this.load();
    }

    /**
     * @description 从文件加载用户配置，文件不存在时返回默认配置
     * @returns {Object} 用户配置对象
     */
    load() {
        try {
            if (fs.existsSync(PROFILE_PATH)) {
                return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
            }
        } catch (e) {}
        return this.getDefault();
    }

    /**
     * @description 获取默认用户配置
     * @returns {Object} 默认配置对象
     */
    getDefault() {
        return {
            identity: { role: 'employee', nickname: '主人', xiaomeng_style: 'cute' },
            locations: {},
            modes: {},
            time_rules: {},
            learned: { topics_interested: [], dislike: [] },
            relationship: { days_together: 0, conversations_count: 0 }
        };
    }

    /**
     * @description 保存用户配置到文件
     */
    save() {
        try {
            fs.writeFileSync(PROFILE_PATH, JSON.stringify(this.profile, null, 2), 'utf8');
        } catch (e) {
            console.error('[ProfileManager] 保存失败:', e.message);
        }
    }

    /**
     * @description 获取当前用户配置
     * @returns {Object} 用户配置对象
     */
    get() {
        return this.profile;
    }

    /**
     * @description 更新用户配置 - 合并更新字段并自动保存
     * @param {Object} updates - 需要更新的配置字段
     */
    update(updates) {
        this.profile = { ...this.profile, ...updates };
        this.save();
    }
}

module.exports = new ProfileManager();