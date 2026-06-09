/**
 * @file memory_routes.js
 * @description 智能记忆路由模块，提供记忆统计、偏好查询、话题历史、情绪记录、
 *              关系状态、对话管理、Wiki 编辑、用户画像、记忆召回及数据导出等 API 接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const { legacySmartMemory: smartMemory, getSmartMemory } = require('../services/smart_memory');

/** 关键事实最近天数过滤范围：7 天 */
const KEY_FACTS_RECENT_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** 关键事实最大返回条数 */
const KEY_FACTS_MAX_COUNT = 10;

/**
 * @description 创建记忆路由器，支持注入自定义记忆服务实例
 * @param {Object} memoryService - 记忆服务实例
 * @returns {express.Router} Express 路由器
 */
function createMemoryRouter(memoryService) {
    const router = express.Router();

    // ============================================================
    // 模块名称：记忆统计与偏好
    // 功能说明：统计信息、偏好查询、话题、历史、情绪
    // ============================================================

    /**
     * @description 获取记忆统计信息，包含学习模式分析
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含统计信息和 learningPattern
     */
    router.get('/api/memory/stats', (req, res) => {
        const stats = memoryService.getStats();
        const criticalThinking = require('../services/critical_thinking');
        const learningPattern = criticalThinking.getUserLearningPattern();
        res.json({
            ...stats,
            learningPattern
        });
    });

    /**
     * @description 获取用户偏好列表，支持按分类过滤
     * @param {Object} req - Express 请求对象
     * @param {string} [req.query.category='all'] - 偏好分类
     * @param {Object} res - Express 响应对象
     * @returns {Array} 偏好列表
     */
    router.get('/api/memory/preferences', (req, res) => {
        const category = req.query.category || 'all';
        const prefs = memoryService.getAllPreferences(category);
        res.json(prefs || []);
    });

    /**
     * @description 获取用户高频话题列表
     * @param {Object} req - Express 请求对象
     * @param {number} [req.query.limit=5] - 返回话题数量上限
     * @param {Object} res - Express 响应对象
     * @returns {Array} 话题列表
     */
    router.get('/api/memory/topics', (req, res) => {
        const limit = parseInt(req.query.limit, 10) || 5;
        const topics = memoryService.getFrequentTopics(limit);
        res.json(topics);
    });

    /**
     * @description 获取最近的互动历史记录
     * @param {Object} req - Express 请求对象
     * @param {number} [req.query.limit=10] - 返回条数上限
     * @param {Object} res - Express 响应对象
     * @returns {Array} 互动历史列表
     */
    router.get('/api/memory/history', (req, res) => {
        const limit = parseInt(req.query.limit, 10) || 10;
        const history = memoryService.getRecentInteractions(limit);
        res.json(history);
    });

    /**
     * @description 获取用户情绪历史记录
     * @param {Object} req - Express 请求对象
     * @param {string} [req.query.userId='default'] - 用户 ID
     * @param {number} [req.query.limit=20] - 返回条数上限
     * @param {Object} res - Express 响应对象
     * @returns {Array} 情绪历史列表
     */
    router.get('/api/memory/emotions', (req, res) => {
        const userId = req.query.userId || 'default';
        const limit = parseInt(req.query.limit, 10) || 20;
        const history = memoryService.getEmotionHistory(userId, limit);
        res.json(history);
    });

    // ============================================================
    // 模块名称：状态与关系
    // 功能说明：完整状态查询、关系阶段查询、对话清空
    // ============================================================

    /**
     * @description 获取记忆服务的完整状态和统计信息
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 state 和 stats
     */
    router.get('/api/state', (req, res) => {
        const state = memoryService.getFullState();
        const stats = memoryService.getStats();
        res.json({ state, stats });
    });

    /**
     * @description 获取关系状态信息，包含关系阶段标签
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含关系数据和阶段标签
     */
    router.get('/api/relationship', (req, res) => {
        const rel = memoryService.getFullState().relationship;
        const stageLabel = memoryService.getRelationshipStageLabel(rel.relationshipStage);
        res.json({ ...rel, stageLabel });
    });

    /**
     * @description 清空对话历史记录
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 success: true
     */
    router.post('/api/conversation/clear', (req, res) => {
        memoryService.clearConversationHistory();
        res.json({ success: true });
    });

    /**
     * @description 导出所有记忆数据（旧版兼容接口）
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含导出的全部记忆数据
     */
    router.get('/api/memory/export', (req, res) => {
        const data = memoryService.exportMemories();
        res.json(data);
    });

    /**
     * @description 清除所有记忆数据
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 success 布尔值
     */
    router.post('/api/memory/clear', (req, res) => {
        const success = memoryService.clearAllMemories();
        res.json({ success });
    });

    /**
     * @description 删除指定分类和键名的偏好
     * @param {Object} req - Express 请求对象
     * @param {string} req.params.category - 偏好分类
     * @param {string} req.params.key - 偏好键名
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 success 布尔值
     */
    router.delete('/api/memory/preferences/:category/:key', (req, res) => {
        const { category, key } = req.params;
        const coreMemories = memoryService.getCoreMemories();
        const index = coreMemories.findIndex(
            p => p.type === category && p.key === key
        );

        if (index >= 0) {
            coreMemories.splice(index, 1);
            memoryService.saveData();
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'Preference not found' });
        }
    });

    // ============================================================
    // 模块名称：XMON 智能记忆
    // 功能说明：Wiki 内容管理、用户画像、记忆召回、对话记录
    // ============================================================

    /**
     * @description 获取 Wiki 内容
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 success 和 content
     */
    router.get('/api/memory/wiki', (req, res) => {
        try {
            const content = smartMemory.getWikiContent();
            res.json({
                success: true,
                content
            });
        } catch (error) {
            console.error('[智能记忆] 获取 Wiki 失败:', error.message);
            res.status(500).json({ error: '获取 Wiki 失败' });
        }
    });

    /**
     * @description 更新 Wiki 内容（手动编辑），将新内容写入 Wiki 文件
     * @param {Object} req - Express 请求对象
     * @param {string} req.body.content - 新的 Wiki 内容
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 success 和确认消息
     */
    router.post('/api/memory/wiki', (req, res) => {
        try {
            const { content } = req.body;
            if (content) {
                const fs = require('fs');
                const wikiPath = smartMemory.getWikiPath();
                fs.writeFileSync(wikiPath, content, 'utf8');
                res.json({
                    success: true,
                    message: 'Wiki 已更新'
                });
            } else {
                res.status(400).json({ error: '需要 content 参数' });
            }
        } catch (error) {
            console.error('[智能记忆] 更新 Wiki 失败:', error.message);
            res.status(500).json({ error: '更新 Wiki 失败' });
        }
    });

    /**
     * @description 获取用户画像摘要，包含是否首次用户和用户名
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 summary、isFirstTime、userName
     */
    router.get('/api/memory/profile', (req, res) => {
        try {
            const summary = smartMemory.getProfileSummary();
            res.json({
                success: true,
                summary,
                isFirstTime: smartMemory.isFirstTimeUser(),
                userName: smartMemory.getUserName()
            });
        } catch (error) {
            console.error('[智能记忆] 获取画像失败:', error.message);
            res.status(500).json({ error: '获取画像失败' });
        }
    });

    /**
     * @description 记忆召回接口，汇总用户身份、偏好、近期事件、核心记忆和最近对话，
     *              让用户"感受到被记住"
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 recallItems、summary、count
     */
    router.get('/api/memory/recall', (req, res) => {
        try {
            const recallItems = [];
            const fs = require('fs');
            const path = require('path');
            const wiki = smartMemory.getWikiContent();

            // ============================================================
            // 1. 从 SmartMemory profile 读取（新版）
            // ============================================================
            const userName = smartMemory.getUserName();

            // ============================================================
            // 2. 从 userProfileLearner 保存的 profile.json 读取
            //    路径: src/services/data/user_profile.json
            //    格式: { name, nickname, occupation, location, interests, preferences }
            // ============================================================
            const learnerProfilePath = path.join(__dirname, '..', 'services', 'data', 'user_profile.json');
            let learnerProfile = {};
            if (fs.existsSync(learnerProfilePath)) {
                try {
                    learnerProfile = JSON.parse(fs.readFileSync(learnerProfilePath, 'utf8'));
                } catch (e) {}
            }

            // 优先显示真实姓名，其次才是昵称
            const displayName = learnerProfile?.name || learnerProfile?.nickname || userName;

            // 用户基本信息 - 同时显示姓名和昵称（如果有）
            if (learnerProfile?.name || displayName) {
                const identityContent = [];
                if (learnerProfile?.name) identityContent.push(`名字：${learnerProfile.name}`);
                if (learnerProfile?.nickname && learnerProfile.nickname !== learnerProfile?.name) {
                    identityContent.push(`称呼：${learnerProfile.nickname}`);
                }
                recallItems.push({
                    type: 'identity',
                    title: '你的身份',
                    content: identityContent.join(' · '),
                    icon: '👤'
                });
            }

            // 从 learnerProfile 读取职业
            const occupation = learnerProfile?.occupation || '';
            if (occupation) {
                recallItems.push({
                    type: 'identity',
                    title: '职业',
                    content: occupation,
                    icon: '💼'
                });
            }

            // 从 learnerProfile 读取位置
            const location = learnerProfile?.location || '';
            if (location) {
                recallItems.push({
                    type: 'identity',
                    title: '所在地',
                    content: location,
                    icon: '📍'
                });
            }

            // 从 learnerProfile 读取兴趣话题
            const interests = learnerProfile?.interests || [];
            if (interests.length > 0) {
                recallItems.push({
                    type: 'preference',
                    title: '感兴趣的话题',
                    content: interests.slice(0, 5).join('、'),
                    icon: '💡'
                });
            }

            // 从 learnerProfile 读取偏好食物
            const foodPrefs = learnerProfile?.preferences?.food || [];
            if (foodPrefs.length > 0) {
                recallItems.push({
                    type: 'preference',
                    title: '喜欢的食物',
                    content: foodPrefs.filter(f => f && !f.includes('？')).slice(0, 3).join('、'),
                    icon: '🍰'
                });
            }

            // 从 learnerProfile 读取性格特点
            const personality = learnerProfile?.personality || [];
            if (personality.length > 0) {
                recallItems.push({
                    type: 'personality',
                    title: '性格特点',
                    content: personality.slice(0, 5).join('、'),
                    icon: '🌟'
                });
            }

            // 从 learnerProfile 读取重要事情
            const importantEvents = learnerProfile?.importantEvents || [];
            if (importantEvents.length > 0) {
                // 处理带时间戳的对象格式
                const eventContents = importantEvents.map(e =>
                    typeof e === 'string' ? e : e.content
                ).filter(Boolean).slice(0, 3);
                if (eventContents.length > 0) {
                    recallItems.push({
                        type: 'important',
                        title: '重要事项',
                        content: eventContents.join('、'),
                        icon: '⚡'
                    });
                }
            }

            // 从 learnerProfile 读取纪念日
            const anniversaries = learnerProfile?.anniversaries || [];
            if (anniversaries.length > 0) {
                recallItems.push({
                    type: 'anniversary',
                    title: '值得纪念的日子',
                    content: anniversaries.slice(0, 3).join('、'),
                    icon: '🎂'
                });
            }

            // 从 learnerProfile 读取开心的事
            const happyMoments = learnerProfile?.happyMoments || [];
            if (happyMoments.length > 0) {
                const happyContents = happyMoments.map(e => {
                    const content = typeof e === 'string' ? e : e.content;
                    return content.replace(/^\[happy\]\s*/, '').replace(/^\[sad\]\s*/, '').replace(/^\[angry\]\s*/, '');
                }).filter(Boolean).slice(-3);
                if (happyContents.length > 0) {
                    recallItems.push({
                        type: 'happy',
                        title: '开心的事',
                        content: happyContents.join('、'),
                        icon: '😊'
                    });
                }
            }

            // 从 learnerProfile 读取难过的事
            const sadMoments = learnerProfile?.sadMoments || [];
            if (sadMoments.length > 0) {
                const sadContents = sadMoments.map(e => {
                    const content = typeof e === 'string' ? e : e.content;
                    return content.replace(/^\[happy\]\s*/, '').replace(/^\[sad\]\s*/, '').replace(/^\[angry\]\s*/, '');
                }).filter(Boolean).slice(-3);
                if (sadContents.length > 0) {
                    recallItems.push({
                        type: 'sad',
                        title: '难过的事',
                        content: sadContents.join('、'),
                        icon: '😢'
                    });
                }
            }

            // 从 learnerProfile 读取生气的事
            const angryMoments = learnerProfile?.angryMoments || [];
            if (angryMoments.length > 0) {
                const angryContents = angryMoments.map(e => {
                    const content = typeof e === 'string' ? e : e.content;
                    return content.replace(/^\[happy\]\s*/, '').replace(/^\[sad\]\s*/, '').replace(/^\[angry\]\s*/, '');
                }).filter(Boolean).slice(-3);
                if (angryContents.length > 0) {
                    recallItems.push({
                        type: 'angry',
                        title: '生气的事',
                        content: angryContents.join('、'),
                        icon: '😠'
                    });
                }
            }

            // 从 Wiki 提取职业（备用）
            if (!occupation) {
                const jobMatch = wiki?.match(/职业[：:]([^\n（]+)/);
                if (jobMatch && jobMatch[1] !== '（待了解）' && jobMatch[1].trim()) {
                    recallItems.push({
                        type: 'identity',
                        title: '职业',
                        content: jobMatch[1].trim(),
                        icon: '💼'
                    });
                }
            }

            // 从 Wiki 提取所在地（备用）
            if (!location) {
                const locationMatch = wiki?.match(/所在地[：:]([^\n（]+)/);
                if (locationMatch && locationMatch[1] !== '（待了解）' && locationMatch[1].trim()) {
                    recallItems.push({
                        type: 'identity',
                        title: '所在地',
                        content: locationMatch[1].trim(),
                        icon: '📍'
                    });
                }
            }

            // 从核心记忆提取
            const coreData = memoryService.getCoreMemories();
            if (coreData.userFacts && Array.isArray(coreData.userFacts)) {
                coreData.userFacts.forEach(m => {
                    if (m && (m.key || m.value)) {
                        recallItems.push({
                            type: 'fact',
                            title: m.key || '事实',
                            content: m.value || '',
                            icon: '📌'
                        });
                    }
                });
            }
            if (coreData.preferences && Array.isArray(coreData.preferences)) {
                coreData.preferences.forEach(p => {
                    if (p && (p.key || p.value)) {
                        recallItems.push({
                            type: 'preference',
                            title: p.key || '偏好',
                            content: p.value || '',
                            icon: '💡'
                        });
                    }
                });
            }

            // 从互动历史提取最近的对话摘要
            const recentInteractions = memoryService.getRecentInteractions(3);
            if (recentInteractions.length > 0) {
                const lastMsg = recentInteractions[0]?.userInput || '';
                if (lastMsg) {
                    recallItems.push({
                        type: 'conversation',
                        title: '最近的对话',
                        content: lastMsg.substring(0, 50),
                        icon: '💬'
                    });
                }
            }

            // 生成摘要 - 包含姓名和昵称
            let profileSummary = smartMemory.getProfileSummary();
            if (!profileSummary && (learnerProfile?.name || learnerProfile?.nickname)) {
                const parts = [];
                if (learnerProfile.name) parts.push(learnerProfile.name);
                if (learnerProfile.nickname && learnerProfile.nickname !== learnerProfile.name) {
                    parts.push(`（${learnerProfile.nickname}）`);
                }
                profileSummary = parts.length > 0 ? `小梦记得你：${parts.join(' · ')}` : '';
            }

            res.json({
                success: true,
                recallItems,
                summary: profileSummary,
                count: recallItems.length
            });
        } catch (error) {
            console.error('[记忆召回] 失败:', error.message);
            res.status(500).json({ error: '记忆召回失败' });
        }
    });

    /**
     * @description 获取最近对话记录
     * @param {Object} req - Express 请求对象
     * @param {number} [req.query.days=7] - 查询最近几天的对话
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 conversations 和 count
     */
    router.get('/api/memory/conversations', (req, res) => {
        try {
            const days = parseInt(req.query.days) || 7;
            const conversations = smartMemory.getRecentConversations(days);
            res.json({
                success: true,
                conversations,
                count: conversations.length
            });
        } catch (error) {
            console.error('[智能记忆] 获取对话失败:', error.message);
            res.status(500).json({ error: '获取对话失败' });
        }
    });

    /**
     * @description 导出所有记忆数据（XMON 智能记忆版本）
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含导出的全部记忆数据
     */
    router.get('/api/memory/export', (req, res) => {
        try {
            const data = smartMemory.exportAll();
            res.json({
                success: true,
                ...data
            });
        } catch (error) {
            console.error('[智能记忆] 导出失败:', error.message);
            res.status(500).json({ error: '导出失败' });
        }
    });

    /**
     * @description 重置 Wiki 内容为初始状态
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 success 和确认消息
     */
    router.post('/api/memory/reset', (req, res) => {
        try {
            smartMemory.resetWiki();
            res.json({
                success: true,
                message: 'Wiki 已重置'
            });
        } catch (error) {
            console.error('[智能记忆] 重置失败:', error.message);
            res.status(500).json({ error: '重置失败' });
        }
    });

    /**
     * @description 获取最近 7 天的关键事实列表
     * @param {Object} req - Express 请求对象
     * @param {Object} res - Express 响应对象
     * @returns {Object} JSON 响应，包含 facts 数组
     */
    router.get('/api/memory/key-facts', (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const factsPath = path.join(smartMemory.dataDir, 'key_facts.json');
            if (fs.existsSync(factsPath)) {
                const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
                const recentFacts = facts.filter(f => Date.now() - f.timestamp < KEY_FACTS_RECENT_DAYS_MS).slice(-KEY_FACTS_MAX_COUNT);
                res.json({ facts: recentFacts });
            } else {
                res.json({ facts: [] });
            }
        } catch (error) {
            res.json({ facts: [] });
        }
    });

    return router;
}

module.exports = createMemoryRouter;
