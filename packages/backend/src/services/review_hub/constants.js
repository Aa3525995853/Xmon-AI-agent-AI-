/**
 * @file constants.js
 * @description 审核常量定义 - 定义审核中枢所需的所有枚举类型、超时配置和标签映射
 * @module review_hub
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 枚举定义：审核场景、模式、状态和风险等级
// ============================================================

/** 审核场景枚举 - 定义不同类型的审核场景 */
const ReviewScene = {
    PLAN_REVIEW: 'plan_review',         // 规划审核：任务执行前的计划确认
    RESULT_REVIEW: 'result_review',     // 结果审核：任务执行后的结果确认
    ACTION_REVIEW: 'action_review',     // 操作审核：敏感操作执行前的确认
    RECOVER_REVIEW: 'recover_review',   // 恢复审核：执行出错后的修复方案选择
    CONTINUE_REVIEW: 'continue_review', // 继续审核：长时间任务的中间确认
    DELIVERY_REVIEW: 'delivery_review'  // 交付审核：交付物确认
};

/** 审核模式枚举 */
const ReviewMode = {
    AUTO_APPROVE: 'auto_approve',   // 自动通过：低风险操作无需用户确认
    MANUAL_REVIEW: 'manual_review', // 人工审核：需要用户手动确认
    CONDITIONAL: 'conditional'      // 条件审核：根据上下文决定是否自动通过
};

/** 审核状态枚举 */
const ReviewStatus = {
    PENDING: 'pending',       // 待审核
    APPROVED: 'approved',     // 已通过
    REJECTED: 'rejected',     // 已拒绝
    SKIPPED: 'skipped',       // 已跳过
    EXPIRED: 'expired',       // 已过期
    CANCELLED: 'cancelled'    // 已取消
};

/** 风险等级枚举 */
const RiskLevel = {
    LOW: 'low',           // 低风险
    MEDIUM: 'medium',     // 中风险
    HIGH: 'high',         // 高风险
    CRITICAL: 'critical'  // 极高风险
};

// ============================================================
// 超时配置：各场景的审核超时时间（毫秒）
// ============================================================

/** 各审核场景的超时时间配置（毫秒） */
const TIMEOUT_CONFIG = {
    [ReviewScene.PLAN_REVIEW]: 60000,     // 规划审核：60秒
    [ReviewScene.RESULT_REVIEW]: 120000,  // 结果审核：120秒
    [ReviewScene.ACTION_REVIEW]: 30000,   // 操作审核：30秒
    [ReviewScene.RECOVER_REVIEW]: 60000,  // 恢复审核：60秒
    [ReviewScene.CONTINUE_REVIEW]: 45000, // 继续审核：45秒
    [ReviewScene.DELIVERY_REVIEW]: 90000  // 交付审核：90秒
};

/** 默认审核超时时间（毫秒） */
const DEFAULT_TIMEOUT = 60000;

// ============================================================
// 标签映射：用于前端展示的中文名称
// ============================================================

/** 审核场景的中文标签映射 */
const SCENE_LABELS = {
    [ReviewScene.PLAN_REVIEW]: '规划审核',
    [ReviewScene.RESULT_REVIEW]: '结果审核',
    [ReviewScene.ACTION_REVIEW]: '操作审核',
    [ReviewScene.RECOVER_REVIEW]: '恢复审核',
    [ReviewScene.CONTINUE_REVIEW]: '继续审核',
    [ReviewScene.DELIVERY_REVIEW]: '交付审核'
};

/** 风险等级的中文标签映射 */
const RISK_LABELS = {
    [RiskLevel.LOW]: '低风险',
    [RiskLevel.MEDIUM]: '中风险',
    [RiskLevel.HIGH]: '高风险',
    [RiskLevel.CRITICAL]: '极高风险'
};

module.exports = {
    ReviewScene,
    ReviewMode,
    ReviewStatus,
    RiskLevel,
    TIMEOUT_CONFIG,
    DEFAULT_TIMEOUT,
    SCENE_LABELS,
    RISK_LABELS
};