/**
 * @file 主动服务主入口
 * @description 让小梦从"被动应答"变成"主动关怀"
 *              支持定时问候、里程碑庆祝、情绪关心、互动激励
 * @module services/proactive_service
 * @version 1.0.0
 * @date 2026-06-06
 */

const { logger } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../../config/runtimePaths');

// ============================================================
// 常量定义
// ============================================================

/** UUID 正则表达式 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 实例缓存 */
const instances = new Map();

// 延迟加载子模块
let _messageGenerator = null;
let _scheduler = null;

/**
 * 获取消息生成器实例（延迟加载）
 * @returns {Object} 消息生成器
 */
function getMessageGenerator() {
    if (!_messageGenerator) _messageGenerator = require('./message_generator');
    return _messageGenerator;
}

/**
 * 获取调度器实例（延迟加载）
 * @returns {Object} 调度器
 */
function getScheduler() {
    if (!_scheduler) _scheduler = require('./scheduler');
    return _scheduler;
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 获取主动服务实例（多用户支持）
 * @param {string} userId - 用户ID，默认 'legacy'
 * @returns {ProactiveService} 主动服务实例
 */
function getProactiveService(userId = 'legacy') {
    if (process.env.ENABLE_AUTH !== 'true') {
        return instances.get('legacy') || createLegacyInstance();
    }

    if (userId !== 'legacy' && !UUID_REGEX.test(userId)) {
        throw new Error('Invalid User ID format');
    }

    if (!instances.has(userId)) {
        instances.set(userId, new ProactiveService(userId));
    }
    return instances.get(userId);
}

/**
 * 创建遗留用户实例
 * @returns {ProactiveService} 主动服务实例
 */
function createLegacyInstance() {
    if (!instances.has('legacy')) {
        instances.set('legacy', new ProactiveService('legacy'));
    }
    return instances.get('legacy');
}

/**
 * 清理指定用户的主动服务缓存
 * @param {string} userId - 用户ID
 */
function clearProactiveCache(userId) {
    if (instances.has(userId)) {
        instances.delete(userId);
        console.log(`[主动服务] 已清理用户缓存: ${userId}`);
    }
}

// ============================================================
// ProactiveService 类
// ============================================================

/**
 * 主动服务类
 * 负责定时问候、里程碑庆祝、情绪关心、互动激励
 * @class
 */
class ProactiveService {
    /**
     * 构造函数
     * @param {string} userId - 用户ID
     */
    constructor(userId = 'legacy') {
        this.userId = userId;
        this.dataPath = this._getDataPath(userId);
        this.enabled = true;
        this.messageQueue = [];

        this.messageGenerator = getMessageGenerator();
        this.scheduler = getScheduler();

        this.data = this.loadData();

        if (userId === 'legacy') {
            this.startScheduler();
        }

        logger.info(`[主动服务] 初始化完成 (userId: ${userId})`);
    }

    /**
     * 获取数据文件路径
     * @param {string} userId - 用户ID
     * @returns {string} 数据文件路径
     */
    _getDataPath(userId) {
        if (userId === 'legacy') {
            return dataPath('proactive.json');
        }
        return dataPath('users', userId, 'proactive.json');
    }

    loadData() {
        try {
            const dataDir = path.dirname(this.dataPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            if (fs.existsSync(this.dataPath)) {
                const content = fs.readFileSync(this.dataPath, 'utf8');
                return JSON.parse(content);
            }
        } catch (e) {}

        return this._getDefaultData();
    }

    _getDefaultData() {
        return {
            lastGreeting: null,
            lastReminder: null,
            greetingHistory: [],
            messageCount: 0
        };
    }

    saveData() {
        try {
            const dataDir = path.dirname(this.dataPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            const tmpPath = this.dataPath + '.tmp';
            fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
            fs.renameSync(tmpPath, this.dataPath);
        } catch (e) {
            console.error(`[主动服务] 保存数据失败:`, e.message);
        }
    }

    /**
     * 启动调度器
     */
    startScheduler() {
        this.scheduler.start(this);
    }

    /**
     * 检查是否有待发送的消息
     */
    async checkPendingMessages() {
        return this.scheduler.checkPending(this);
    }

    /**
     * 获取待发送消息
     */
    getMessages() {
        return this.messageQueue;
    }

    /**
     * 生成主动消息
     */
    async generateMessage(type, context = {}) {
        return this.messageGenerator.generate(type, context);
    }

    /**
     * 启用/禁用
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        this.saveData();
    }

    /**
     * 获取状态
     */
    getStatus() {
        return {
            enabled: this.enabled,
            userId: this.userId,
            messageCount: this.data.messageCount || 0,
            lastGreeting: this.data.lastGreeting
        };
    }

    detectEmotion(text) {
        const emotionKeywords = {
            sad: ['难过', '伤心', '悲伤', '不开心', '郁闷', '沮丧', '哭', '心痛', '失落', '委屈'],
            angry: ['生气', '愤怒', '烦', '讨厌', '气死', '火大', '暴怒'],
            anxious: ['焦虑', '紧张', '担心', '害怕', '不安', '恐惧'],
            happy: ['开心', '高兴', '快乐', '幸福', '兴奋', '棒', '太好了', '哈哈']
        };
        for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
            for (const kw of keywords) {
                if (text.includes(kw)) return emotion;
            }
        }
        return null;
    }

    triggerEmotionCare(emotion) {
        const careMessages = {
            sad: '怎么了？看起来心情不太好呢，要不要跟我说说？',
            angry: '别生气啦，深呼吸～有什么烦心事跟我说说？',
            anxious: '别太紧张了，慢慢来，我陪着你呢～',
            happy: '看到你开心我也好开心呀！'
        };
        return careMessages[emotion] || null;
    }

    setConversationMode(mode) {
        this._conversationMode = mode;
    }

    recordInteraction() {
        this.data.messageCount = (this.data.messageCount || 0) + 1;
        this.data.lastInteraction = Date.now();
        this.saveData();
    }
}

module.exports = {
    getProactiveService,
    clearProactiveCache
};