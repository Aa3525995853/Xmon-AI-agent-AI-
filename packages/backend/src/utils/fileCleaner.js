/**
 * @file fileCleaner.js
 * @description 临时上传文件清理工具。语音上传文件仅在 ASR/TTS 请求处理期间使用，
 *              本模块定期清理过期的临时文件，防止磁盘空间被持续占用。
 * @module utils/fileCleaner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 模块名称：清理配置
// 功能说明：定义文件过期时间和清理间隔
// ============================================================

/** @type {number} 文件最大保留时间（毫秒），超过此时间的上传文件将被清理 */
const MAX_AGE = 5 * 60 * 1000;

// ============================================================
// 模块名称：文件清理核心逻辑
// 功能说明：扫描上传目录并删除过期文件
// ============================================================

/**
 * @description 清理上传目录中超过 MAX_AGE 的过期文件
 *              仅删除普通文件，跳过子目录
 */
function cleanupOldFiles() {
    if (!fs.existsSync(UPLOADS_DIR)) {
        return;
    }

    const now = Date.now();
    let deletedCount = 0;

    fs.readdir(UPLOADS_DIR, (err, files) => {
        if (err) {
            console.error('[cleanup] Failed to read uploads directory:', err.message);
            return;
        }

        files.forEach(file => {
            const filePath = path.join(UPLOADS_DIR, file);
            fs.stat(filePath, (statErr, stats) => {
                if (statErr || stats.isDirectory()) return;

                if (now - stats.mtimeMs > MAX_AGE) {
                    fs.unlink(filePath, (unlinkErr) => {
                        if (!unlinkErr) {
                            deletedCount++;
                            console.log(`[cleanup] Removed expired upload: ${file}`);
                        }
                    });
                }
            });
        });

        if (deletedCount > 0) {
            console.log(`[cleanup] Removed ${deletedCount} expired upload(s)`);
        }
    });
}

// ============================================================
// 模块名称：定时清理任务
// 功能说明：启动定期清理任务并返回定时器句柄
// ============================================================

/**
 * @description 启动定期清理任务并返回定时器句柄。
 *              返回句柄方便测试和优雅关闭时清除定时器，避免留下未关闭的 Node 句柄。
 * @param {number} [intervalMs=3600000] - 清理间隔（毫秒），默认1小时
 * @returns {NodeJS.Timeout} 定时器句柄，可用于 clearInterval 停止任务
 */
function startCleanupTask(intervalMs = 60 * 60 * 1000) {
    ensureDir(UPLOADS_DIR);
    cleanupOldFiles();
    const timer = setInterval(cleanupOldFiles, intervalMs);
    console.log('[cleanup] Upload cleanup task started');
    return timer;
}

module.exports = {
    cleanupOldFiles,
    startCleanupTask
};
