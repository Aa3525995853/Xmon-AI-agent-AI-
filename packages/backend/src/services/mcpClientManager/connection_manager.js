/**
 * @file connection_manager.js
 * @description 连接管理器 - 管理 MCP 服务器连接的生命周期，包括连接添加、状态更新、
 *              断开连接、重连定时器管理和全局连接状态查询
 * @module services/mcpClientManager
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** 重连间隔时间（毫秒），30秒 */
const RECONNECT_INTERVAL = 30000;

class ConnectionManager {
    /**
     * @description 构造函数，初始化连接存储和重连定时器
     */
    constructor() {
        /** 连接存储映射，键为服务器名，值为连接信息对象 */
        this.connections = new Map();
        /** 重连定时器映射，键为服务器名，值为定时器ID */
        this.reconnectTimers = new Map();
    }

    /**
     * @description 添加新的服务器连接记录
     * @param {string} name - 服务器名称
     * @param {Object} client - MCP 客户端实例
     * @param {Object} transport - 传输层实例
     * @returns {void}
     */
    add(name, client, transport) {
        this.connections.set(name, {
            client,
            transport,
            status: 'connected',
            connectedAt: Date.now(),
            lastActivity: Date.now()
        });
    }

    /**
     * @description 获取指定服务器的连接信息
     * @param {string} name - 服务器名称
     * @returns {Object|undefined} 连接信息对象
     */
    get(name) {
        return this.connections.get(name);
    }

    /**
     * @description 更新指定服务器的连接状态和最后活动时间
     * @param {string} name - 服务器名称
     * @param {string} status - 新状态（connected/disconnected/error）
     * @returns {void}
     */
    updateStatus(name, status) {
        const conn = this.connections.get(name);
        if (conn) {
            conn.status = status;
            conn.lastActivity = Date.now();
        }
    }

    /**
     * @description 检查指定服务器是否处于连接状态
     * @param {string} name - 服务器名称
     * @returns {boolean} 是否已连接
     */
    isConnected(name) {
        const conn = this.connections.get(name);
        return conn && conn.status === 'connected';
    }

    /**
     * @description 断开指定服务器的连接，清理重连定时器
     * @param {string} name - 服务器名称
     * @returns {Promise<void>}
     */
    async disconnect(name) {
        const conn = this.connections.get(name);

        if (conn) {
            try {
                await conn.client.close();
            } catch (error) {
                logger.warn(`[连接管理] 断开失败: ${name}`);
            }

            this.connections.delete(name);
        }

        // 清除重连定时器，防止断开后继续尝试重连
        if (this.reconnectTimers.has(name)) {
            clearInterval(this.reconnectTimers.get(name));
            this.reconnectTimers.delete(name);
        }
    }

    /**
     * @description 断开所有服务器连接
     * @returns {Promise<void>}
     */
    async disconnectAll() {
        const names = Array.from(this.connections.keys());

        for (const name of names) {
            await this.disconnect(name);
        }
    }

    /**
     * @description 获取所有服务器的连接状态摘要
     * @returns {Object} 连接状态映射，键为服务器名，值为状态信息
     */
    getAllStatuses() {
        const statuses = {};

        for (const [name, conn] of this.connections) {
            statuses[name] = {
                status: conn.status,
                connectedAt: conn.connectedAt,
                lastActivity: conn.lastActivity
            };
        }

        return statuses;
    }
}

module.exports = new ConnectionManager();