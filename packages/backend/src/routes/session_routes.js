/**
 * @file session_routes.js
 * @description 会话管理 API 路由，提供会话创建/切换/列表/删除、
 *              对话历史查询、上下文压缩与摘要生成等功能
 * @module routes/session_routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-08
 */

const express = require('express');
const router = express.Router();
const sessionStore = require('../core/session-store');
const contextCompressor = require('../core/context-compressor');

// ============================================================
// 模块名称：会话管理 API
// 功能说明：会话的创建、查询、切换、删除，支持会话隔离
// ============================================================

/**
 * @description 获取当前用户ID，启用认证时从 req.user 获取，否则返回 'legacy'
 * @param {Object} req - Express 请求对象
 * @returns {string} 用户ID
 */
function getUserId(req) {
    if (process.env.ENABLE_AUTH === 'true' && req.user) {
        return req.user.userId;
    }
    return 'legacy';
}

/**
 * @description 构建带用户前缀的会话ID，确保不同用户的会话隔离
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 原始会话ID
 * @returns {string} 带用户前缀的会话ID
 */
function buildSessionId(userId, sessionId) {
    return `${userId}::${sessionId}`;
}

/**
 * @description 创建新会话
 * @param {Object} req - Express 请求对象
 * @param {string} [req.body.sessionId] - 可选的会话ID，不提供则自动生成
 * @param {Object} [req.body.metadata] - 会话元数据（如标题等）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, session: Object }
 * @throws {500} 创建会话失败
 */
router.post('/create', (req, res) => {
    try {
        const userId = getUserId(req);
        const rawId = req.body.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const sessionId = buildSessionId(userId, rawId);
        const metadata = req.body.metadata || {};

        const session = sessionStore.createSession(sessionId, {
            ...metadata,
            userId,
            rawId
        });

        res.json({ success: true, session: _formatSession(session) });
    } catch (error) {
        console.error('[SessionRoutes] 创建会话失败:', error);
        res.status(500).json({ error: '创建会话失败', message: error.message });
    }
});

/**
 * @description 获取或创建会话（若不存在则自动创建）
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.sessionId - 会话ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, session: Object }
 * @throws {500} 获取会话失败
 */
router.get('/get-or-create', (req, res) => {
    try {
        const userId = getUserId(req);
        const rawId = req.query.sessionId;
        // 必须明确传入 sessionId
        if (!rawId) {
            return res.status(400).json({ error: '缺少 sessionId 参数' });
        }
        const sessionId = buildSessionId(userId, rawId);

        const session = sessionStore.getOrCreateSession(sessionId, { userId, rawId });
        res.json({ success: true, session: _formatSession(session) });
    } catch (error) {
        console.error('[SessionRoutes] 获取会话失败:', error);
        res.status(500).json({ error: '获取会话失败', message: error.message });
    }
});

/**
 * @description 列出当前用户的所有活跃会话
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, sessions: Array }
 * @throws {500} 列出会话失败
 */
router.get('/list', (req, res) => {
    try {
        const userId = getUserId(req);
        const prefix = `${userId}::`;

        // 从 SessionStore 内部 _sessions Map 中筛选当前用户的会话
        const sessions = [];
        for (const [id, session] of sessionStore._sessions) {
            if (id.startsWith(prefix)) {
                sessions.push(_formatSession(session));
            }
        }

        // 按最后活跃时间倒序排列，最近使用的排最前
        sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);

        res.json({ success: true, sessions });
    } catch (error) {
        console.error('[SessionRoutes] 列出会话失败:', error);
        res.status(500).json({ error: '列出会话失败', message: error.message });
    }
});

/**
 * @description 删除指定会话
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.sessionId - 要删除的会话原始ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean }
 * @throws {500} 删除会话失败
 */
router.delete('/:sessionId', (req, res) => {
    try {
        const userId = getUserId(req);
        const sessionId = buildSessionId(userId, req.params.sessionId);

        const deleted = sessionStore._sessions.delete(sessionId);
        if (deleted) {
            sessionStore._dirty = true;
        }

        res.json({ success: true, deleted: !!deleted });
    } catch (error) {
        console.error('[SessionRoutes] 删除会话失败:', error);
        res.status(500).json({ error: '删除会话失败', message: error.message });
    }
});

// ============================================================
// 模块名称：对话历史 API
// 功能说明：获取会话历史消息、添加消息、清空历史
// ============================================================

/**
 * @description 获取指定会话的对话历史
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.sessionId - 会话ID
 * @param {number} [req.query.limit=50] - 返回消息条数上限
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, history: Array }
 * @throws {500} 获取历史失败
 */
router.get('/history', (req, res) => {
    try {
        const userId = getUserId(req);
        const rawId = req.query.sessionId;
        // 不再自动使用 'default'，只有明确传入 sessionId 才查询
        if (!rawId) {
            return res.json({ success: true, history: [] });
        }
        const sessionId = buildSessionId(userId, rawId);
        const limit = parseInt(req.query.limit) || 50;

        const history = sessionStore.getHistory(sessionId, limit);
        res.json({ success: true, history });
    } catch (error) {
        console.error('[SessionRoutes] 获取历史失败:', error);
        res.status(500).json({ error: '获取历史失败', message: error.message });
    }
});

/**
 * @description 向指定会话添加一条消息
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.sessionId - 会话ID
 * @param {string} req.body.role - 消息角色（user/assistant/system）
 * @param {string} req.body.content - 消息内容
 * @param {Object} [req.body.extra] - 额外信息（如 emotion 等）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, message: Object }
 * @throws {500} 添加消息失败
 */
