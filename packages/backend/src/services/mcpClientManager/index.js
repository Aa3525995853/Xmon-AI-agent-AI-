/**
 * @file index.js
 * @description MCPClientManager 主入口 - MCP 客户端管理器，使用 @modelcontextprotocol/sdk
 *              管理所有 MCP 服务器连接，支持 Stdio（本地进程）和 Streamable HTTP（远程）两种传输方式
 * @module services/mcpClientManager
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const path = require('path');
const fs = require('fs');
const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块，避免循环依赖
// ============================================================

/** 工具注册表懒加载实例 */
let _toolRegistry = null;
/** 连接管理器懒加载实例 */
let _connectionManager = null;

/**
 * @description 获取工具注册表单例
 * @returns {Object} ToolRegistry 实例
 */
function getToolRegistry() {
    if (!_toolRegistry) _toolRegistry = require('./tool_registry');
    return _toolRegistry;
}

/**
 * @description 获取连接管理器单例
 * @returns {Object} ConnectionManager 实例
 */
function getConnectionManager() {
    if (!_connectionManager) _connectionManager = require('./connection_manager');
    return _connectionManager;
}

// ============================================================
// 常量定义
// ============================================================

/** MCP 配置文件目录 */
const MCP_CONFIG_DIR = path.join(__dirname, '..', '..', 'data', 'mcp');

/** MCP 服务器配置文件路径 */
const MCP_SERVERS_FILE = path.join(MCP_CONFIG_DIR, 'servers.json');

/** 重连间隔时间（毫秒），30秒 */
const RECONNECT_INTERVAL = 30000;

/** 工具调用超时时间（毫秒），60秒 */
const TOOL_CALL_TIMEOUT = 60000;

class McpClientManager {
    /**
     * @description 构造函数，初始化客户端管理器、统计信息和嵌入式工具
     */
    constructor() {
        /** MCP 客户端实例映射，键为服务器名 */
        this._clients = new Map();
        /** 传输层实例映射，键为服务器名 */
        this._transports = new Map();
        /** 服务器配置映射，键为服务器名 */
        this._serverConfigs = new Map();
        /** 重连定时器映射 */
        this._reconnectTimers = new Map();

        /** 工具注册表实例 */
        this.toolRegistry = getToolRegistry();
        /** 连接管理器实例 */
        this.connectionManager = getConnectionManager();

        /** 运行时统计数据 */
        this._stats = {
            serversConnected: 0,
            serversFailed: 0,
            toolsDiscovered: 0,
            toolCalls: 0,
            toolCallErrors: 0
        };

        /** 是否已初始化 */
        this._initialized = false;
        this._registerEmbeddedTools();

        logger.info('[MCP] MCP 客户端管理器初始化完成');
    }

