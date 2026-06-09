/**
 * 文件清理工具模块
 * 定期清理临时文件，防止幽灵文件泄漏
 */

import fs from 'fs';
import path from 'path';

// 运行时路径配置（统一管理 data/logs/uploads）
import { UPLOADS_DIR } from '../config/runtimePaths';

const MAX_AGE = 5 * 60 * 1000; // 5 分钟

/**
 * 清理过期文件
 */
export function cleanupOldFiles(): void {
    if (!fs.existsSync(UPLOADS_DIR)) {
        return;
  }

    const now = Date.now();
    let deletedCount = 0;

    fs.readdir(UPLOADS_DIR, (err, files) => {
        if (err) {
          console.error('[清理] 读取 uploads 目录失败:', err.message);
          return;
        }

    files.forEach(file => {
          const filePath = path.join(UPLOADS_DIR, file);
            fs.stat(filePath, (statErr, stats) => {
                if (statErr) return;

                // 删除超过 5 分钟的文件
                if (now - stats.mtimeMs > MAX_AGE) {
               fs.unlink(filePath, (unlinkErr) => {
              if (!unlinkErr) {
                   deletedCount++;
                       console.log(`[清理] 清理过期文件：${file}`);
                    }
                    });
                }
         });
        });

        if (deletedCount > 0) {
          console.log(`[清理] 本次清理了 ${deletedCount} 个文件`);
        }
    });
}

/**
 * 启动定期清理任务
 * @param intervalMs - 清理间隔（毫秒），默认1小时
 */
export function startCleanupTask(intervalMs: number = 60 * 60 * 1000): void {
    cleanupOldFiles(); // 立即执行一次
    setInterval(cleanupOldFiles, intervalMs);
    console.log('[清理] 定期清理任务已启动（每小时清理 5 分钟前的旧文件）');
}
