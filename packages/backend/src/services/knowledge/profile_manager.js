/**
 * 用户画像管理器
 */

class ProfileManager {
    constructor() {
        this.profile = {
            id: 'default',
            name: null,
            occupation: null,
            interests: [],
            preferences: {},
            traits: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    /**
     * 更新画像
     */
    update(profile, updates) {
        if (!profile) profile = this.profile;
        Object.assign(profile, updates);
        profile.updatedAt = Date.now();
    }

    /**
     * 获取画像
     */
    get() {
        return { ...this.profile };
    }

    /**
     * 清除
     */
    clear() {
        this.profile = {
            id: 'default',
            name: null,
            preferences: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }
}

module.exports = new ProfileManager();