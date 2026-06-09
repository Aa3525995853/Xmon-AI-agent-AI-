/**
 * @file runtimePaths.js
 * @description 集中管理运行时路径配置。运行时文件（日志、上传音频、生成图表、用户数据、
 *              推送订阅、本地密钥等）是可变的，不应放在 src/ 目录下。本模块为后端提供
 *              统一的运行时文件路径管理入口。
 * @module config/runtimePaths
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 模块名称：工作区根目录查找
// 功能说明：从当前目录向上查找 pnpm-workspace.yaml，定位 monorepo 根目录
// ============================================================

/**
 * @description 从指定目录向上查找 monorepo 工作区根目录
 * @param {string} startDir - 搜索起始目录的绝对路径
 * @returns {string} 工作区根目录的绝对路径
 */
function findWorkspaceRoot(startDir) {
    let current = startDir;
    while (current && current !== path.dirname(current)) {
        if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
            return current;
        }
        current = path.dirname(current);
    }

    // 当 pnpm-workspace.yaml 不存在时的兜底策略（打包或部分部署场景）
    // 从 src/config 向上四级即为 monorepo 根目录
    return path.resolve(__dirname, '../../../..');
}

/** @type {string} monorepo 工作区根目录 */
const ROOT_DIR = findWorkspaceRoot(__dirname);
/** @type {string} 后端 src 目录 */
const BACKEND_SRC_DIR = path.resolve(__dirname, '..');

// ============================================================
// 模块名称：运行时目录解析
// 功能说明：通过环境变量覆盖默认路径，支持绝对路径和相对路径
// ============================================================

/**
 * @description 解析运行时目录路径。优先使用环境变量指定的路径，
 *              未设置时使用默认路径。相对路径基于工作区根目录解析。
 * @param {string} envName - 环境变量名称
 * @param {string} defaultName - 默认目录名（相对于工作区根目录）
 * @returns {string} 解析后的绝对路径
 */
function resolveRuntimeDir(envName, defaultName) {
    const configured = process.env[envName];
    if (!configured) {
        return path.join(ROOT_DIR, defaultName);
    }

    return path.isAbsolute(configured)
        ? configured
        : path.join(ROOT_DIR, configured);
}

/**
 * @description 确保目录存在，不存在则递归创建
 * @param {string} dirPath - 目标目录的绝对路径
 * @returns {string} 确保存在后的目录路径
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}

// ============================================================
// 模块名称：核心运行时目录常量
// 功能说明：定义日志、数据、上传三个核心运行时目录
// ============================================================

/** @type {string} 数据目录，存放本地 JSON 存储和生成的密钥 */
const DATA_DIR = resolveRuntimeDir('XIAOMENG_DATA_DIR', 'data');
/** @type {string} 日志目录，存放应用日志输出 */
const LOG_DIR = resolveRuntimeDir('XIAOMENG_LOG_DIR', 'logs');
/** @type {string} 上传目录，存放临时上传和可下载的生成文件 */
const UPLOADS_DIR = resolveRuntimeDir('XIAOMENG_UPLOADS_DIR', 'uploads');

// ============================================================
// 模块名称：路径拼接辅助函数
// 功能说明：提供便捷的子路径拼接方法
// ============================================================

/**
 * @description 拼接数据目录下的子路径
 * @param {...string} segments - 子路径片段
 * @returns {string} 拼接后的绝对路径
 */
function dataPath(...segments) {
    return path.join(DATA_DIR, ...segments);
}

/**
 * @description 拼接上传目录下的子路径
 * @param {...string} segments - 子路径片段
 * @returns {string} 拼接后的绝对路径
 */
function uploadPath(...segments) {
    return path.join(UPLOADS_DIR, ...segments);
}

/**
 * @description 拼接日志目录下的子路径
 * @param {...string} segments - 子路径片段
 * @returns {string} 拼接后的绝对路径
 */
function logPath(...segments) {
    return path.join(LOG_DIR, ...segments);
}

module.exports = {
    ROOT_DIR,
    BACKEND_SRC_DIR,
    DATA_DIR,
    LOG_DIR,
    UPLOADS_DIR,
    ensureDir,
    dataPath,
    uploadPath,
    logPath
};
