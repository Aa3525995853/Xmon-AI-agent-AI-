/**
 * @file review_hub.js
 * @description 审核中枢入口文件，加载并导出审核中枢模块，
 *              用于内容审核、结果汇总和审核决策
 * @module services/review_hub
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：审核中枢入口
// 功能说明：加载并导出 ReviewHub 模块
// ============================================================

const ReviewHub = require("./review_hub/index");

module.exports = ReviewHub;
