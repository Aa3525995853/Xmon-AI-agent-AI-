/**
 * @file 会话持久化存储
 * @description 管理用户会话状态、对话历史、用户偏好和习惯学习
 *              支持会话恢复、自动过期清理、偏好自动捕捉
 * @module core/session-store
 * @version 1.0.0
 * @date 2026-06-06
 */

const fs = require('fs');
const path = require('path');
const serviceBus = require('./service-bus');

// 运行时路径配置（统一管理 data/logs/uploads）
const { DATA_DIR, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 常量定义
// ============================================================

/** 会话目录 */
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
/** 用户偏好文件路径 */
const PREFERENCES_FILE = path.join(DATA_DIR, 'preferences.json');
/** 用户习惯文件路径 */
const HABITS_FILE = path.join(DATA_DIR, 'habits.json');

/** 会话默认 TTL：24小时（毫秒） */
const SESSION_TTL = 24 * 60 * 60 * 1000;
/** 最大会话数限制 */
const MAX_SESSIONS = 100;
/** 单个会话最大历史消息数 */
const MAX_HISTORY_PER_SESSION = 50;
/** 自动保存间隔：30秒（毫秒） */
const SAVE_INTERVAL = 30000;

// ============================================================
// SessionStore 类
// ============================================================

/**
 * 会话持久化存储类
 * 提供会话管理、对话历史、用户偏好和习惯学习功能
 * @class
 */
class SessionStore {
    constructor(options = {}) {
        this.ttl = options.ttl || SESSION_TTL;
        this.maxSessions = options.maxSessions || MAX_SESSIONS;
        this.maxHistory = options.maxHistory || MAX_HISTORY_PER_SESSION;
        this._sessions = new Map();
        this._preferences = {};
        this._habits = [];
        this._dirty = false;
        this._saveTimer = null;
        this._stats = { created: 0, restored: 0, expired: 0, saved: 0 };
    }

    async init() {
        this._ensureDirs();
        await this._loadPreferences();
        await this._loadHabits();
        await this._restoreSessions();
        this._startAutoSave();
        this._startCleanup();
        console.log(`[SessionStore] 初始化完成，恢复 ${this._sessions.size} 个会话`);
    }

    /**
     * 确保必要的目录存在
     * @private
     */
    _ensureDirs() {
        ensureDir(DATA_DIR);
        ensureDir(SESSIONS_DIR);
    }

    // ============ 会话管理 ============

    createSession(sessionId, metadata = {}) {
        const session = {
            id: sessionId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastActiveAt: Date.now(),
            history: [],
            activeTask: null,
            context: {},
            metadata,
            preferences: {}
        };

        this._sessions.set(sessionId, session);
        this._dirty = true;
        this._stats.created++;

        serviceBus.publish('session:created', { sessionId });
        return session;
    }

    getSession(sessionId) {
        const session = this._sessions.get(sessionId);
        if (!session) return null;

        if (Date.now() - session.lastActiveAt > this.ttl) {
            this._sessions.delete(sessionId);
            this._stats.expired++;
            return null;
        }

        session.lastActiveAt = Date.now();
        return session;
    }

    getOrCreateSession(sessionId, metadata = {}) {
        return this.getSession(sessionId) || this.createSession(sessionId, metadata);
    }

    // ============ 对话历史 ============

    addMessage(sessionId, role, content, extra = {}) {
        const session = this.getOrCreateSession(sessionId);
        const message = {
            role,
            content,
            timestamp: Date.now(),
            ...extra
        };

        session.history.push(message);
        session.updatedAt = Date.now();

        if (session.history.length > this.maxHistory) {
            const removed = session.history.length - this.maxHistory;
            session.history = session.history.slice(-this.maxHistory);
        }

        this._dirty = true;

        this._learnFromMessage(sessionId, message);

        return message;
    }

    getHistory(sessionId, limit = 20) {
        const session = this.getSession(sessionId);
        if (!session) return [];
        return session.history.slice(-limit);
    }

    getContext(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) return {};
        return session.context;
    }

    setContext(sessionId, key, value) {
        const session = this.getOrCreateSession(sessionId);
        session.context[key] = value;
        session.updatedAt = Date.now();
        this._dirty = true;
    }

    // ============ 任务进度 ============

    setActiveTask(sessionId, task) {
        const session = this.getOrCreateSession(sessionId);
        session.activeTask = {
            ...task,
            startedAt: Date.now()
        };
        session.updatedAt = Date.now();
        this._dirty = true;
    }

    getActiveTask(sessionId) {
        const session = this.getSession(sessionId);
        return session ? session.activeTask : null;
    }

    clearActiveTask(sessionId) {
        const session = this.getSession(sessionId);
        if (session) {
            session.activeTask = null;
            session.updatedAt = Date.now();
            this._dirty = true;
        }
    }

    // ============ 用户偏好 ============

    setPreference(key, value) {
        this._preferences[key] = {
            value,
            updatedAt: Date.now()
        };
        this._dirty = true;

        serviceBus.publish('preference:updated', { key, value });
    }

    getPreference(key, defaultValue = null) {
        const pref = this._preferences[key];
        return pref ? pref.value : defaultValue;
    }

    getAllPreferences() {
        const result = {};
        for (const [key, pref] of Object.entries(this._preferences)) {
            result[key] = pref.value;
        }
        return result;
    }

    // ============ 习惯学习 ============

    _learnFromMessage(sessionId, message) {
        if (message.role !== 'user') return;

        const content = (message.content || '').toLowerCase();

        const cityMatch = content.match(/([\u4e00-\u9fff]{2,4})(?:的)?(?:天气|气温)/);
        if (cityMatch) {
            this._recordHabit('city_preference', cityMatch[1], { sessionId });
        }

        if (/新闻|资讯/.test(content)) {
            const catMatch = content.match(/(科技|体育|娱乐|财经|国际)/);
            if (catMatch) {
                this._recordHabit('news_category', catMatch[1], { sessionId });
            }
        }

        if (/打开|启动/.test(content)) {
            const appMatch = content.match(/(?:打开|启动)\s*(.+)/);
            if (appMatch) {
                this._recordHabit('frequent_app', appMatch[1].trim(), { sessionId });
            }
        }

        if (/播放|听/.test(content)) {
            this._recordHabit('music_listener', true, { sessionId });
        }
    }

    _recordHabit(type, value, meta = {}) {
        const existing = this._habits.find(h => h.type === type && h.value === value);
        if (existing) {
            existing.count++;
            existing.lastSeen = Date.now();
            existing.sessions = existing.sessions || [];
            if (meta.sessionId && !existing.sessions.includes(meta.sessionId)) {
                existing.sessions.push(meta.sessionId);
            }
        } else {
            this._habits.push({
                type,
                value,
                count: 1,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                sessions: meta.sessionId ? [meta.sessionId] : []
            });
        }

        if (this._habits.length > 200) {
            this._habits.sort((a, b) => b.count - a.count);
            this._habits = this._habits.slice(0, 200);
        }

        this._dirty = true;
    }

    getHabits(type = null) {
        if (type) {
            return this._habits
                .filter(h => h.type === type)
                .sort((a, b) => b.count - a.count);
        }
        return this._habits.sort((a, b) => b.count - a.count);
    }

    getTopHabit(type) {
        const habits = this.getHabits(type);
        return habits.length > 0 ? habits[0].value : null;
    }

    // ============ 持久化 ============

    async save() {
        try {
            for (const [sessionId, session] of this._sessions) {
                const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
                fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
            }

            fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(this._preferences, null, 2), 'utf8');
            fs.writeFileSync(HABITS_FILE, JSON.stringify(this._habits, null, 2), 'utf8');

            this._dirty = false;
            this._stats.saved++;
        } catch (e) {
            console.error('[SessionStore] 保存失败:', e.message);
        }
    }

    async _restoreSessions() {
        try {
            if (!fs.existsSync(SESSIONS_DIR)) return;

            const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
                    if (Date.now() - data.lastActiveAt < this.ttl) {
                        this._sessions.set(data.id, data);
                        this._stats.restored++;
                    }
                } catch (_) {}
            }

            if (this._sessions.size > this.maxSessions) {
                const sorted = Array.from(this._sessions.entries())
                    .sort((a, b) => b[1].lastActiveAt - a[1].lastActiveAt);
                this._sessions = new Map(sorted.slice(0, this.maxSessions));
            }
        } catch (e) {
            console.warn('[SessionStore] 恢复会话失败:', e.message);
        }
    }

    async _loadPreferences() {
        try {
            if (fs.existsSync(PREFERENCES_FILE)) {
                this._preferences = JSON.parse(fs.readFileSync(PREFERENCES_FILE, 'utf8'));
            }
        } catch (e) {
            this._preferences = {};
        }
    }

    async _loadHabits() {
        try {
            if (fs.existsSync(HABITS_FILE)) {
                this._habits = JSON.parse(fs.readFileSync(HABITS_FILE, 'utf8'));
            }
        } catch (e) {
            this._habits = [];
        }
    }

    _startAutoSave() {
        this._saveTimer = setInterval(() => {
            if (this._dirty) {
                this.save();
            }
        }, SAVE_INTERVAL);
    }

    _startCleanup() {
        setInterval(() => {
            const now = Date.now();
            let cleaned = 0;
            for (const [id, session] of this._sessions) {
                if (now - session.lastActiveAt > this.ttl) {
                    this._sessions.delete(id);
                    cleaned++;
                    this._stats.expired++;
                }
            }
            if (cleaned > 0) {
                this._dirty = true;
            }
        }, 5 * 60 * 1000);
    }

    // ============ 查询 ============

    getStats() {
        return {
            ...this._stats,
            activeSessions: this._sessions.size,
            preferencesCount: Object.keys(this._preferences).length,
            habitsCount: this._habits.length,
            dirty: this._dirty
        };
    }

    destroy() {
        if (this._saveTimer) {
            clearInterval(this._saveTimer);
        }
        if (this._dirty) {
            this.save();
        }
    }
}

module.exports = new SessionStore();
