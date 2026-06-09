/**
 * @file plugin-loader.js
 * @description 插件加载器，支持JS插件热重载、Skill插件和MCP插件的加载、卸载与执行
 * @module core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 支持：
 * 1. JS 插件：轻量热重载，自动化流程
 * 2. Skill 插件：复杂任务处理专家
 * 3. MCP 插件：开放生态兼容
 *
 * 插件规范：
 * - 每个插件目录包含 manifest.json + index.js
 * - manifest.json 声明：name, version, type, capabilities, dependencies
 * - index.js 导出：activate(deps), deactivate(), execute(params)
 */

const fs = require('fs');
const path = require('path');
const serviceBus = require('./service-bus');

/** 插件目录路径 */
const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');

class PluginLoader {
    /**
     * @description 构造函数，初始化插件和能力的映射
     */
    constructor() {
        this.plugins = new Map();
        this.capabilities = new Map();
        this._watchers = new Map();
    }

    /**
     * @description 初始化插件加载器，加载所有插件并启动文件监控
     */
    async init() {
        if (!fs.existsSync(PLUGINS_DIR)) {
            fs.mkdirSync(PLUGINS_DIR, { recursive: true });
        }

        await this.loadAll();
        this._startWatch();
        console.log(`[PluginLoader] 初始化完成，已加载 ${this.plugins.size} 个插件`);
    }

    // ============================================================
    // 加载：插件加载、卸载和重载
    // ============================================================

    /**
     * @description 加载所有插件目录中的插件
     */
    async loadAll() {
        const dirs = this._getPluginDirs();
        for (const dir of dirs) {
            await this.load(dir);
        }
    }

    /**
     * @description 加载指定目录的插件，读取 manifest.json 并实例化插件
     * @param {string} pluginDir - 插件目录路径
     * @returns {Promise<boolean>} 是否加载成功
     */
    async load(pluginDir) {
        const manifestPath = path.join(pluginDir, 'manifest.json');
        const indexPath = path.join(pluginDir, 'index.js');

        if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) {
            console.warn(`[PluginLoader] 跳过无效插件: ${pluginDir}`);
            return false;
        }

        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

            if (this.plugins.has(manifest.name)) {
                await this.unload(manifest.name);
            }

            delete require.cache[require.resolve(indexPath)];
            const PluginClass = require(indexPath);

            const plugin = {
                manifest,
                instance: new PluginClass(),
                dir: pluginDir,
                status: 'loaded',
                loadedAt: Date.now()
            };

            await plugin.instance.activate({
                serviceBus,
                config: manifest.config || {}
            });

            this.plugins.set(manifest.name, plugin);

            if (manifest.capabilities) {
                for (const cap of manifest.capabilities) {
                    this.capabilities.set(cap, manifest.name);
                }
            }

