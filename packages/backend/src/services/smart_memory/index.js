/**
 * @file index.js
 * @description SmartMemory 主入口 - 智能记忆服务，让小梦不仅记住，还能主动"想起"。
 *              提供按用户隔离的记忆实例管理，包括 Wiki、对话存储和用户画像功能
 * @module smart_memory
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

// ============================================================
// 常量定义：实例缓存与校验规则
// ============================================================

/** 实例缓存 - 按用户 ID 缓存 SmartMemory 实例，避免重复创建 */
const instances = new Map();

/** UUID 正则校验 - 用于验证用户 ID 格式的合法性 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================
// 延迟加载：子模块按需引入，减少启动时内存占用
// ============================================================

/** @type {WikiManager|null} Wiki 管理器延迟加载缓存 */
let _wikiManager = null;
/** @type {ConversationStore|null} 对话存储延迟加载缓存 */
let _conversationStore = null;
/** @type {ProfileManager|null} 用户画像管理器延迟加载缓存 */
let _profileManager = null;

/**
 * @description 延迟加载 Wiki 管理器模块
 * @returns {WikiManager} Wiki 管理器实例
 */
function getWikiManager() {
    if (!_wikiManager) _wikiManager = require('./wiki_manager');
    return _wikiManager;
}

/**
 * @description 延迟加载对话存储模块
 * @returns {ConversationStore} 对话存储实例
 */
function getConversationStore() {
    if (!_conversationStore) _conversationStore = require('./conversation_store');
    return _conversationStore;
}

/**
 * @description 延迟加载用户画像管理器模块
 * @returns {ProfileManager} 用户画像管理器实例
 */
function getProfileManager() {
    if (!_profileManager) _profileManager = require('./profile_manager');
    return _profileManager;
}

// ============================================================
// 实例管理：获取、创建、清理 SmartMemory 实例
// ============================================================

/**
 * @description 获取指定用户的 SmartMemory 实例，若不存在则自动创建。
 *              未启用认证时统一返回 legacy 实例
 * @param {string} [userId='legacy'] - 用户 ID，需为合法 UUID 或 'legacy'
 * @returns {SmartMemory} 对应用户的智能记忆实例
 * @throws {Error} 当 userId 格式不合法时抛出异常
 */
function getSmartMemory(userId = 'legacy') {
    // 未启用认证时，所有请求共享 legacy 实例
    if (process.env.ENABLE_AUTH !== 'true') {
        return instances.get('legacy') || createLegacyInstance();
    }

    // 校验用户 ID 必须为合法 UUID 格式，防止路径注入
    if (userId !== 'legacy' && !UUID_REGEX.test(userId)) {
        throw new Error('Invalid User ID format');
    }

    if (!instances.has(userId)) {
        instances.set(userId, new SmartMemory(userId));
    }
    return instances.get(userId);
}

/**
 * @description 创建 legacy 实例（未启用认证时的默认实例）
 * @returns {SmartMemory} legacy 智能记忆实例
 */
function createLegacyInstance() {
    if (!instances.has('legacy')) {
        instances.set('legacy', new SmartMemory('legacy'));
    }
    return instances.get('legacy');
}

/**
 * @description 清理指定用户的 SmartMemory 缓存实例，释放内存
 * @param {string} userId - 要清理缓存的用户 ID
 * @returns {void}
 */
function clearSmartMemoryCache(userId) {
    if (instances.has(userId)) {
        instances.delete(userId);
        console.log(`[智能记忆] 已清理用户缓存: ${userId}`);
    }
}

// ============================================================
// 核心类：SmartMemory
// 功能说明：封装单个用户的记忆管理，包括 Wiki、对话和画像
// ============================================================

class SmartMemory {

    /**
     * @description 构造函数，初始化用户数据目录和子模块
     * @param {string} [userId='legacy'] - 用户 ID
     */
    constructor(userId = 'legacy') {
        this.userId = userId;
        this.dataDir = this._getDataDir(userId);
        this.wikiPath = path.join(this.dataDir, 'wiki.md');
        this.conversationsDir = path.join(this.dataDir, 'conversations');
        this.profilePath = path.join(this.dataDir, 'user_profile.json');

        this.wikiManager = getWikiManager();
        this.conversationStore = getConversationStore();
        this.profileManager = getProfileManager();

        this.init();
    }

    /**
     * @description 根据用户 ID 获取数据存储目录路径
     * @param {string} userId - 用户 ID
     * @returns {string} 数据目录的绝对路径
     */
    _getDataDir(userId) {
        // legacy 用户使用兼容的旧路径，其他用户按 ID 隔离存储
        if (userId === 'legacy') {
            return path.join(__dirname, '..', 'data');
        }
        return path.join(__dirname, '..', 'data', 'users', userId);
    }

