/**
 * @file proactive_service.js
 * @description 主动服务入口文件，加载并导出主动服务模块，
 *              提供定时问候、里程碑庆祝、情绪关心和互动激励等主动服务功能
 * @module services/proactive_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：主动服务入口
// 功能说明：加载并导出主动服务工厂函数、缓存清理和 legacy 实例
// ============================================================

const { getProactiveService, clearProactiveCache } = require("./proactive_service/index");

module.exports = {
    getProactiveService,
    clearProactiveCache,
    // 导出 legacy 模式的单例实例，保持向后兼容
    legacyProactiveService: getProactiveService("legacy")
};