            serviceBus.publish('plugin:loaded', { name: manifest.name, version: manifest.version });
            console.log(`[PluginLoader] 已加载: ${manifest.name} v${manifest.version} (${manifest.type})`);
            return true;
        } catch (e) {
            console.error(`[PluginLoader] 加载失败 ${pluginDir}:`, e.message);
            serviceBus.publish('plugin:crash', { pluginName: path.basename(pluginDir), error: e.message });
            return false;
        }
    }

    /**
     * @description 卸载指定插件，调用 deactivate 并清理能力映射
     * @param {string} name - 插件名称
     */
    async unload(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) return;

        try {
            if (plugin.instance.deactivate) {
                await plugin.instance.deactivate();
            }
        } catch (e) {
            console.warn(`[PluginLoader] 卸载失败 ${name}:`, e.message);
        }

        if (plugin.manifest.capabilities) {
            for (const cap of plugin.manifest.capabilities) {
                if (this.capabilities.get(cap) === name) {
                    this.capabilities.delete(cap);
                }
            }
        }

        this.plugins.delete(name);
        serviceBus.publish('plugin:unloaded', { name });
    }

    // ============================================================
    // 执行：通过能力标识或插件名调用插件
    // ============================================================

    /**
     * @description 通过能力标识执行插件方法
     * @param {string} capability - 能力标识
     * @param {Object} params - 执行参数
     * @returns {Promise<*>} 插件执行结果
     * @throws {Error} 能力不存在或插件不可用时抛出错误
     */
    async execute(capability, params) {
        const pluginName = this.capabilities.get(capability);
        if (!pluginName) {
            throw new Error(`CAPABILITY_NOT_FOUND: ${capability}`);
        }

        const plugin = this.plugins.get(pluginName);
        if (!plugin || plugin.status !== 'loaded') {
            throw new Error(`PLUGIN_NOT_AVAILABLE: ${pluginName}`);
        }

        try {
            const result = await plugin.instance.execute(capability, params);
            return result;
        } catch (e) {
            plugin.status = 'error';
            serviceBus.emitPluginCrash(pluginName, e);
            throw e;
        }
    }

    /**
     * @description 通过插件名和能力标识执行插件方法
     * @param {string} name - 插件名称
     * @param {string} capability - 能力标识
     * @param {Object} params - 执行参数
     * @returns {Promise<*>} 插件执行结果
     * @throws {Error} 插件不存在时抛出错误
     */
    async executeByName(name, capability, params) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            throw new Error(`PLUGIN_NOT_FOUND: ${name}`);
        }
        return plugin.instance.execute(capability, params);
    }

    // ============================================================
    // 查询：能力检测、插件信息获取
    // ============================================================

    /**
     * @description 检查指定能力是否已注册
     * @param {string} capability - 能力标识
     * @returns {boolean} 是否存在
     */
    hasCapability(capability) {
        return this.capabilities.has(capability);
    }

    /**
     * @description 获取提供指定能力的插件名称
     * @param {string} capability - 能力标识
     * @returns {string|undefined} 插件名称
     */
    getPluginForCapability(capability) {
        return this.capabilities.get(capability);
    }

    /**
     * @description 获取指定插件的完整信息
     * @param {string} name - 插件名称
     * @returns {Object|undefined} 插件信息对象
     */
    getPlugin(name) {
        return this.plugins.get(name);
    }

    /**
     * @description 获取所有已加载插件的摘要信息
     * @returns {Array} 插件摘要列表
     */
    getAllPlugins() {
        return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
            name,
            version: plugin.manifest.version,
            type: plugin.manifest.type,
            status: plugin.status,
            capabilities: plugin.manifest.capabilities || []
        }));
    }

    /**
     * @description 获取所有能力与插件的映射关系
     * @returns {Array} 能力映射列表
     */
    getCapabilities() {
        return Array.from(this.capabilities.entries()).map(([cap, plugin]) => ({
            capability: cap,
            plugin
        }));
    }

    // ============================================================
    // 热重载：监控插件目录变更并自动重载
    // ============================================================

    /**
     * @description 启动插件目录文件监控，检测到变更时自动重载插件
     */
    _startWatch() {
        try {
            if (!fs.existsSync(PLUGINS_DIR)) return;

            fs.watch(PLUGINS_DIR, { recursive: true }, (eventType, filename) => {
                if (!filename) return;

                const pluginDir = path.join(PLUGINS_DIR, filename.split(path.sep)[0]);
                if (fs.existsSync(path.join(pluginDir, 'manifest.json'))) {
                    console.log(`[PluginLoader] 检测到变更: ${filename}`);
                    this.load(pluginDir);
                }
            });
        } catch (e) {
            console.warn('[PluginLoader] 文件监控启动失败:', e.message);
        }
    }

    // ============================================================
    // 私有方法：插件目录扫描
    // ============================================================

    /**
     * @description 扫描插件目录，返回包含 manifest.json 的有效插件目录列表
     * @returns {Array<string>} 插件目录路径数组
     */
    _getPluginDirs() {
        if (!fs.existsSync(PLUGINS_DIR)) return [];

        return fs.readdirSync(PLUGINS_DIR)
            .filter(name => {
                const fullPath = path.join(PLUGINS_DIR, name);
                return fs.statSync(fullPath).isDirectory() &&
                    fs.existsSync(path.join(fullPath, 'manifest.json'));
            })
            .map(name => path.join(PLUGINS_DIR, name));
    }
}

module.exports = new PluginLoader();