    /**
     * @description 注册内置的嵌入式工具（web_search、file_read），
     *              这些工具不依赖外部 MCP 服务器
     * @returns {void}
     */
    _registerEmbeddedTools() {
        this.toolRegistry.register('web_search', {
            description: '搜索网络获取信息',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    limit: { type: 'number' }
                },
                required: ['query']
            }
        });

        this.toolRegistry.register('file_read', {
            description: '读取文件内容',
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string' }
                },
                required: ['path']
            }
        });
    }

    /**
     * @description 初始化管理器，加载服务器配置并连接所有服务器
     * @returns {Promise<void>}
     * @throws {Error} 初始化失败时抛出异常
     */
    async initialize() {
        if (this._initialized) return;

        try {
            // 加载服务器配置
            await this._loadServerConfigs();

            // 连接所有服务器
            await this._connectAllServers();

            this._initialized = true;
            logger.info('[MCP] 初始化完成');

        } catch (error) {
            logger.error('[MCP] 初始化失败:', error);
            throw error;
        }
    }

    /**
     * @description 从配置文件加载 MCP 服务器配置，支持数组和对象两种格式
     * @returns {Promise<void>}
     */
    async _loadServerConfigs() {
        if (!fs.existsSync(MCP_CONFIG_DIR)) {
            fs.mkdirSync(MCP_CONFIG_DIR, { recursive: true });
        }

        if (fs.existsSync(MCP_SERVERS_FILE)) {
            const content = fs.readFileSync(MCP_SERVERS_FILE, 'utf8');
            let configs = JSON.parse(content);

            if (Array.isArray(configs)) {
                // 数组格式配置，跳过 enabled:false 的项
                for (const config of configs) {
                    if (config.enabled === false) continue;
                    this._serverConfigs.set(config.id || config.name, config);
                }
            } else {
                // 对象格式配置
                for (const [name, config] of Object.entries(configs)) {
                    this._serverConfigs.set(name, config);
                }
            }
        }
    }

    /**
     * @description 并发连接所有已配置的 MCP 服务器
     * @returns {Promise<void>}
     */
    async _connectAllServers() {
        const promises = [];

        for (const [name, config] of this._serverConfigs) {
            promises.push(this.connectServer(name, config));
        }

        // 使用 allSettled 确保单个服务器失败不影响其他服务器
        await Promise.allSettled(promises);
    }

    /**
     * @description 连接指定的 MCP 服务器，根据传输类型创建对应的传输层，
     *              连接成功后自动发现并注册该服务器的工具
     * @param {string} name - 服务器名称
     * @param {Object} config - 服务器配置
     * @param {string} config.type - 传输类型（stdio/http/streamable-http）
     * @param {string} [config.command] - Stdio 模式的命令
     * @param {string} [config.url] - HTTP 模式的 URL
     * @returns {Promise<void>}
     */
    async connectServer(name, config) {
        try {
            const client = new Client({
                name: `xiaomeng-${name}`,
                version: '1.0.0'
            });

            let transport;
            const transportType = config.type || config.transport;

            if (transportType === 'stdio') {
                transport = new StdioClientTransport({
                    command: config.command,
                    args: config.args || [],
                    env: config.env
                });
            } else if (transportType === 'http' || transportType === 'streamable-http') {
                transport = new StreamableHTTPClientTransport({
                    url: config.url
                });
            } else {
                throw new Error(`未知的传输类型: ${transportType}`);
            }

            await client.connect(transport);

            this._clients.set(name, client);
            this._transports.set(name, transport);

            // 发现并注册服务器提供的工具，工具名加服务器名前缀避免冲突
            const toolsResult = await client.listTools();
            const tools = toolsResult.tools || toolsResult;
            for (const tool of tools) {
                this.toolRegistry.register(`${name}_${tool.name}`, {
                    ...tool,
                    source: name
                });
            }

            this._stats.serversConnected++;
            logger.info(`[MCP] 服务器连接成功: ${name}, 发现 ${tools.length} 个工具`);

        } catch (error) {
            this._stats.serversFailed++;
            logger.error(`[MCP] 服务器连接失败: ${name}`, error);
        }
    }

    /**
     * @description 获取所有工具的 LLM 可用格式列表
     * @returns {Promise<Array<{name: string, description: string, inputSchema: Object}>>} 工具列表
     */
    async getToolsForLLM() {
        const tools = this.toolRegistry.getAllTools();

        return tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
        }));
    }

    /**
     * @description 调用指定工具，优先使用嵌入式工具的 handler，否则路由到对应 MCP 服务器
     * @param {string} toolName - 工具名称（嵌入式工具直接用名称，MCP 工具用 服务器名_工具名 格式）
     * @param {Object} params - 工具调用参数
     * @returns {Promise<any>} 工具调用结果
     * @throws {Error} 工具不存在或调用失败时抛出异常
     */
    async callTool(toolName, params) {
        this._stats.toolCalls++;

        try {
            // 从注册表获取工具信息
            const tool = this.toolRegistry.getTool(toolName);

            if (!tool) {
                throw new Error(`工具不存在: ${toolName}`);
            }

            // 调用嵌入式工具（有 handler 的工具）
            if (tool.handler) {
                return await tool.handler(params);
            }

            // 调用 MCP 服务器工具：从工具名中拆分出服务器名和实际工具名
            const [serverName, ...rest] = toolName.split('_');
            const actualToolName = rest.join('_');
            const client = this._clients.get(serverName);

            if (!client) {
                throw new Error(`服务器未连接: ${serverName}`);
            }

            const result = await client.callTool({
                name: actualToolName,
                arguments: params
            }, { timeout: TOOL_CALL_TIMEOUT });

            return result;

        } catch (error) {
            this._stats.toolCallErrors++;
            logger.error(`[MCP] 工具调用失败: ${toolName}`, error);
            throw error;
        }
    }

    /**
     * @description 获取管理器运行时统计数据
     * @returns {Object} 统计信息，包含连接数、工具数、调用次数等
     */
    getStats() {
        return {
            ...this._stats,
            toolsDiscovered: this.toolRegistry.getToolCount(),
            activeServers: this._clients.size
        };
    }

    /**
     * @description 断开所有 MCP 服务器连接并重置状态
     * @returns {Promise<void>}
     */
    async disconnect() {
        for (const [name, client] of this._clients) {
            try {
                await client.close();
            } catch (error) {
                logger.warn(`[MCP] 断开服务器失败: ${name}`);
            }
        }

        this._clients.clear();
        this._transports.clear();
        this._stats.serversConnected = 0;

        logger.info('[MCP] 所有连接已断开');
    }
}

module.exports = McpClientManager;