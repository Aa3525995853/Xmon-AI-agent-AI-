/**
 * @file marketRoutes.js
 * @description 插件市场与系统状态 API 路由，提供插件搜索/安装/卸载、MCP 服务器管理、
 *              能力缺口检测及系统综合状态查询等功能
 * @module routes/marketRoutes
 * @author 小梦团队
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const pluginMarket = require('../core/plugin-market');
const mcpClientManager = require('../services/mcpClientManager');
const capabilityDetector = require('../core/capability-detector');
const pluginLoader = require('../core/plugin-loader');
const taskScheduler = require('../core/task-scheduler');
const modelDegradation = require('../core/model-degradation');
const sandbox = require('../core/sandbox');
const sessionStore = require('../core/session-store');
const loopGuard = require('../core/loop-guard');
const intentClarifier = require('../core/intent-clarifier');

// ============================================================
// 模块名称：插件市场 API
// 功能说明：插件搜索、安装、卸载、详情查看及更新检测
// ============================================================

/**
 * @description 搜索插件市场中的插件，支持关键词、能力、标签和官方筛选
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.q] - 搜索关键词
 * @param {string} [req.query.capability] - 按能力筛选
 * @param {string} [req.query.tags] - 按标签筛选（逗号分隔）
 * @param {string} [req.query.official] - 是否仅显示官方插件（"true"）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, results: Array, total: number }
 */
router.get('/market/search', (req, res) => {
    const { q, capability, tags, official } = req.query;
    const results = pluginMarket.search(q || '', {
        capability: capability || undefined,
        tags: tags ? tags.split(',') : undefined,
        officialOnly: official === 'true'
    });
    res.json({ success: true, results, total: results.length });
});

/**
 * @description 获取已安装的插件列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, installed: Array, total: number }
 */
router.get('/market/installed', (req, res) => {
    const installed = pluginMarket.getInstalled();
    res.json({ success: true, installed, total: installed.length });
});

/**
 * @description 获取可安装的插件列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, available: Array, total: number }
 */
router.get('/market/available', (req, res) => {
    const available = pluginMarket.getAvailable();
    res.json({ success: true, available, total: available.length });
});

/**
 * @description 获取有可用更新的插件列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, updates: Array }
 */
router.get('/market/updates', (req, res) => {
    const updates = pluginMarket.getUpdates();
    res.json({ success: true, updates });
});

/**
 * @description 获取指定插件的详细信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 插件ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, plugin: Object } 或 404 错误
 */
router.get('/market/plugin/:id', (req, res) => {
    const detail = pluginMarket.getPluginDetail(req.params.id);
    if (!detail) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
    }
    res.json({ success: true, plugin: detail });
});

/**
 * @description 安装指定插件
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要安装的插件ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} 安装结果
 */
router.post('/market/install/:id', async (req, res) => {
    const result = await pluginMarket.install(req.params.id);
    res.json(result);
});

/**
 * @description 卸载指定插件
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 要卸载的插件ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} 卸载结果
 */
router.post('/market/uninstall/:id', async (req, res) => {
    const result = await pluginMarket.uninstall(req.params.id);
    res.json(result);
});

// ============================================================
// 模块名称：MCP 服务器管理 API
// 功能说明：MCP 服务器注册/删除/启禁用、工具调用及统计查询
// ============================================================

/**
 * @description 获取所有已注册的 MCP 服务器列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, servers: Array }
 */
router.get('/mcp/servers', (req, res) => {
    const servers = mcpClientManager.getAllServers();
    res.json({ success: true, servers });
});

/**
 * @description 获取指定 MCP 服务器的详细信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 服务器ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, server: Object } 或 404 错误
 */
router.get('/mcp/servers/:id', (req, res) => {
    const server = mcpClientManager.getServer(req.params.id);
    if (!server) {
        return res.status(404).json({ success: false, error: 'Server not found' });
    }
    res.json({ success: true, server });
});

/**
 * @description 注册新的 MCP 服务器
 * @param {Object} req - Express 请求对象
 * @param {Object} req.body - 服务器配置信息
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, serverId: string } 或 400 错误
 */
