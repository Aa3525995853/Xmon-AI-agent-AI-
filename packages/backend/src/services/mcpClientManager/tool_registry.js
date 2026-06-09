/**
 * @file tool_registry.js
 * @description 工具注册表 - 管理所有 MCP 工具的注册、查询、批量注册和按源过滤功能，
 *              为 MCP 客户端管理器提供统一的工具元数据存储
 * @module services/mcpClientManager
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

class ToolRegistry {
    /**
     * @description 构造函数，初始化工具存储映射
     */
    constructor() {
        /** 工具注册表，键为工具名，值为工具定义对象 */
        this.tools = new Map();
    }

    /**
     * @description 注册单个工具，自动添加注册时间戳
     * @param {string} name - 工具唯一名称
     * @param {Object} tool - 工具定义对象，包含 description、inputSchema、handler 等字段
     * @returns {void}
     */
    register(name, tool) {
        this.tools.set(name, {
            ...tool,
            registeredAt: Date.now()
        });

        logger.debug(`[工具注册表] 注册工具: ${name}`);
    }

    /**
     * @description 获取指定名称的工具定义
     * @param {string} name - 工具名称
     * @returns {Object|undefined} 工具定义对象，不存在则返回 undefined
     */
    getTool(name) {
        return this.tools.get(name);
    }

    /**
     * @description 获取所有已注册工具的列表
     * @returns {Array<Object>} 工具定义对象数组
     */
    getAllTools() {
        return Array.from(this.tools.values());
    }

    /**
     * @description 获取已注册工具的数量
     * @returns {number} 工具数量
     */
    getToolCount() {
        return this.tools.size;
    }

    /**
     * @description 检查指定名称的工具是否已注册
     * @param {string} name - 工具名称
     * @returns {boolean} 是否存在
     */
    hasTool(name) {
        return this.tools.has(name);
    }

    /**
     * @description 批量注册多个工具
     * @param {Object} tools - 工具映射对象，键为工具名，值为工具定义
     * @returns {void}
     */
    registerMany(tools) {
        for (const [name, tool] of Object.entries(tools)) {
            this.register(name, tool);
        }
    }

    /**
     * @description 移除指定名称的工具
     * @param {string} name - 工具名称
     * @returns {boolean} 是否成功移除
     */
    unregister(name) {
        const removed = this.tools.delete(name);
        if (removed) {
            logger.debug(`[工具注册表] 移除工具: ${name}`);
        }
        return removed;
    }

    /**
     * @description 按来源服务器筛选工具
     * @param {string} source - 来源服务器名称
     * @returns {Array<Object>} 属于指定来源的工具列表
     */
    getToolsBySource(source) {
        return this.getAllTools().filter(t => t.source === source);
    }

    /**
     * @description 清空所有已注册的工具
     * @returns {void}
     */
    clear() {
        this.tools.clear();
    }
}

module.exports = new ToolRegistry();