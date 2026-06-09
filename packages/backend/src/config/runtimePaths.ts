/**
 * @file 运行时路径配置
 * @description 集中管理所有运行时文件路径（logs、uploads、data）
 *              支持通过环境变量覆盖，支持相对路径自动解析到项目根目录
 * @module config/runtimePaths
 * @version 1.0.0
 * @date 2026-06-06
 */

import fs from 'fs';
import path from 'path';

/**
 * 向上查找 monorepo 根目录
 * @param startDir - 起始目录
 * @returns monorepo 根目录路径
 */
function findWorkspaceRoot(startDir: string): string {
    let current = startDir;
    while (current && current !== path.dirname(current)) {
        if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
            return current;
        }
        current = path.dirname(current);
    }
    // Fallback: 从 src/config 解析到 monorepo 根目录
    return path.resolve(__dirname, '../../../..');
}

const ROOT_DIR = findWorkspaceRoot(__dirname);
const BACKEND_SRC_DIR = path.resolve(__dirname, '..');

/**
 * 解析运行时目录
 * @param envName - 环境变量名
 * @param defaultName - 默认目录名
 * @returns 运行时目录的绝对路径
 */
function resolveRuntimeDir(envName: string, defaultName: string): string {
    const configured = process.env[envName];
    if (!configured) {
        return path.join(ROOT_DIR, defaultName);
    }
    return path.isAbsolute(configured)
        ? configured
        : path.join(ROOT_DIR, configured);
}

/**
 * 确保目录存在（递归创建）
 * @param dirPath - 目录路径
 * @returns 目录路径
 */
function ensureDir(dirPath: string): string {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}

// ============================================================
// 核心目录常量
// ============================================================

const DATA_DIR = resolveRuntimeDir('XIAOMENG_DATA_DIR', 'data');
const LOG_DIR = resolveRuntimeDir('XIAOMENG_LOG_DIR', 'logs');
const UPLOADS_DIR = resolveRuntimeDir('XIAOMENG_UPLOADS_DIR', 'uploads');

// ============================================================
// 路径构建函数
// ============================================================

/**
 * 构建 data 目录下的文件路径
 * @param segments - 相对路径片段
 * @returns 完整路径
 */
function dataPath(...segments: string[]): string {
    return path.join(DATA_DIR, ...segments);
}

/**
 * 构建 uploads 目录下的文件路径
 * @param segments - 相对路径片段
 * @returns 完整路径
 */
function uploadPath(...segments: string[]): string {
    return path.join(UPLOADS_DIR, ...segments);
}

/**
 * 构建 logs 目录下的文件路径
 * @param segments - 相对路径片段
 * @returns 完整路径
 */
function logPath(...segments: string[]): string {
    return path.join(LOG_DIR, ...segments);
}

// ============================================================
// 导出
// ============================================================

export {
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