/**
 * @file learning_routes.js
 * @description 学习与预测路由模块，提供技能学习统计、上下文技能推荐、行为预测、
 *              知识图谱查询、LLM 提取器统计及全局概览等 API 接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();

const skillLearner = require('../services/skill_learner');
const behaviorPredictor = require('../services/behavior_predictor');
const knowledgeGraph = require('../services/knowledge_graph');
const llmExtractor = require('../services/llm_extractor');

// ============================================================
// 模块名称：技能学习
// 功能说明：技能统计、列表、上下文推荐、行为预测
// ============================================================

/**
 * @description 获取技能学习器的统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data 统计对象
 */
router.get('/skills', (req, res) => {
    try {
        res.json({ success: true, data: skillLearner.getStats() });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * @description 获取已学习的技能列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data 技能数组
 */
router.get('/skills/list', (req, res) => {
    try {
        const stats = skillLearner.getStats();
        res.json({ success: true, data: stats.skills });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * @description 根据当前意图和时间段获取推荐的活跃技能
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.intent='chat'] - 当前意图
 * @param {number} [req.query.hour] - 当前小时（0-23），默认取系统当前时间
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data 推荐技能
 */
router.get('/skills/active', (req, res) => {
    try {
        const intent = req.query.intent || 'chat';
        const hour = parseInt(req.query.hour) || new Date().getHours();
        const activeSkills = skillLearner.getSkillForContext(intent, hour);
        res.json({ success: true, data: activeSkills });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * @description 预测用户下一个可能的行为
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.intent='chat'] - 当前意图
 * @param {number} [req.query.hour] - 当前小时
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data 预测结果
 */
router.get('/skills/predict', (req, res) => {
    try {
        const intent = req.query.intent || 'chat';
        const hour = parseInt(req.query.hour) || new Date().getHours();
        const predictions = skillLearner.predictNextAction(intent, hour);
        res.json({ success: true, data: predictions });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// 模块名称：行为预测
// 功能说明：行为预测统计、基于当前行为预测下一步
// ============================================================

/**
 * @description 获取行为预测器的统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data 统计对象
 */
router.get('/behavior', (req, res) => {
    try {
        res.json({ success: true, data: behaviorPredictor.getStats() });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * @description 基于当前行为预测用户下一步可能的行为
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.type='chat'] - 行为类型
 * @param {string} [req.query.intent='chat'] - 当前意图
 * @param {string} [req.query.tools] - 使用的工具列表（逗号分隔）
 * @param {string} [req.query.emotion='neutral'] - 当前情绪
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data 预测结果
 */
router.get('/behavior/predict', (req, res) => {
    try {
        const currentAction = {
            type: req.query.type || 'chat',
            intent: req.query.intent || 'chat',
            tools: req.query.tools ? req.query.tools.split(',') : [],
            emotion: req.query.emotion || 'neutral'
        };
        const predictions = behaviorPredictor.predict(currentAction);
        res.json({ success: true, data: predictions });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// 模块名称：知识图谱
// 功能说明：知识图谱统计、搜索、实体查询
// ============================================================

/**
 * @description 获取知识图谱的统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data 统计对象
 */
router.get('/knowledge', (req, res) => {
    try {
        res.json({ success: true, data: knowledgeGraph.getStats() });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * @description 在知识图谱中搜索实体
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.q=''] - 搜索关键词
 * @param {number} [req.query.limit=10] - 返回结果上限
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data 搜索结果
 */
router.get('/knowledge/search', (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 10;
        const results = knowledgeGraph.search(query, limit);
        res.json({ success: true, data: results });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * @description 获取指定实体的详细信息和关联实体
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.name - 实体名称
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data（entity、related）
 */
router.get('/knowledge/entity/:name', (req, res) => {
    try {
        const entity = knowledgeGraph.getEntity(req.params.name);
        const related = knowledgeGraph.getRelated(req.params.name, 1);
        res.json({ success: true, data: { entity, related } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// 模块名称：LLM 提取器与全局概览
// 功能说明：LLM 提取器统计、各服务全局概览
// ============================================================

/**
 * @description 获取 LLM 提取器的统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data 统计对象
 */
router.get('/extractor', (req, res) => {
    try {
        res.json({ success: true, data: llmExtractor.getStats() });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * @description 获取所有学习服务的全局概览，包含技能、行为、知识图谱和提取器的统计
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 data（skills、behavior、knowledge、extractor）
 */
router.get('/overview', (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                skills: skillLearner.getStats(),
                behavior: behaviorPredictor.getStats(),
                knowledge: knowledgeGraph.getStats(),
                extractor: llmExtractor.getStats()
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
