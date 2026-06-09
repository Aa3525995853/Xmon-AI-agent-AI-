/**
 * @file mcpClientManager.js
 * @description MCP 客户端管理器入口文件，加载并导出 MCP 客户端管理模块，
 *              负责管理 MCP（Model Context Protocol）客户端的连接和生命周期
 * @module services/mcpClientManager
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：MCP 客户端管理器入口
// 功能说明：加载并导出 McpClientManager 模块
// ============================================================

const McpClientManager = require("./mcpClientManager/index");

module.exports = McpClientManager;
