/**
 * @file evolution_routes.js
 * @description 性格演化 API 路由，提供性格状态查询、风格切换、性格参数获取、
 *              反馈记录、互动记录及演化数据重置等功能
 * @module routes/evolution_routes
 * @author 小梦团队
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const characterEvolution = require('../services/character_evolution');

// ============================================================
// 模块名称：性格状态与风格管理 API
// 功能说明：查询性格状态、风格列表、风格切换及性格参数获取
// ============================================================

/**
 * @description 获取性格演化的完整状态，包括当前风格、参数和演化进度
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...status }
 * @throws {500} 获取状态失败
 */
router.get('/status', (req, res) => {
    try {
        const status = characterEvolution.getFullStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        console.error('[性格演化] 获取状态失败:', error.message);
        res.status(500).json({ error: '获取状态失败' });
    }
});

/**
 * @description 获取所有可用的性格风格列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, styles: Array }
 * @throws {500} 获取风格失败
 */
router.get('/styles', (req, res) => {
    try {
        const styles = characterEvolution.getAllStyles();
        res.json({
            success: true,
            styles
        });
    } catch (error) {
        console.error('[性格演化] 获取风格失败:', error.message);
        res.status(500).json({ error: '获取风格失败' });
    }
});

/**
 * @description 切换到指定的性格风格
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.style - 目标风格名称（必填）
 * @param {Object} res - Express 响应对象
 * @returns {Object} 切换结果
 * @throws {400} 缺少 style 参数
 * @throws {500} 切换风格失败
 */
router.post('/switch', (req, res) => {
    try {
        const { style } = req.body;
        if (!style) {
            res.status(400).json({ error: '需要 style 参数' });
            return;
        }

        const result = characterEvolution.switchStyle(style);
        res.json(result);
    } catch (error) {
        console.error('[性格演化] 切换风格失败:', error.message);
        res.status(500).json({ error: '切换风格失败' });
    }
});

/**
 * @description 获取当前性格参数，用于注入 LLM 提示词
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...personality }
 * @throws {500} 获取性格失败
 */
router.get('/personality', (req, res) => {
    try {
        const personality = characterEvolution.getPersonalityForLLM();
        res.json({
            success: true,
            ...personality
        });
    } catch (error) {
        console.error('[性格演化] 获取性格失败:', error.message);
        res.status(500).json({ error: '获取性格失败' });
    }
});

// ============================================================
// 模块名称：反馈与互动记录 API
// 功能说明：记录用户反馈、互动数据及演化数据重置
// ============================================================

/**
 * @description 记录用户对当前性格的反馈（喜欢/不喜欢），用于驱动性格演化
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.type - 反馈类型（like/dislike，必填）
 * @param {Object} res - Express 响应对象
 * @returns {Object} 反馈结果
 * @throws {400} 缺少 type 参数
 * @throws {500} 记录反馈失败
 */
router.post('/feedback', (req, res) => {
    try {
        const { type } = req.body;
        if (!type) {
            res.status(400).json({ error: '需要 type 参数 (like/dislike)' });
            return;
        }

        const result = characterEvolution.giveFeedback(type);
        res.json(result);
    } catch (error) {
        console.error('[性格演化] 记录反馈失败:', error.message);
        res.status(500).json({ error: '记录反馈失败' });
    }
});

/**
 * @description 记录一次互动数据，包含用户消息、AI 回复和反馈
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.userMessage - 用户消息
 * @param {string} req.body.aiResponse - AI 回复
 * @param {string} [req.body.feedback] - 用户反馈
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean }
 * @throws {500} 记录互动失败
 */
router.post('/record', (req, res) => {
    try {
        const { userMessage, aiResponse, feedback } = req.body;
        characterEvolution.recordInteraction(userMessage, aiResponse, feedback);
        res.json({ success: true });
    } catch (error) {
        console.error('[性格演化] 记录互动失败:', error.message);
        res.status(500).json({ error: '记录互动失败' });
    }
});

/**
 * @description 重置所有性格演化数据，恢复到初始状态
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, message: string }
 * @throws {500} 重置失败
 */
router.post('/reset', (req, res) => {
    try {
        characterEvolution.reset();
        res.json({
            success: true,
            message: '性格演化数据已重置'
        });
    } catch (error) {
        console.error('[性格演化] 重置失败:', error.message);
        res.status(500).json({ error: '重置失败' });
    }
});

module.exports = router;