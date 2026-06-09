/**
 * @file direct_routes.js
 * @description 直达路由（Tool 3），提供一键直达能力的 API 端点，包括综合意图执行、
 *              快捷搜索、快捷操作（应用启动/Shell/URL/文件打开/邮件等）、
 *              意图识别及历史记录管理
 * @module routes/direct_routes
 * @author 小梦团队
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();

let logger;
try { logger = require('../utils/logger').logger; } catch (e) { logger = { error: console.error, warn: console.warn, info: console.info }; }

let directActionService = null;

/**
 * @description 初始化直达服务实例，由外部调用注入
 * @param {Object} service - DirectActionService 实例
 */
function initDirectService(service) {
    directActionService = service;
}

// ============================================================
// 模块名称：直达执行 API
// 功能说明：综合意图执行、快捷搜索、快捷操作及意图识别
// ============================================================

/**
 * @description 一键直达：综合执行用户意图，自动识别并执行对应操作
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.text - 用户输入文本（必填）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...result }
 * @throws {400} 缺少输入内容
 * @throws {500} 执行失败
 */
router.post('/execute', async (req, res) => {
    const { text } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({
            success: false,
            error: '请输入内容'
        });
    }

    try {
        const result = await directActionService.directExecute(text);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('[直达路由] 执行失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 快捷搜索，根据类型和关键词执行搜索
 * @param {Object} req - Express 请求对象
 * @param {string} [req.body.type] - 搜索类型
 * @param {string} req.body.query - 搜索关键词（必填）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...result }
 * @throws {400} 缺少搜索关键词
 * @throws {500} 搜索失败
 */
router.post('/search', async (req, res) => {
    const { type, query } = req.body;

    if (!query || !query.trim()) {
        return res.status(400).json({
            success: false,
            error: '请输入搜索关键词'
        });
    }

    try {
        const result = await directActionService.executeSearch(type, query);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('[直达路由] 搜索失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 执行快捷操作，支持应用启动、Shell 命令、URL 打开、文件打开和邮件等操作类型。
 *              根据返回的 action 类型自动路由到对应的执行逻辑
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.toolId - 工具/操作ID（必填）
 * @param {Object} [req.body.params] - 操作参数
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...result } 操作执行结果
 * @throws {400} 缺少操作ID
 * @throws {500} 工具执行失败
 */
router.post('/tool', async (req, res) => {
    const { toolId, params } = req.body;

    if (!toolId) {
        return res.status(400).json({
            success: false,
            error: '请指定操作'
        });
    }

    try {
        const result = await directActionService.executeTool(toolId, params || {});

        if (result.action === 'launch_app' && result.appName) {
            try {
                const systemControl = require('../services/system_control');
                const launchResult = await systemControl.executeTool('launch_app', { app_name: result.appName });
                res.json({
                    success: launchResult.success !== false,
                    message: launchResult.message || result.message,
                    type: result.type,
                    action: 'launch_app'
                });
            } catch (e) {
                const { exec } = require('child_process');
                exec(`start "" "${result.appName}"`, (err) => {});
                res.json({
                    success: true,
                    message: result.message,
                    type: result.type,
                    action: 'launch_app'
                });
            }
            return;
        }

        if (result.action === 'shell' && result.command) {
            const { exec } = require('child_process');
            exec(result.command, (error) => {
                if (error) {
                    logger.error('[直达路由] Shell执行失败:', error);
                }
            });
            res.json({
                success: true,
                message: result.message,
                type: result.type,
                action: 'shell'
            });
            return;
        }

        if (result.action === 'open_url' && result.url) {
            const { exec } = require('child_process');
            exec(`start "" "${result.url}"`, (err) => {});
            res.json({
                success: true,
                message: result.message,
                type: result.type,
                url: result.url,
                action: 'open_url'
            });
            return;
        }

        if (result.action === 'open' && result.openPath) {
            const { exec } = require('child_process');
            exec(`start "" "${result.openPath}"`, (err) => {});
            res.json({
                success: true,
                message: result.message,
                type: result.type,
                filePath: result.filePath,
                filename: result.filename,
                action: 'open'
            });
            return;
        }

        if (result.action === 'launch_mailto') {
            res.json({
                success: true,
                message: result.message,
                type: result.type,
                action: 'launch_mailto'
            });
            return;
        }

        res.json({
            success: result.success !== false,
            ...result
        });

    } catch (error) {
        logger.error('[直达路由] 工具执行失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 识别用户意图，返回意图类型和相关参数
 * @param {Object} req - Express 请求对象
 * @param {string} [req.body.text] - 用户输入文本
 * @param {string} [req.body.message] - 用户消息（text 的别名）
 * @param {string} [req.body.query] - 查询文本（text 的别名）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, ...intent }
 * @throws {400} 缺少输入内容
 * @throws {500} 意图识别失败
 */
router.post('/intent', async (req, res) => {
    const text = req.body.text || req.body.message || req.body.query;

    if (!text || !text.trim()) {
        return res.status(400).json({
            success: false,
            error: '请输入内容'
        });
    }

    try {
        const intent = await directActionService.recognizeIntent(text);

        res.json({
            success: true,
            ...intent
        });

    } catch (error) {
        logger.error('[直达路由] 意图识别失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：快捷列表与历史记录 API
// 功能说明：获取快捷工具/搜索列表、历史记录查询与清除
// ============================================================

/**
 * @description 获取可用的快捷工具列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, tools: Array }
 */
router.get('/tools', (req, res) => {
    res.json({
        success: true,
        tools: directActionService.getQuickTools()
    });
});

/**
 * @description 获取可用的快捷搜索列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, searches: Array }
 */
router.get('/searches', (req, res) => {
    res.json({
        success: true,
        searches: directActionService.getQuickSearches()
    });
});

/**
 * @description 获取搜索和操作的历史记录
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.type] - 历史类型筛选
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, searchHistory: Array, actionHistory: Array }
 */
router.get('/history', (req, res) => {
    const { type } = req.query;

    res.json({
        success: true,
        searchHistory: directActionService.getSearchHistory(),
        actionHistory: directActionService.getActionHistory()
    });
});

/**
 * @description 清除历史记录，可按类型筛选清除
 * @param {Object} req - Express 请求对象
 * @param {string} [req.query.type] - 历史类型筛选
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, message: string }
 */
router.delete('/history', (req, res) => {
    const { type } = req.query;

    directActionService.clearHistory(type);

    res.json({
        success: true,
        message: '历史记录已清除'
    });
});

module.exports = { router, initDirectService };
module.exports.router = router;
module.exports.initDirectService = initDirectService;