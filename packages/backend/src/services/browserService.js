/**
 * @file browserService.js
 * @description 浏览器自动化服务入口，提供网页浏览、内容抓取和网页交互能力，
 *              支持通过自然语言指令操控浏览器完成信息检索和页面操作
 * @module services/browserService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const BrowserService = require("./browserService/index");

// ============================================================
// 模块导出：浏览器自动化服务
// 功能说明：同时导出实例和类定义，兼容不同的使用方式
// ============================================================

module.exports = BrowserService;
module.exports.BrowserService = BrowserService.BrowserService;
