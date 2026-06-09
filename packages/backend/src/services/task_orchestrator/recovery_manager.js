/**
 * @file recovery_manager.js
 * @description 恢复管理器 - 任务状态恢复和快照管理，支持内存和磁盘双存储
 * @module services/task_orchestrator
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/** 快照过期时间（毫秒）- 30分钟 */
const SNAPSHOT_MAX_AGE = 30 * 60 * 1000;

class RecoveryManager {
    constructor() {
        this._taskSnapshot = new Map();
        this._lastWrittenContent = '';
        this.dataDir = path.join(__dirname, '..', '..', 'data');

        // 确保数据目录存在
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /**
     * @description 保存任务快照到内存和磁盘
     * @param {string} taskId - 任务ID
     * @param {Object} context - 任务上下文
     * @returns {Promise<void>}
     */
    async saveSnapshot(taskId, context) {
        this._taskSnapshot.set(taskId, {
            timestamp: Date.now(),
            context,
            stepIndex: context.stepIndex || 0
        });

        // 同时保存到磁盘
        this._saveSnapshotToDisk(taskId, context);
    }

    /**
     * @description 保存快照到磁盘文件
     * @param {string} taskId - 任务ID
     * @param {Object} context - 任务上下文
     * @returns {void}
     */
    _saveSnapshotToDisk(taskId, context) {
        const snapshotFile = path.join(this.dataDir, `task_snapshot_${taskId}.json`);
        try {
            fs.writeFileSync(snapshotFile, JSON.stringify({
                taskId,
                timestamp: Date.now(),
                context
            }, null, 2), 'utf-8');
        } catch (e) {
            console.error(`[RecoveryManager] 保存快照失败: ${e.message}`);
        }
    }

    /**
     * @description 恢复任务 - 先查内存，再查磁盘，过期快照不可恢复
     * @param {string} taskId - 任务ID
     * @returns {Promise<Object>} 恢复结果，包含 restored、context、source
     */
    async restoreTask(taskId) {
        // 先检查内存
        const snapshot = this._taskSnapshot.get(taskId);
        if (snapshot) {
            const age = Date.now() - snapshot.timestamp;
            if (age < SNAPSHOT_MAX_AGE) {
                return { restored: true, context: snapshot.context, source: 'memory' };
            }
        }

        // 检查磁盘
        return this._restoreFromDisk(taskId);
    }

    /**
     * @description 从磁盘恢复任务快照
     * @param {string} taskId - 任务ID
     * @returns {Object} 恢复结果
     */
    _restoreFromDisk(taskId) {
        const snapshotFile = path.join(this.dataDir, `task_snapshot_${taskId}.json`);
        if (!fs.existsSync(snapshotFile)) {
            return { error: `未找到任务快照: ${taskId}` };
        }

        try {
            const content = fs.readFileSync(snapshotFile, 'utf-8');
            const snapshot = JSON.parse(content);

            // 检查是否过期
            const age = Date.now() - snapshot.timestamp;
            if (age > SNAPSHOT_MAX_AGE) {
                fs.unlinkSync(snapshotFile);
                return { error: '快照已过期', expired: true };
            }

            this._taskSnapshot.set(taskId, {
                timestamp: snapshot.timestamp,
                context: snapshot.context
            });

            return { restored: true, context: snapshot.context, source: 'disk' };
        } catch (e) {
            return { error: `恢复失败: ${e.message}` };
        }
    }

    /**
     * @description 清理过期的快照（内存和磁盘）
     * @returns {Promise<void>}
     */
    async cleanupOldSnapshots() {
        const now = Date.now();
        const maxAge = SNAPSHOT_MAX_AGE;

        // 清理内存中的旧快照
        for (const [taskId, snapshot] of this._taskSnapshot.entries()) {
            if (now - snapshot.timestamp > maxAge) {
                this._taskSnapshot.delete(taskId);
            }
        }

        // 清理磁盘上的旧快照
        if (fs.existsSync(this.dataDir)) {
            const files = fs.readdirSync(this.dataDir).filter(f => f.startsWith('task_snapshot_'));
            for (const file of files) {
                const filePath = path.join(this.dataDir, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (now - stat.mtimeMs > maxAge) {
                        fs.unlinkSync(filePath);
                    }
                } catch (e) {
                    // 忽略
                }
            }
        }
    }

    /**
     * @description 验证上次写入的内容是否与期望一致
     * @param {string} expectedContent - 期望的内容
     * @returns {boolean} 是否一致
     */
    verifyLastWrite(expectedContent) {
        return this._lastWrittenContent === expectedContent;
    }

    /**
     * @description 记录写入内容，用于后续验证
     * @param {string} content - 写入的内容
     * @returns {void}
     */
    recordWrite(content) {
        this._lastWrittenContent = content;
    }

    /**
     * @description 清除指定任务的快照（内存和磁盘）
     * @param {string} taskId - 任务ID
     * @returns {void}
     */
    clearTask(taskId) {
        this._taskSnapshot.delete(taskId);
        const snapshotFile = path.join(this.dataDir, `task_snapshot_${taskId}.json`);
        if (fs.existsSync(snapshotFile)) {
            try {
                fs.unlinkSync(snapshotFile);
            } catch (e) {
                // 忽略
            }
        }
    }
}

module.exports = new RecoveryManager();