router.post('/mcp/register', async (req, res) => {
    try {
        const serverId = await mcpClientManager.registerServer(req.body);
        res.json({ success: true, serverId });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

/**
 * @description 删除指定的 MCP 服务器
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 服务器ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean }
 */
router.delete('/mcp/servers/:id', async (req, res) => {
    const result = await mcpClientManager.removeServer(req.params.id);
    res.json({ success: result });
});

/**
 * @description 启用指定的 MCP 服务器
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 服务器ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean }
 */
router.post('/mcp/servers/:id/enable', async (req, res) => {
    const result = await mcpClientManager.enableServer(req.params.id);
    res.json({ success: result });
});

/**
 * @description 禁用指定的 MCP 服务器
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 服务器ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean }
 */
router.post('/mcp/servers/:id/disable', async (req, res) => {
    const result = await mcpClientManager.disableServer(req.params.id);
    res.json({ success: result });
});

/**
 * @description 刷新指定 MCP 服务器的工具列表
 * @param {Object} req - Express 请求对象
 * @param {string} req.params.id - 服务器ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, tools: Array } 或 400 错误
 */
router.post('/mcp/servers/:id/refresh', async (req, res) => {
    try {
        const tools = await mcpClientManager.refreshTools(req.params.id);
        res.json({ success: true, tools });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ============================================================
// 模块名称：MCP 工具与能力检测 API
// 功能说明：MCP 工具查询/调用/统计、能力缺口检测及自动安装配置
// ============================================================

/**
 * @description 获取所有 MCP 服务器提供的工具列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, tools: Array }
 */
router.get('/mcp/tools', (req, res) => {
    const tools = mcpClientManager.getAllTools();
    res.json({ success: true, tools });
});

/**
 * @description 调用指定的 MCP 工具
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.tool - 工具名称（必填）
 * @param {Object} [req.body.params] - 工具参数
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, result: Object } 或错误信息
 */
router.post('/mcp/call', async (req, res) => {
    const { tool, params } = req.body;
    if (!tool) {
        return res.status(400).json({ success: false, error: '缺少 tool 参数' });
    }
    try {
        const result = await mcpClientManager.callTool(tool, params || {});
        res.json({ success: true, result });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

/**
 * @description 获取 MCP 客户端的统计信息
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, stats: Object }
 */
router.get('/mcp/stats', (req, res) => {
    const stats = mcpClientManager.getStats();
    res.json({ success: true, stats });
});

/**
 * @description 获取频繁出现的能力缺口及历史记录
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, frequentGaps: Array, recentHistory: Array }
 */
router.get('/capabilities/gaps', (req, res) => {
    const gaps = capabilityDetector.getFrequentGaps();
    const history = capabilityDetector.getGapHistory();
    res.json({ success: true, frequentGaps: gaps, recentHistory: history });
});

/**
 * @description 设置能力缺口自动安装开关
 * @param {Object} req - Express 请求对象
 * @param {boolean} [req.body.enabled=true] - 是否启用自动安装
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, autoInstallEnabled: boolean }
 */
router.post('/capabilities/auto-install', (req, res) => {
    const { enabled } = req.body;
    capabilityDetector.setAutoInstall(enabled !== false);
    res.json({ success: true, autoInstallEnabled: capabilityDetector._autoInstallEnabled });
});

// ============================================================
// 模块名称：插件列表与系统状态 API
// 功能说明：获取已加载插件列表及系统各模块综合状态
// ============================================================

/**
 * @description 获取所有已加载的插件及其能力列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, plugins: Array, capabilities: Object, total: number }
 */
router.get('/plugins', (req, res) => {
    const plugins = pluginLoader.getAllPlugins();
    const capabilities = pluginLoader.getCapabilities();
    res.json({ success: true, plugins, capabilities, total: plugins.length });
});

/**
 * @description 获取系统各模块的综合状态信息，包括调度器、市场、MCP、能力检测和意图澄清
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, status: { scheduler, market, mcp, capabilities, clarifier } }
 */
router.get('/status', (req, res) => {
    const status = {
        scheduler: taskScheduler.getStatus(),
        market: pluginMarket.getStats(),
        mcp: mcpClientManager.getStats(),
        capabilities: capabilityDetector.getStatus(),
        clarifier: intentClarifier.getStats()
    };
    res.json({ success: true, status });
});

module.exports = router;
