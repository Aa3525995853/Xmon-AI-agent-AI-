/**
 * @file planner.js
 * @description 自主规划 Agent 入口文件，加载并导出规划模块，
 *              负责任务分解、执行计划生成和步骤编排
 * @module services/planner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：自主规划 Agent 入口
// 功能说明：加载并导出 Planner 主模块
// ============================================================

const PlannerMain = require('./planner/index');

module.exports = PlannerMain;