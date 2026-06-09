/**
 * @file system_routes.js
 * @description 系统控制路由模块，提供电脑操作能力的 API 接口，包括工具定义查询、
 *              命令执行与确认、快捷操作、命令日志查询、文件打开及 Excel 预览等功能
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const path = require('path');
const os = require('os');
const router = express.Router();

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../config/runtimePaths');

/** 系统控制服务实例，通过 initSystemControl 注入 */
let systemControl = null;

/** 命令日志最大返回条数，防止日志过大影响性能 */
const MAX_LOG_ENTRIES = 50;

/** Excel 预览最大返回行数，避免大数据量传输 */
const MAX_PREVIEW_ROWS = 100;

/** 允许访问的文件系统路径白名单，限制文件操作的安全范围 */
const ALLOWED_PATHS = [
    os.homedir(),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads'),
];

// ============================================================
// 模块名称：路径安全与初始化
// 功能说明：文件路径白名单校验、系统控制服务注入
// ============================================================

/**
 * @description 检查文件路径是否在允许的白名单范围内，防止路径遍历攻击
 * @param {string} filepath - 待检查的文件路径
 * @returns {boolean} 路径是否被允许访问
 */
function isPathAllowed(filepath) {
    const resolved = path.resolve(filepath);
    return ALLOWED_PATHS.some(allowed => resolved.startsWith(allowed));
}

/**
 * @description 初始化系统控制服务实例，由服务启动时注入
 * @param {Object} sc - 系统控制服务实例
 * @returns {void}
 */
function initSystemControl(sc) {
    systemControl = sc;
}

// ============================================================
// 模块名称：系统控制命令 API
// 功能说明：工具定义查询、命令执行与确认、快捷操作
// ============================================================

/**
 * @description 获取所有可用系统控制工具的定义列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 tools 数组
 */
router.get('/tools', (req, res) => {
    if (!systemControl) {
        return res.status(500).json({ success: false, error: '系统控制服务未初始化' });
    }
    res.json({
        success: true,
        tools: systemControl.getToolDefinitions()
    });
});

/**
 * @description 执行系统控制命令，支持危险操作二次确认机制
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.command - 要执行的系统命令名称
 * @param {string} [req.body.llmResponse] - LLM 的原始回复内容（用于解析工具调用）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含执行结果；若需确认则返回 requireConfirm: true 和 pendingToolCall
 */
router.post('/execute', async (req, res) => {
    if (!systemControl) {
        return res.status(500).json({ success: false, error: '系统控制服务未初始化' });
    }

    const { command, llmResponse } = req.body;

    if (!command) {
        return res.status(400).json({ success: false, error: '缺少命令参数' });
    }

    try {
        const result = await systemControl.execute(command, llmResponse);

        if (!result) {
            return res.json({ success: false, message: '执行无结果返回' });
        }

        if (result.requireConfirm) {
            return res.json({
                success: true,
                requireConfirm: true,
                message: result.message,
                pendingToolCall: result.pendingToolCall
            });
        }

        res.json(result);
    } catch (error) {
        console.error('[系统控制路由] 执行失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 确认执行危险操作，传入之前返回的 pendingToolCall 完成二次确认
 * @param {Object} req - Express 请求对象
 * @param {Object} req.body.pendingToolCall - 待确认的工具调用对象
 * @param {string} [req.body.userInput] - 用户的附加输入
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含工具执行结果
 */
router.post('/confirm', async (req, res) => {
    if (!systemControl) {
        return res.status(500).json({ success: false, error: '系统控制服务未初始化' });
    }

    const { pendingToolCall, userInput } = req.body;

    if (!pendingToolCall) {
        return res.status(400).json({ success: false, error: '缺少待确认的操作' });
    }

    try {
        const result = await systemControl.executeToolCalls([pendingToolCall], userInput);
        res.json(result);
    } catch (error) {
        console.error('[系统控制路由] 确认执行失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 快捷操作接口，直接调用指定工具名称和参数执行操作
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.action - 工具/操作名称
 * @param {Object} [req.body.params={}] - 操作参数对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含工具执行结果
 */
router.post('/quick', async (req, res) => {
    if (!systemControl) {
        return res.status(500).json({ success: false, error: '系统控制服务未初始化' });
    }

    const { action, params } = req.body;

    if (!action) {
        return res.status(400).json({ success: false, error: '缺少操作类型' });
    }

    try {
        const result = await systemControl.executeTool(action, params || {});
        res.json(result);
    } catch (error) {
        console.error('[系统控制路由] 快捷操作失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 模块名称：文件操作 API
// 功能说明：命令日志查询、本地文件打开、Excel 文件预览
// ============================================================

/**
 * @description 获取系统控制命令执行日志
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 logs 数组
 */
router.get('/logs', (req, res) => {
    if (!systemControl) {
        return res.status(500).json({ success: false, error: '系统控制服务未初始化' });
    }

    try {
        const fs = require('fs');
        const logFile = dataPath('system_control_log.json');

        if (fs.existsSync(logFile)) {
            const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
            res.json({ success: true, logs: logs.slice(-MAX_LOG_ENTRIES) });
        } else {
            res.json({ success: true, logs: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @description 打开本地文件，使用系统默认程序打开指定路径的文件。
 *              仅允许打开白名单路径下的文件，防止安全风险。
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.path - 要打开的文件绝对路径
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success: true 或错误信息
 */
router.get('/open-file', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) {
        return res.status(400).json({ success: false, error: '缺少文件路径' });
    }
    if (!isPathAllowed(filePath)) {
        return res.status(403).json({ success: false, error: '文件路径不在允许的范围内' });
    }
    const { exec } = require('child_process');
    const normalizedPath = filePath.replace(/\//g, '\\');
    exec(`start "" "${normalizedPath}"`, (err) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true });
    });
});

/**
 * @description Excel 文件预览接口，读取 Excel 文件内容并返回结构化数据。
 *              仅允许预览白名单路径下的文件，最多返回前 100 行数据。
 * @param {Object} req - Express 请求对象
 * @param {string} req.query.path - Excel 文件的绝对路径
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 filepath、sheetName、headers、data、rowCount、columnCount、schema、stats
 */
router.get('/preview-excel', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) {
        return res.status(400).json({ success: false, error: '缺少文件路径' });
    }
    if (!isPathAllowed(filePath)) {
        return res.status(403).json({ success: false, error: '文件路径不在允许的范围内' });
    }

    try {
        const fs = require('fs');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: '文件不存在' });
        }

        const excelService = require('../services/excel_intelligence');
        const result = await excelService.read(filePath);

        if (result.success) {
            res.json({
                success: true,
                filepath: filePath,
                sheetName: result.sheetName,
                headers: result.headers,
                data: result.data.slice(0, MAX_PREVIEW_ROWS),
                rowCount: result.rowCount,
                columnCount: result.headers?.length || 0,
                schema: result.schema,
                stats: result.stats
            });
        } else {
            res.status(500).json({ success: false, error: result.error || '读取失败' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = { router, initSystemControl };
