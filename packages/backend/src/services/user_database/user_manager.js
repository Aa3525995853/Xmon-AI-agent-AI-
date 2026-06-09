/**
 * @file user_manager.js
 * @description 用户管理器 - 用户查找、目录创建、用户列表等操作
 * @module services/user_database
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');

class UserManager {
    /**
     * @description 按用户名查找用户
     * @param {Object} users - 用户数据映射
     * @param {string} username - 用户名
     * @returns {Object|undefined} 用户数据
     */
    findByUsername(users, username) {
        return Object.values(users).find(u => u.username === username);
    }

    /**
     * @description 按用户ID查找用户
     * @param {Object} users - 用户数据映射
     * @param {string} userId - 用户ID
     * @returns {Object|undefined} 用户数据
     */
    findById(users, userId) {
        return users[userId];
    }

    /**
     * @description 创建用户数据目录，初始化记忆文件和用户画像
     * @param {string} userId - 用户ID
     * @returns {void}
     */
    createUserDirectory(userId) {
        const userDir = path.join(__dirname, '..', '..', 'data', 'users', `user_${userId}`);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }

        // 初始化空的记忆文件
        const memoryPath = path.join(userDir, 'memory.json');
        if (!fs.existsSync(memoryPath)) {
            fs.writeFileSync(memoryPath, JSON.stringify({
                state: {
                    environment: { lastLocation: 'unknown', deviceType: 'pc', ambientCues: [] },
                    time: { lastInteraction: 0, relativeTime: '', timeAnchor: '', sessionDuration: 0 },
                    memory: { core: [], episodic: [], semantic: {}, daily: [] },
                    emotion: { current: 'calm', momentum: 0, history: [], lastUserEmotion: 'neutral', empathyLevel: 0.5 },
                    topic: { current: '', history: [], depth: 0, transitionCount: 0 },
                    relationship: { intimacy: 0.3, trust: 0.4, familiarity: 0.2, emotionalBond: 0.1, sharedExperiences: [], lastSignificantEvent: '', interactionCount: 0, relationshipStage: 'stranger' }
                },
                emotionState: { lastEmotion: 'calm', lastTopic: '', lastWords: '', lastTimestamp: 0, sessionId: 0 },
                vocabulary: {},
                timeAnchored: [],
                responsePatterns: { recentResponses: [], styleDistribution: {}, lastPhraseHashes: [] },
                interactions: [],
                topics: [],
                emotions: []
            }, null, 2), 'utf8');
        }

        // 初始化用户画像
        const profilePath = path.join(userDir, 'user_profile.json');
        if (!fs.existsSync(profilePath)) {
            fs.writeFileSync(profilePath, JSON.stringify({
                identity: {},
                learned: {},
                preferences: {},
                habits: {},
                createdAt: new Date().toISOString()
            }, null, 2), 'utf8');
        }
    }

    /**
     * @description 获取用户列表（去除密码哈希等敏感信息）
     * @param {Object} users - 用户数据映射
     * @returns {Array<Object>} 脱敏后的用户列表
     */
    getUserList(users) {
        return Object.values(users).map(u => ({
            userId: u.userId,
            username: u.username,
            role: u.role || 'user',
            createdAt: u.createdAt,
            lastLogin: u.lastLogin
        }));
    }
}

module.exports = new UserManager();