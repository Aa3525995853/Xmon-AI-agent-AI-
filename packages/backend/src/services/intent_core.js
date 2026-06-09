/**
 * @file intent_core.js
 * @description 意图理解中枢入口文件，加载并导出意图理解主模块，
 *              负责用户意图的分类、识别和路由决策
 * @module services/intent_core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：意图理解中枢入口
// 功能说明：加载并导出 IntentCore 主模块
// ============================================================

const IntentCoreMain = require('./intent_core/index');

module.exports = IntentCoreMain;