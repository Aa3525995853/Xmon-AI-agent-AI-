/**
 * @file conversation_store.js
 * @description 对话存储 - 管理对话记录的持久化存储，
 *              支持对话的保存、读取、列表查询和自动清理
 * @module smart_memory
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** 单用户最大保存对话数量，超过此数量自动清理最旧的对话 */
const MAX_CONVERSATIONS = 100;

// ============================================================
// 核心类：ConversationStore
// 功能说明：提供对话记录的文件系统 CRUD 操作和自动清理机制
// ============================================================

class ConversationStore {

    /**
     * @description 构造函数，初始化最大对话保存数量
     */
    constructor() {
        /** @type {number} 单用户最大保存对话数量 */
        this.maxConversations = MAX_CONVERSATIONS;
    }

    /**
     * @description 保存对话记录到文件系统，保存后自动触发旧对话清理
     * @param {Object} conversation - 对话数据对象
     * @param {string} [conversation.id] - 对话 ID，未提供时使用时间戳
     * @param {string} dir - 对话存储目录的绝对路径
     * @returns {Promise<{success: boolean, filepath?: string, message?: string}>} 保存结果，成功时包含文件路径
     */
    async save(conversation, dir) {
        try {
            // 确保目录存在
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const filename = `${conversation.id || Date.now()}.json`;
            const filepath = path.join(dir, filename);

            const data = {
                ...conversation,
                savedAt: Date.now()
            };

            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');

            // 每次保存后检查并清理旧对话，防止文件无限增长
            this._cleanup(dir);

            return { success: true, filepath };

        } catch (error) {
            logger.error('[对话存储] 保存失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 读取指定 ID 的对话记录
     * @param {string} conversationId - 对话 ID
     * @param {string} dir - 对话存储目录的绝对路径
     * @returns {Promise<{success: boolean, data?: Object, message?: string}>} 对话数据
     */
    async get(conversationId, dir) {
        try {
            const filename = `${conversationId}.json`;
            const filepath = path.join(dir, filename);

            if (!fs.existsSync(filepath)) {
                return { success: false, message: '对话不存在' };
            }

            const content = fs.readFileSync(filepath, 'utf-8');
            return { success: true, data: JSON.parse(content) };

        } catch (error) {
            logger.error('[对话存储] 读取失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 列出指定目录下的对话记录摘要，按时间倒序排列
     * @param {string} dir - 对话存储目录的绝对路径
     * @param {number} [limit=50] - 返回的最大对话数量
     * @returns {Promise<{success: boolean, conversations?: Array<{id: string, title: string, savedAt: number, messageCount: number}>, message?: string}>} 对话摘要列表
     */
    async list(dir, limit = 50) {
        try {
            if (!fs.existsSync(dir)) {
                return { success: true, conversations: [] };
            }

            // 按文件名排序（即按时间戳排序），倒序取最新对话
            const files = fs.readdirSync(dir)
                .filter(f => f.endsWith('.json'))
                .sort()
                .reverse()
                .slice(0, limit);

            const conversations = files.map(f => {
                const filepath = path.join(dir, f);
                const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
                return {
                    id: data.id,
                    title: data.title || '未命名对话',
                    savedAt: data.savedAt,
                    messageCount: data.messages?.length || 0
                };
            });

            return { success: true, conversations };

        } catch (error) {
            logger.error('[对话存储] 列表失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 清理超出数量限制的旧对话文件，按修改时间排序删除最旧的
     * @param {string} dir - 对话存储目录的绝对路径
     * @returns {void}
     * @private
     */
    _cleanup(dir) {
        try {
            if (!fs.existsSync(dir)) return;

            // 按修改时间降序排列，保留最新的对话
            const files = fs.readdirSync(dir)
                .filter(f => f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    mtime: fs.statSync(path.join(dir, f)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);

            // 删除超过限制的旧文件，避免磁盘空间无限增长
            if (files.length > this.maxConversations) {
                const toDelete = files.slice(this.maxConversations);
                for (const file of toDelete) {
                    fs.unlinkSync(path.join(dir, file.name));
                }
            }

        } catch (error) {
            // 清理失败不影响主流程，仅记录警告
            logger.warn('[对话存储] 清理失败:', error);
        }
    }
}

module.exports = new ConversationStore();