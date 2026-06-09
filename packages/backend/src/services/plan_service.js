/**
 * @file plan_service.js
 * @description 计划服务 - 管理用户保存的计划（旅行规划、待办事项等）
 * @module services
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

/** 计划数据存储目录 */
const PLANS_DIR = path.join(__dirname, '../../data/plans');

/** 计划ID前缀 */
const PLAN_PREFIX = 'plan_';

/** 最大计划数量 */
const MAX_PLANS = 100;

/**
 * 确保计划存储目录存在
 * @returns {void}
 */
function ensurePlansDir() {
    if (!fs.existsSync(PLANS_DIR)) {
        fs.mkdirSync(PLANS_DIR, { recursive: true });
    }
}

/**
 * 生成唯一计划ID
 * @returns {string} 计划ID
 */
function generatePlanId() {
    return PLAN_PREFIX + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * 获取计划文件路径
 * @param {string} planId - 计划ID
 * @returns {string} 计划文件完整路径
 */
function getPlanFilePath(planId) {
    return path.join(PLANS_DIR, `${planId}.json`);
}

/**
 * 保存计划
 * @param {Object} planData - 计划数据
 * @param {string} planData.title - 计划标题
 * @param {string} planData.content - 计划内容（Markdown）
 * @param {string} [planData.type='travel'] - 计划类型：travel/general/custom
 * @param {string} [planData.description] - 计划描述
 * @param {Object} [planData.metadata] - 额外元数据
 * @returns {Object} 保存结果 { success, plan }
 */
function savePlan(planData) {
    ensurePlansDir();

    const { title, content, type = 'travel', description, metadata } = planData;

    if (!title || !title.trim()) {
        return { success: false, error: '计划标题不能为空' };
    }

    if (!content || !content.trim()) {
        return { success: false, error: '计划内容不能为空' };
    }

    // 加载现有计划列表
    const plans = loadPlansList();

    // 检查数量限制
    if (plans.length >= MAX_PLANS) {
        // 删除最旧的计划
        const oldest = plans.sort((a, b) => a.createdAt - b.createdAt)[0];
        if (oldest) {
            deletePlan(oldest.id);
        }
    }

    const planId = generatePlanId();
    const now = Date.now();

    const plan = {
        id: planId,
        title: title.trim(),
        content: content.trim(),
        type,
        description: description?.trim() || '',
        metadata: metadata || {},
        createdAt: now,
        updatedAt: now
    };

    // 保存计划文件
    const filePath = getPlanFilePath(planId);
    fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), 'utf8');

    logger.info(`[PlanService] 保存计划成功: ${planId} - ${title}`);

    return { success: true, plan };
}

/**
 * 加载所有计划列表（不含内容，用于列表展示）
 * @returns {Array} 计划列表
 */
function loadPlansList() {
    ensurePlansDir();

    try {
        const files = fs.readdirSync(PLANS_DIR).filter(f => f.endsWith('.json'));
        const plans = [];

        for (const file of files) {
            try {
                const filePath = path.join(PLANS_DIR, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                // 列表中不返回完整内容
                plans.push({
                    id: data.id,
                    title: data.title,
                    type: data.type,
                    description: data.description,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt
                });
            } catch (e) {
                logger.warn(`[PlanService] 跳过损坏的计划文件: ${file}`);
            }
        }

        // 按创建时间倒序
        plans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        return plans;
    } catch (error) {
        logger.error('[PlanService] 加载计划列表失败:', error);
        return [];
    }
}

/**
 * 根据ID获取单个计划（含完整内容）
 * @param {string} planId - 计划ID
 * @returns {Object|null} 计划对象
 */
function getPlanById(planId) {
    if (!planId) return null;

    const filePath = getPlanFilePath(planId);

    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        logger.error(`[PlanService] 加载计划失败: ${planId}`, error);
        return null;
    }
}

/**
 * 更新计划
 * @param {string} planId - 计划ID
 * @param {Object} updates - 要更新的字段
 * @returns {Object} 更新结果
 */
function updatePlan(planId, updates) {
    const plan = getPlanById(planId);

    if (!plan) {
        return { success: false, error: '计划不存在' };
    }

    const updatedPlan = {
        ...plan,
        ...updates,
        id: plan.id, // 禁止修改ID
        createdAt: plan.createdAt, // 禁止修改创建时间
        updatedAt: Date.now()
    };

    const filePath = getPlanFilePath(planId);
    fs.writeFileSync(filePath, JSON.stringify(updatedPlan, null, 2), 'utf8');

    logger.info(`[PlanService] 更新计划: ${planId}`);

    return { success: true, plan: updatedPlan };
}

/**
 * 删除计划
 * @param {string} planId - 计划ID
 * @returns {Object} 删除结果
 */
function deletePlan(planId) {
    const filePath = getPlanFilePath(planId);

    if (!fs.existsSync(filePath)) {
        return { success: false, error: '计划不存在' };
    }

    try {
        fs.unlinkSync(filePath);
        logger.info(`[PlanService] 删除计划: ${planId}`);
        return { success: true };
    } catch (error) {
        logger.error(`[PlanService] 删除计划失败: ${planId}`, error);
        return { success: false, error: error.message };
    }
}

/**
 * 获取计划统计
 * @returns {Object} 统计信息
 */
function getStats() {
    const plans = loadPlansList();
    const byType = {};

    for (const plan of plans) {
        const type = plan.type || 'other';
        byType[type] = (byType[type] || 0) + 1;
    }

    return {
        total: plans.length,
        byType
    };
}

/**
 * 根据类型获取计划列表
 * @param {string} type - 计划类型
 * @returns {Array} 计划列表
 */
function getPlansByType(type) {
    const allPlans = loadPlansList();
    return allPlans.filter(p => p.type === type);
}

module.exports = {
    savePlan,
    loadPlansList,
    getPlanById,
    updatePlan,
    deletePlan,
    getStats,
    getPlansByType
};