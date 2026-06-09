/**
 * @file profile_manager.js
 * @description 用户画像管理器 - 管理用户画像的读取、更新和学习，
 *              通过对话内容自动提取用户信息（姓名、职业等）并持久化存储
 * @module smart_memory
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：默认画像模板
// ============================================================

/** 默认画像模板 - 新用户初始化时使用的画像结构 */
const DEFAULT_PROFILE = {
    nickname: '',
    name: '',
    occupation: '',
    location: '',
    preferences: {
        tone: 'warm',
        language: 'zh'
    },
    interests: [],
    dislikes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
};

// ============================================================
// 核心类：ProfileManager
// 功能说明：提供用户画像的 CRUD 操作和对话学习能力
// ============================================================

class ProfileManager {

    /**
     * @description 构造函数
     */
    constructor() {}

    /**
     * @description 读取用户画像，若文件不存在则返回默认画像
     * @param {string} filepath - 画像文件的绝对路径
     * @returns {Promise<{success: boolean, profile?: Object, message?: string}>} 画像数据
     */
    async get(filepath) {
        try {
            // 文件不存在时返回默认画像，而非报错
            if (!fs.existsSync(filepath)) {
                return { success: true, profile: { ...DEFAULT_PROFILE } };
            }

            const content = fs.readFileSync(filepath, 'utf-8');
            const profile = JSON.parse(content);

            return { success: true, profile };

        } catch (error) {
            logger.error('[画像] 读取失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 更新用户画像，采用合并策略保留已有字段
     * @param {string} filepath - 画像文件的绝对路径
     * @param {Object} updates - 要更新的画像字段（浅合并）
     * @returns {Promise<{success: boolean, profile?: Object, message?: string}>} 更新后的完整画像
     */
    async update(filepath, updates) {
        try {
            // 以默认画像为基础，合并已有数据，再合并新更新
            let profile = { ...DEFAULT_PROFILE };

            if (fs.existsSync(filepath)) {
                const content = fs.readFileSync(filepath, 'utf-8');
                profile = { ...profile, ...JSON.parse(content) };
            }

            // 合并更新，updatedAt 始终刷新为当前时间
            const updatedProfile = {
                ...profile,
                ...updates,
                updatedAt: new Date().toISOString()
            };

            // 确保目录存在，防止写入时因目录缺失而失败
            const dir = path.dirname(filepath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filepath, JSON.stringify(updatedProfile, null, 2), 'utf-8');

            return { success: true, profile: updatedProfile };

        } catch (error) {
            logger.error('[画像] 更新失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 从对话内容中学习用户信息，自动提取姓名、职业等并更新画像
     * @param {string} filepath - 画像文件的绝对路径
     * @param {Object} conversation - 对话数据对象，需包含 messages 数组
     * @param {Array<{content: string}>} conversation.messages - 消息列表
     * @returns {Promise<{success: boolean, profile?: Object, message?: string}>} 学习后的画像结果
     */
    async learnFromConversation(filepath, conversation) {
        try {
            const current = await this.get(filepath);
            const profile = current.profile || DEFAULT_PROFILE;

            // 从对话中提取结构化信息
            const extracted = this._extractProfileInfo(conversation);

            const updatedProfile = {
                ...profile,
                ...extracted,
                updatedAt: new Date().toISOString()
            };

            return this.update(filepath, updatedProfile);

        } catch (error) {
            logger.error('[画像] 学习失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 从对话消息中提取用户基本信息（姓名、职业等），使用正则模式匹配
     * @param {Object} conversation - 对话数据对象
     * @param {Array<{content: string}>} conversation.messages - 消息列表
     * @returns {Object} 提取到的用户信息键值对，如 { name: '张三', occupation: '工程师' }
     * @private
     */
    _extractProfileInfo(conversation) {
        const info = {};

        const messages = conversation.messages || [];

        for (const msg of messages) {
            const text = msg.content || '';

            // 匹配"我叫XXX"模式提取姓名
            if (text.includes('我叫') || text.includes('我是')) {
                const match = text.match(/我叫(.+?)[，,。]/);
                if (match) info.name = match[1];
            }

            // 匹配"职业是XXX"模式提取职业
            if (text.includes('职业是') || text.includes('工作')) {
                const match = text.match(/职业是(.+?)[，,。]/);
                if (match) info.occupation = match[1];
            }
        }

        return info;
    }
}

module.exports = new ProfileManager();