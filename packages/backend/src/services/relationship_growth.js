/**
 * @file relationship_growth.js
 * @description 情感成长系统入口文件，加载并导出关系成长模块，
 *              管理用户与 AI 之间的关系阶段、里程碑和称呼变化
 * @module services/relationship_growth
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：情感成长系统入口
// 功能说明：加载并导出关系成长单例实例和阶段常量
// ============================================================

const { getRelationshipGrowth, RELATIONSHIP_STAGES } = require('./relationship_growth/index');

// 创建 legacy 模式的单例实例，保持向后兼容
const relationshipGrowthInstance = getRelationshipGrowth('legacy');

module.exports = { legacyRelationshipGrowth: relationshipGrowthInstance, RELATIONSHIP_STAGES };