    /**
     * @description 初始化用户数据目录和 Wiki 文件，确保存储结构完整
     * @returns {void}
     */
    init() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        if (!fs.existsSync(this.conversationsDir)) {
            fs.mkdirSync(this.conversationsDir, { recursive: true });
        }

        if (!fs.existsSync(this.wikiPath)) {
            this.wikiManager.initWiki(this.wikiPath);
        }
    }

    /**
     * @description 保存对话记忆到文件系统
     * @param {Object} conversation - 对话数据对象，需包含 id、messages 等字段
     * @returns {Promise<{success: boolean, filepath?: string, message?: string}>} 保存结果
     */
    async saveConversation(conversation) {
        return this.conversationStore.save(conversation, this.conversationsDir);
    }

    /**
     * @description 读取指定 ID 的对话历史
     * @param {string} conversationId - 对话 ID
     * @returns {Promise<{success: boolean, data?: Object, message?: string}>} 对话数据
     */
    async getConversation(conversationId) {
        return this.conversationStore.get(conversationId, this.conversationsDir);
    }

    /**
     * @description 全量更新用户 Wiki 内容
     * @param {string} userId - 用户 ID（保留参数，当前未使用）
     * @param {string} content - 新的 Wiki 内容
     * @returns {Promise<{success: boolean, message?: string}>} 更新结果
     */
    async updateWiki(userId, content) {
        return this.wikiManager.update(this.wikiPath, content);
    }

    /**
     * @description 获取用户 Wiki 内容
     * @returns {Promise<{success: boolean, content?: string, message?: string}>} Wiki 内容
     */
    async getWiki() {
        return this.wikiManager.get(this.wikiPath);
    }

    /**
     * @description 更新用户画像数据
     * @param {Object} profile - 用户画像更新数据
     * @returns {Promise<{success: boolean, profile?: Object, message?: string}>} 更新后的用户画像
     */
    async updateProfile(profile) {
        return this.profileManager.update(this.profilePath, profile);
    }

    /**
     * @description 获取用户画像数据
     * @returns {Promise<{success: boolean, profile?: Object, message?: string}>} 用户画像
     */
    async getProfile() {
        return this.profileManager.get(this.profilePath);
    }

    /**
     * @description 异步追加对话记录到 Wiki，用于记录用户与助手的交互摘要
     * @param {string} userMessage - 用户消息内容
     * @param {string} assistantMessage - 助手回复内容
     * @returns {Promise<{success: boolean}|null>} 追加结果，异常时返回 null
     */
    async updateWikiAsync(userMessage, assistantMessage) {
        try {
            const content = `## ${new Date().toLocaleString()}\n用户: ${userMessage}\n小梦: ${assistantMessage}\n`;
            return await this.wikiManager.append(this.wikiPath, content);
        } catch (e) {
            return null;
        }
    }

    /**
     * @description 记录对话到存储（异步非阻塞），不等待写入完成
     * @param {string} userMessage - 用户消息内容
     * @param {string} assistantMessage - 助手回复内容
     * @returns {void}
     */
    recordConversation(userMessage, assistantMessage) {
        try {
            const conversation = {
                id: Date.now().toString(),
                user: userMessage,
                assistant: assistantMessage,
                timestamp: Date.now()
            };
            // 异步保存，不阻塞主流程，失败时静默处理
            this.conversationStore.save(conversation, this.conversationsDir).catch(() => {});
        } catch (e) {}
    }

    /**
     * @description 生成回忆文本（当前为占位实现，返回空字符串）
     * @returns {string} 回忆文本内容
     */
    generateRecallText() {
        return '';
    }

    /**
     * @description 获取 Wiki 文件的纯文本内容（用于记忆召回）
     * @returns {string} Wiki 文件内容，若失败返回空字符串
     */
    getWikiContent() {
        try {
            if (fs.existsSync(this.wikiPath)) {
                return fs.readFileSync(this.wikiPath, 'utf8');
            }
            // 尝试兼容旧路径
            const legacyPath = path.join(this.dataDir, 'user_wiki.md');
            if (fs.existsSync(legacyPath)) {
                return fs.readFileSync(legacyPath, 'utf8');
            }
        } catch (e) {
            logger.error('[SmartMemory] 读取 Wiki 失败:', e);
        }
        return '';
    }

    /**
     * @description 获取 Wiki 文件路径
     * @returns {string} Wiki 文件的绝对路径
     */
    getWikiPath() {
        return this.wikiPath;
    }

    /**
     * @description 获取用户画像摘要
     * @returns {string} 画像摘要文本
     */
    getProfileSummary() {
        try {
            if (fs.existsSync(this.profilePath)) {
                const profile = JSON.parse(fs.readFileSync(this.profilePath, 'utf8'));
                const lines = [];
                if (profile.nickname || profile.name) {
                    lines.push(`称呼: ${profile.nickname || profile.name}`);
                }
                if (profile.occupation) {
                    lines.push(`职业: ${profile.occupation}`);
                }
                if (profile.location) {
                    lines.push(`所在地: ${profile.location}`);
                }
                if (profile.interests?.length > 0) {
                    lines.push(`兴趣: ${profile.interests.join('、')}`);
                }
                return lines.length > 0 ? lines.join('\n') : '';
            }
        } catch (e) {
            logger.error('[SmartMemory] 获取画像摘要失败:', e);
        }
        return '';
    }

    /**
     * @description 判断是否为首次用户（从未有过对话记录）
     * @returns {boolean} true=首次用户，false=非首次
     */
    isFirstTimeUser() {
        try {
            if (fs.existsSync(this.profilePath)) {
                const profile = JSON.parse(fs.readFileSync(this.profilePath, 'utf8'));
                // 通过 interactionCount 判断
                return !profile.interactionCount || profile.interactionCount === 0;
            }
        } catch (e) {}
        return true;
    }

    /**
     * @description 获取用户名称（优先用昵称，其次用姓名）
     * @returns {string} 用户名称，若无则返回空字符串
     */
    getUserName() {
        try {
            if (fs.existsSync(this.profilePath)) {
                const profile = JSON.parse(fs.readFileSync(this.profilePath, 'utf8'));
                return profile.nickname || profile.name || '';
            }
            // 尝试从 Wiki 提取称呼
            const wikiContent = this.getWikiContent();
            const nameMatch = wikiContent.match(/称呼[：:]\s*([^\n-]+)/);
            if (nameMatch) {
                return nameMatch[1].trim();
            }
        } catch (e) {}
        return '';
    }

    /**
     * @description 重置 Wiki 内容为初始状态
     * @returns {Promise<{success: boolean}>} 重置结果
     */
    async resetWiki() {
        try {
            const initialContent = `# 用户信息

## 基本信息
- 称呼: 未设置
- 创建时间: ${new Date().toISOString()}

## 偏好设置
- 语气风格: 温和
- 交互频率: 正常

`;
            await this.wikiManager.update(this.wikiPath, initialContent);
            return { success: true };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    /**
     * @description 导出所有记忆数据
     * @returns {Object} 包含 wiki、profile、conversations 的导出数据
     */
    exportAll() {
        try {
            return {
                wiki: this.getWikiContent(),
                profile: fs.existsSync(this.profilePath)
                    ? JSON.parse(fs.readFileSync(this.profilePath, 'utf8'))
                    : {},
                conversations: this._getConversationsList()
            };
        } catch (e) {
            logger.error('[SmartMemory] 导出失败:', e);
            return { wiki: '', profile: {}, conversations: [] };
        }
    }

    /**
     * @description 获取对话文件列表
     * @returns {Array} 对话列表（简化信息）
     * @private
     */
    _getConversationsList() {
        try {
            if (!fs.existsSync(this.conversationsDir)) return [];
            const files = fs.readdirSync(this.conversationsDir);
            return files
                .filter(f => f.endsWith('.json'))
                .map(f => {
                    const data = JSON.parse(fs.readFileSync(
                        path.join(this.conversationsDir, f), 'utf8'
                    ));
                    return {
                        id: data.id || f.replace('.json', ''),
                        timestamp: data.timestamp || 0,
                        user: data.user?.substring(0, 50) || '',
                        assistant: data.assistant?.substring(0, 50) || ''
                    };
                })
                .sort((a, b) => b.timestamp - a.timestamp);
        } catch (e) {
            return [];
        }
    }

    /**
     * @description 获取最近 N 天的对话记录
     * @param {number} [days=7] - 要获取的天数
     * @returns {Array} 符合条件的对话列表
     */
    getRecentConversations(days = 7) {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return this._getConversationsList()
            .filter(c => c.timestamp > cutoff);
    }
}

/** legacy 模式的默认实例，供未启用认证时直接使用 */
const legacySmartMemory = getSmartMemory('legacy');

module.exports = {
    getSmartMemory,
    clearSmartMemoryCache,
    SmartMemory,
    legacySmartMemory
};