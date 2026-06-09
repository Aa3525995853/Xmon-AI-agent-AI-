/**
 * @file onboarding_routes.js
 * @description Onboarding 路由模块，提供首次体验的 API 接口，包括获取首次问候语、
 *              处理用户回复、检查完成状态、跳过及重置等功能
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const { legacyOnboardingService: onboardingService } = require('../services/onboarding_service');

// ============================================================
// 模块名称：Onboarding 交互
// 功能说明：首次问候、处理回复
// ============================================================

/**
 * @description 获取首次问候语，若 Onboarding 已完成则返回提示
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和问候内容
 */
router.get('/greeting', (req, res) => {
    try {
        const greeting = onboardingService.getFirstGreeting();
        if (greeting) {
            res.json({
                success: true,
                ...greeting
            });
        } else {
            res.json({
                success: false,
                message: 'Onboarding 已完成'
            });
        }
    } catch (error) {
        console.error('[Onboarding] 获取问候语失败:', error.message);
        res.status(500).json({ error: '获取问候语失败' });
    }
});

/**
 * @description 处理用户在 Onboarding 流程中的回复，推进引导步骤
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.message - 用户的回复内容
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和下一步引导内容
 */
router.post('/respond', (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            res.status(400).json({ error: '需要 message 参数' });
            return;
        }

        const response = onboardingService.processResponse(message);
        if (response) {
            res.json({
                success: true,
                ...response
            });
        } else {
            res.json({
                success: false,
                message: 'Onboarding 已完成'
            });
        }
    } catch (error) {
        console.error('[Onboarding] 处理回复失败:', error.message);
        res.status(500).json({ error: '处理回复失败' });
    }
});

// ============================================================
// 模块名称：Onboarding 状态管理
// 功能说明：检查完成状态、跳过、重置
// ============================================================

/**
 * @description 检查 Onboarding 是否完成，返回当前步骤和已收集的信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 completed、currentStep、collectedInfo
 */
router.get('/status', (req, res) => {
    try {
        const completed = onboardingService.isCompleted();
        res.json({
            success: true,
            completed,
            currentStep: completed ? null : onboardingService.getCurrentStep(),
            collectedInfo: completed ? onboardingService.getCollectedInfo() : null
        });
    } catch (error) {
        console.error('[Onboarding] 获取状态失败:', error.message);
        res.status(500).json({ error: '获取状态失败' });
    }
});

/**
 * @description 跳过 Onboarding 流程，直接完成引导
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和跳过结果
 */
router.post('/skip', (req, res) => {
    try {
        const result = onboardingService.skip();
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('[Onboarding] 跳过失败:', error.message);
        res.status(500).json({ error: '跳过失败' });
    }
});

/**
 * @description 重置 Onboarding 状态（用于测试），重新开始引导流程
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和确认消息
 */
router.post('/reset', (req, res) => {
    try {
        onboardingService.reset();
        res.json({
            success: true,
            message: 'Onboarding 已重置'
        });
    } catch (error) {
        console.error('[Onboarding] 重置失败:', error.message);
        res.status(500).json({ error: '重置失败' });
    }
});

module.exports = router;