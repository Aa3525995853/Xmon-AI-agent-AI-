/**
 * @file growth_routes.js
 * @description 情感成长系统 API 路由，提供成长状态查询、里程碑获取、
 *              称呼信息、解锁内容查看及互动记录等功能
 * @module routes/growth_routes
 * @author 小梦团队
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const { legacyRelationshipGrowth: relationshipGrowth, RELATIONSHIP_STAGES } = require('../services/relationship_growth');

// ============================================================
// 模块名称：成长状态与里程碑 API
// 功能说明：查询成长状态、里程碑列表、称呼信息及解锁内容
// ============================================================

/**
 * @description 获取当前成长状态，包括关系阶段、互动统计和阶段定义
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...status, stages: Array }
 * @throws {500} 获取成长状态失败
 */
router.get('/status', (req, res) => {
    try {
        const status = relationshipGrowth.getStatus();
        res.json({
            success: true,
            ...status,
            stages: RELATIONSHIP_STAGES
        });
    } catch (error) {
        console.error('[GrowthRoutes] 获取状态失败:', error);
        res.status(500).json({ error: '获取成长状态失败' });
    }
});

/**
 * @description 获取已达成的里程碑列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, milestones: Array }
 * @throws {500} 获取里程碑失败
 */
router.get('/milestones', (req, res) => {
    try {
        const milestones = relationshipGrowth.getMilestones();
        res.json({
            success: true,
            milestones: milestones
        });
    } catch (error) {
        console.error('[GrowthRoutes] 获取里程碑失败:', error);
        res.status(500).json({ error: '获取里程碑失败' });
    }
});

/**
 * @description 获取当前关系阶段的称呼信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, address: Object }
 * @throws {500} 获取称呼信息失败
 */
router.get('/address', (req, res) => {
    try {
        const address = relationshipGrowth.getAddress();
        res.json({
            success: true,
            address: address
        });
    } catch (error) {
        console.error('[GrowthRoutes] 获取称呼失败:', error);
        res.status(500).json({ error: '获取称呼信息失败' });
    }
});

/**
 * @description 获取当前关系阶段已解锁的内容
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, unlocks: Array }
 * @throws {500} 获取解锁内容失败
 */
router.get('/unlocks', (req, res) => {
    try {
        const unlocks = relationshipGrowth.getUnlocked();
        res.json({
            success: true,
            unlocks: unlocks
        });
    } catch (error) {
        console.error('[GrowthRoutes] 获取解锁内容失败:', error);
        res.status(500).json({ error: '获取解锁内容失败' });
    }
});

// ============================================================
// 模块名称：互动记录 API
// 功能说明：添加互动记录，推动关系成长
// ============================================================

/**
 * @description 添加一次互动记录，默认类型为 chat
 * @param {Object} req - Express 请求对象
 * @param {string} [req.body.type=chat] - 互动类型（如 chat、voice、deep_chat 等）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, result: Object }
 * @throws {500} 添加互动失败
 */
router.post('/interaction', (req, res) => {
    try {
        const { type = 'chat' } = req.body;
        relationshipGrowth.addInteraction(type).then(result => {
            res.json({ success: true, result: result });
        }).catch(error => {
            console.error('[GrowthRoutes] 添加互动失败:', error);
            res.status(500).json({ error: '添加互动失败' });
        });
    } catch (error) {
        console.error('[GrowthRoutes] 添加互动失败:', error);
        res.status(500).json({ error: '添加互动失败' });
    }
});

module.exports = router;