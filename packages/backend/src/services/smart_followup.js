/**
 * @file smart_followup.js
 * @description 智能后续服务入口文件，加载并导出智能后续服务模块，
 *              用于在对话后自动推荐相关操作和后续动作
 * @module services/smart_followup
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：智能后续服务入口
// 功能说明：加载并导出 SmartFollowupService 及其常量
// ============================================================

const SmartFollowupService = require("./smart_followup/index");

// 导出服务实例和常量，供外部使用
module.exports = SmartFollowupService;
module.exports.SmartFollowupService = SmartFollowupService.SmartFollowupService;
module.exports.FOLLOWUP_ACTIONS = SmartFollowupService.FOLLOWUP_ACTIONS;