router.post('/message', (req, res) => {
    try {
        const userId = getUserId(req);
        const rawId = req.body.sessionId;
        // 不再自动使用 'default'，必须明确传入 sessionId
        if (!rawId) {
            return res.status(400).json({ error: '缺少 sessionId 参数' });
        }
        const sessionId = buildSessionId(userId, rawId);
        const { role, content, extra } = req.body;

        if (!role || !content) {
            return res.status(400).json({ error: '缺少 role 或 content 参数' });
        }

        const message = sessionStore.addMessage(sessionId, role, content, extra || {});
        res.json({ success: true, message });
    } catch (error) {
        console.error('[SessionRoutes] 添加消息失败:', error);
        res.status(500).json({ error: '添加消息失败', message: error.message });
    }
});

/**
 * @description 清空指定会话的对话历史
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.sessionId - 会话ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean }
 * @throws {500} 清空历史失败
 */
router.post('/clear-history', (req, res) => {
    try {
        const userId = getUserId(req);
        const rawId = req.body.sessionId;
        // 必须明确传入 sessionId
        if (!rawId) {
            return res.status(400).json({ error: '缺少 sessionId 参数' });
        }
        const sessionId = buildSessionId(userId, rawId);

        const session = sessionStore.getSession(sessionId);
        if (session) {
            session.history = [];
            session.updatedAt = Date.now();
            sessionStore._dirty = true;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[SessionRoutes] 清空历史失败:', error);
        res.status(500).json({ error: '清空历史失败', message: error.message });
    }
});

// ============================================================
// 模块名称：上下文压缩与摘要 API
// 功能说明：对会话历史进行智能压缩，生成对话摘要
// ============================================================

/**
 * @description 对指定会话的历史消息进行上下文压缩
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.sessionId - 会话ID
 * @param {string} [req.body.strategy='hybrid'] - 压缩策略：sliding_window / summary / hybrid
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, compressed: Array, originalCount: number, compressedCount: number }
 * @throws {500} 压缩失败
 */
router.post('/compress', (req, res) => {
    try {
        const userId = getUserId(req);
        const rawId = req.body.sessionId;
        // 必须明确传入 sessionId
        if (!rawId) {
            return res.status(400).json({ error: '缺少 sessionId 参数' });
        }
        const sessionId = buildSessionId(userId, rawId);
        const strategy = req.body.strategy || 'hybrid';

        const session = sessionStore.getSession(sessionId);
        if (!session || session.history.length === 0) {
            return res.json({ success: true, compressed: [], originalCount: 0, compressedCount: 0 });
        }

        // 将 session.history 格式转换为 contextCompressor 期望的格式
        const messages = session.history.map(msg => ({
            role: msg.role,
            content: msg.content || ''
        }));

        const compressed = contextCompressor.compress(messages, { strategy });

        res.json({
            success: true,
            compressed,
            originalCount: messages.length,
            compressedCount: compressed.length
        });
    } catch (error) {
        console.error('[SessionRoutes] 上下文压缩失败:', error);
        res.status(500).json({ error: '上下文压缩失败', message: error.message });
    }
});

/**
 * @description 生成指定会话的对话摘要
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.sessionId - 会话ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, summary: string, messageCount: number }
 * @throws {500} 生成摘要失败
 */
router.get('/summary', (req, res) => {
    try {
        const userId = getUserId(req);
        const rawId = req.query.sessionId;
        // 必须明确传入 sessionId
        if (!rawId) {
            return res.status(400).json({ error: '缺少 sessionId 参数' });
        }
        const sessionId = buildSessionId(userId, rawId);

        const session = sessionStore.getSession(sessionId);
        if (!session || session.history.length === 0) {
            return res.json({ success: true, summary: '', messageCount: 0 });
        }

        // 使用 contextCompressor 的摘要生成方法
        const messages = session.history.map(msg => ({
            role: msg.role,
            content: msg.content || ''
        }));

        const summary = contextCompressor._generateSummary(messages);

        res.json({
            success: true,
            summary,
            messageCount: messages.length
        });
    } catch (error) {
        console.error('[SessionRoutes] 生成摘要失败:', error);
        res.status(500).json({ error: '生成摘要失败', message: error.message });
    }
});

// ============================================================
// 模块名称：会话统计 API
// 功能说明：查询会话存储的统计信息
// ============================================================

/**
 * @description 获取会话存储的统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, stats: Object }
 */
router.get('/stats', (req, res) => {
    try {
        const stats = sessionStore.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('[SessionRoutes] 获取统计失败:', error);
        res.status(500).json({ error: '获取统计失败', message: error.message });
    }
});

// ============================================================
// 内部工具函数
// ============================================================

/**
 * @description 格式化会话对象，提取前端需要的字段
 * @param {Object} session - 原始会话对象
 * @returns {Object} 格式化后的会话信息
 * @private
 */
function _formatSession(session) {
    return {
        id: session.metadata?.rawId || session.id,
        fullId: session.id,
        title: session.metadata?.title || _generateTitle(session),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        lastActiveAt: session.lastActiveAt,
        messageCount: session.history?.length || 0,
        metadata: session.metadata || {}
    };
}

/**
 * @description 根据会话历史自动生成标题（取第一条用户消息的前20字）
 * @param {Object} session - 会话对象
 * @returns {string} 生成的标题
 * @private
 */
function _generateTitle(session) {
    if (!session.history || session.history.length === 0) {
        return '新对话';
    }
    // 找到第一条用户消息作为标题
    const firstUserMsg = session.history.find(m => m.role === 'user');
    if (firstUserMsg && firstUserMsg.content) {
        const title = firstUserMsg.content.trim().slice(0, 20);
        return title.length < firstUserMsg.content.trim().length ? title + '...' : title;
    }
    return '新对话';
}

module.exports = router;
