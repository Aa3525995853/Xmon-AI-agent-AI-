/**
 * @file plan_routes.js
 * @description 计划路由模块 - 提供计划的增删改查API
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */

const express = require('express');
const router = express.Router();
const planService = require('../services/plan_service');
const { logger } = require('../utils/logger');

/**
 * @description 获取所有计划列表
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.type] - 可选的计划类型过滤
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 plans 列表
 */
router.get('/list', (req, res) => {
    try {
        const { type } = req.query;
        let plans;

        if (type) {
            plans = planService.getPlansByType(type);
        } else {
            plans = planService.loadPlansList();
        }

        res.json({
            success: true,
            plans,
            total: plans.length
        });
    } catch (error) {
        logger.error('[PlanRoutes] 获取计划列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 获取单个计划详情
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 计划ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 plan 对象
 */
router.get('/:id', (req, res) => {
    try {
        const plan = planService.getPlanById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                error: '计划不存在'
            });
        }

        res.json({
            success: true,
            plan
        });
    } catch (error) {
        logger.error('[PlanRoutes] 获取计划详情失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 创建新计划
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.title - 计划标题
 * @param {string} req.body.content - 计划内容（Markdown）
 * @param {string} [req.body.type='travel'] - 计划类型
 * @param {string} [req.body.description] - 计划描述
 * @param {Object} [req.body.metadata] - 额外元数据
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 plan 对象
 */
router.post('/', (req, res) => {
    try {
        const { title, content, type, description, metadata } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({
                success: false,
                error: '计划标题不能为空'
            });
        }

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                error: '计划内容不能为空'
            });
        }

        const result = planService.savePlan({
            title,
            content,
            type: type || 'travel',
            description,
            metadata
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({
            success: true,
            plan: result.plan,
            message: '计划已保存'
        });
    } catch (error) {
        logger.error('[PlanRoutes] 创建计划失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 更新计划
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 计划ID
 * @param {Object} req.body - 要更新的字段
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 plan 对象
 */
router.put('/:id', (req, res) => {
    try {
        const { title, content, description, metadata } = req.body;
        const updates = {};

        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (description !== undefined) updates.description = description;
        if (metadata !== undefined) updates.metadata = metadata;

        const result = planService.updatePlan(req.params.id, updates);

        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json({
            success: true,
            plan: result.plan,
            message: '计划已更新'
        });
    } catch (error) {
        logger.error('[PlanRoutes] 更新计划失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 删除计划
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 计划ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success
 */
router.delete('/:id', (req, res) => {
    try {
        const result = planService.deletePlan(req.params.id);

        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json({
            success: true,
            message: '计划已删除'
        });
    } catch (error) {
        logger.error('[PlanRoutes] 删除计划失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 获取计划统计
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和统计信息
 */
router.get('/stats', (req, res) => {
    try {
        const stats = planService.getStats();
        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        logger.error('[PlanRoutes] 获取统计失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;