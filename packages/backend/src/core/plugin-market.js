/**
 * @file 插件市场
 * @description 管理插件的注册、搜索、安装、卸载和版本更新
 *              支持官方插件和社区插件，提供依赖解析和安全审核
 * @module core/plugin-market
 * @version 1.0.0
 * @date 2026-06-06
 */

const fs = require('fs');
const path = require('path');
const serviceBus = require('./service-bus');
const pluginLoader = require('./plugin-loader');
const sandbox = require('./sandbox');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 常量定义
// ============================================================

/** 插件市场目录 */
const MARKET_DIR = dataPath('market');
/** 插件注册表文件路径 */
const REGISTRY_FILE = path.join(MARKET_DIR, 'registry.json');
/** 已安装插件记录文件路径 */
const INSTALLED_FILE = path.join(MARKET_DIR, 'installed.json');

// ============================================================
// 内置插件定义
// ============================================================

/** 内置插件列表 */
const BUILTIN_PLUGINS = [
    {
        id: 'news',
        name: '新闻搜索',
        version: '1.0.0',
        type: 'js',
        description: '智能新闻搜索，支持多源聚合、摘要提取、IP定位',
        capabilities: ['news:search'],
        tags: ['新闻', '搜索', '资讯'],
        author: '小梦官方',
        official: true,
        size: '12KB',
        dependencies: []
    },
    {
        id: 'weather',
        name: '天气查询',
        version: '1.0.0',
        type: 'js',
        description: '实时天气查询，支持城市定位和未来预报',
        capabilities: ['weather:query'],
        tags: ['天气', '查询', '生活'],
        author: '小梦官方',
        official: true,
        size: '8KB',
        dependencies: []
    },
    {
        id: 'system',
        name: '系统控制',
        version: '1.0.0',
        type: 'js',
        description: '打开应用、播放音乐、搜索网页等系统能力',
        capabilities: ['system:launch_app', 'system:play_music', 'system:search_web', 'system:open_url'],
        tags: ['系统', '控制', '应用'],
        author: '小梦官方',
        official: true,
        size: '15KB',
        dependencies: []
    },
    {
        id: 'browser',
        name: '浏览器自动化',
        version: '1.0.0',
        type: 'js',
        description: '基于 Playwright 的浏览器自动化操作',
        capabilities: ['browser:execute'],
        tags: ['浏览器', '自动化', '爬虫'],
        author: '小梦官方',
        official: true,
        size: '20KB',
        dependencies: []
    },
    {
        id: 'llm',
        name: 'LLM 推理',
        version: '1.0.0',
        type: 'js',
        description: '大模型推理能力，支持对话和复杂任务',
        capabilities: ['llm:chat', 'llm:complex_task'],
        tags: ['LLM', '推理', '对话'],
        author: '小梦官方',
        official: true,
        size: '10KB',
        dependencies: []
    }
];

const COMMUNITY_PLUGINS = [
    {
        id: 'calendar',
        name: '日历管理',
        version: '0.1.0',
        type: 'js',
        description: '日程管理、提醒设置、日历查询',
        capabilities: ['calendar:schedule', 'calendar:remind', 'calendar:query'],
        tags: ['日历', '日程', '提醒'],
        author: '社区',
        official: false,
        size: '6KB',
        dependencies: [],
        status: 'available'
    },
    {
        id: 'translator',
        name: '翻译助手',
        version: '0.1.0',
        type: 'js',
        description: '多语言翻译，支持中英日韩等语言',
        capabilities: ['translator:translate', 'translator:detect'],
        tags: ['翻译', '语言', '多语言'],
        author: '社区',
        official: false,
        size: '8KB',
        dependencies: [],
        status: 'available'
    },
    {
        id: 'code',
        name: '代码助手',
        version: '0.1.0',
        type: 'js',
        description: '代码生成、调试、重构、解释',
        capabilities: ['code:generate', 'code:debug', 'code:explain'],
        tags: ['代码', '编程', '开发'],
        author: '社区',
        official: false,
        size: '10KB',
        dependencies: ['llm'],
        status: 'available'
    },
    {
        id: 'file-manager',
        name: '文件管理',
        version: '0.1.0',
        type: 'js',
        description: '文件读写、目录管理、批量操作',
        capabilities: ['file:read', 'file:write', 'file:list', 'file:organize'],
        tags: ['文件', '管理', '文档'],
        author: '社区',
        official: false,
        size: '7KB',
        dependencies: [],
        status: 'available'
    },
    {
        id: 'email',
        name: '邮件助手',
        version: '0.1.0',
        type: 'js',
        description: '发送邮件、收取邮件、邮件摘要',
        capabilities: ['email:send', 'email:read', 'email:summarize'],
        tags: ['邮件', '通信', '办公'],
        author: '社区',
        official: false,
        size: '9KB',
        dependencies: [],
        status: 'available'
    }
];

class PluginMarket {
    constructor() {
        this._registry = [];
        this._installed = {};
        this._stats = { searched: 0, installed: 0, uninstalled: 0, updated: 0 };
    }

    init() {
        this._ensureDirs();
        this._loadRegistry();
        this._loadInstalled();
        this._syncWithLoader();
        console.log(`[PluginMarket] 初始化完成，注册 ${this._registry.length} 个插件，已安装 ${Object.keys(this._installed).length} 个`);
    }

    /**
     * 确保市场目录存在
     * @private
     */
    _ensureDirs() {
        ensureDir(MARKET_DIR);
    }

    _loadRegistry() {
        try {
            if (fs.existsSync(REGISTRY_FILE)) {
                this._registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
            } else {
                this._registry = [...BUILTIN_PLUGINS, ...COMMUNITY_PLUGINS];
                this._saveRegistry();
            }
        } catch (_) {
            this._registry = [...BUILTIN_PLUGINS, ...COMMUNITY_PLUGINS];
        }
    }

    _loadInstalled() {
        try {
            if (fs.existsSync(INSTALLED_FILE)) {
                this._installed = JSON.parse(fs.readFileSync(INSTALLED_FILE, 'utf8'));
            } else {
                this._installed = {};
                for (const plugin of BUILTIN_PLUGINS) {
                    this._installed[plugin.id] = {
                        version: plugin.version,
                        installedAt: Date.now(),
                        official: true
                    };
                }
                this._saveInstalled();
            }
        } catch (_) {
            this._installed = {};
        }
    }

    _syncWithLoader() {
        const loadedPlugins = pluginLoader.getAllPlugins();
        for (const plugin of loadedPlugins) {
            if (!this._installed[plugin.name]) {
                this._installed[plugin.name] = {
                    version: plugin.version,
                    installedAt: Date.now(),
                    official: true
                };
            }
        }
    }

    _saveRegistry() {
        try {
            fs.writeFileSync(REGISTRY_FILE, JSON.stringify(this._registry, null, 2), 'utf8');
        } catch (_) {}
    }

    _saveInstalled() {
        try {
            fs.writeFileSync(INSTALLED_FILE, JSON.stringify(this._installed, null, 2), 'utf8');
        } catch (_) {}
    }

    search(query = '', options = {}) {
        this._stats.searched++;
        const results = [];
        const q = query.toLowerCase().trim();

        for (const plugin of this._registry) {
            let score = 0;

            if (!q) {
                score = 1;
            } else {
                if (plugin.name.toLowerCase().includes(q)) score += 10;
                if (plugin.id.toLowerCase().includes(q)) score += 8;
                if (plugin.description.toLowerCase().includes(q)) score += 5;
                for (const tag of plugin.tags) {
                    if (tag.toLowerCase().includes(q)) score += 3;
                }
                for (const cap of plugin.capabilities) {
                    if (cap.toLowerCase().includes(q)) score += 4;
                }
            }

            if (options.capability) {
                if (plugin.capabilities.some(c => c.startsWith(options.capability))) score += 20;
            }

            if (options.tags && options.tags.length > 0) {
                for (const tag of options.tags) {
                    if (plugin.tags.includes(tag)) score += 5;
                }
            }

            if (options.officialOnly && !plugin.official) score = 0;

            if (score > 0) {
                results.push({
                    ...plugin,
                    score,
                    installed: !!this._installed[plugin.id]
                });
            }
        }

        results.sort((a, b) => b.score - a.score);

        serviceBus.publish('market:searched', { query, results: results.length });
        return results;
    }

    async install(pluginId) {
        const pluginMeta = this._registry.find(p => p.id === pluginId);
        if (!pluginMeta) {
            return { success: false, error: `PLUGIN_NOT_FOUND: ${pluginId}` };
        }

        if (this._installed[pluginId]) {
            return { success: false, error: `ALREADY_INSTALLED: ${pluginId}` };
        }

        if (pluginMeta.dependencies && pluginMeta.dependencies.length > 0) {
            for (const dep of pluginMeta.dependencies) {
                if (!this._installed[dep]) {
                    const depResult = await this.install(dep);
                    if (!depResult.success) {
                        return { success: false, error: `DEPENDENCY_FAILED: ${dep} - ${depResult.error}` };
                    }
                }
            }
        }

        const securityCheck = this._securityAudit(pluginMeta);
        if (!securityCheck.pass) {
            return { success: false, error: `SECURITY_AUDIT_FAILED: ${securityCheck.reason}` };
        }

        try {
            const pluginDir = path.join(__dirname, '..', 'plugins', pluginId);
            if (!fs.existsSync(pluginDir)) {
                this._createPluginScaffold(pluginId, pluginMeta);
            }

            await pluginLoader.load(pluginDir);

            this._installed[pluginId] = {
                version: pluginMeta.version,
                installedAt: Date.now(),
                official: pluginMeta.official || false
            };
            this._saveInstalled();
            this._stats.installed++;

            serviceBus.publish('market:installed', { pluginId, version: pluginMeta.version });
            console.log(`[PluginMarket] 已安装: ${pluginId} v${pluginMeta.version}`);

            return { success: true, pluginId, version: pluginMeta.version };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async uninstall(pluginId) {
        if (!this._installed[pluginId]) {
            return { success: false, error: `NOT_INSTALLED: ${pluginId}` };
        }

        const dependents = this._findDependents(pluginId);
        if (dependents.length > 0) {
            return {
                success: false,
                error: `HAS_DEPENDENTS: ${pluginId} 被以下插件依赖: ${dependents.join(', ')}`,
                dependents
            };
        }

        try {
            await pluginLoader.unload(pluginId);

            delete this._installed[pluginId];
            this._saveInstalled();
            this._stats.uninstalled++;

            serviceBus.publish('market:uninstalled', { pluginId });
            console.log(`[PluginMarket] 已卸载: ${pluginId}`);

            return { success: true, pluginId };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    getInstalled() {
        const result = [];
        for (const [id, info] of Object.entries(this._installed)) {
            const meta = this._registry.find(p => p.id === id);
            result.push({
                id,
                name: meta ? meta.name : id,
                version: info.version,
                installedAt: info.installedAt,
                official: info.official,
                capabilities: meta ? meta.capabilities : [],
                description: meta ? meta.description : ''
            });
        }
        return result;
    }

    getAvailable() {
        return this._registry
            .filter(p => !this._installed[p.id])
            .map(p => ({ ...p, installed: false }));
    }

    getUpdates() {
        const updates = [];
        for (const [id, info] of Object.entries(this._installed)) {
            const meta = this._registry.find(p => p.id === id);
            if (meta && meta.version !== info.version) {
                updates.push({
                    id,
                    currentVersion: info.version,
                    newVersion: meta.version,
                    name: meta.name
                });
            }
        }
        return updates;
    }

    getPluginDetail(pluginId) {
        const meta = this._registry.find(p => p.id === pluginId);
        if (!meta) return null;

        return {
            ...meta,
            installed: !!this._installed[pluginId],
            installedVersion: this._installed[pluginId]?.version || null,
            installedAt: this._installed[pluginId]?.installedAt || null
        };
    }

    _securityAudit(pluginMeta) {
        if (pluginMeta.official) {
            return { pass: true };
        }

        if (pluginMeta.capabilities.some(c => c.startsWith('system:command') || c.startsWith('system:registry'))) {
            return { pass: false, reason: '非官方插件不允许申请系统命令能力' };
        }

        if (pluginMeta.capabilities.some(c => c.startsWith('file:delete'))) {
            return { pass: false, reason: '非官方插件不允许申请文件删除能力' };
        }

        return { pass: true };
    }

    _findDependents(pluginId) {
        const dependents = [];
        for (const [id, info] of Object.entries(this._installed)) {
            const meta = this._registry.find(p => p.id === id);
            if (meta && meta.dependencies && meta.dependencies.includes(pluginId)) {
                dependents.push(id);
            }
        }
        return dependents;
    }

    _createPluginScaffold(pluginId, meta) {
        const pluginDir = path.join(__dirname, '..', 'plugins', pluginId);
        if (!fs.existsSync(pluginDir)) {
            fs.mkdirSync(pluginDir, { recursive: true });
        }

        const manifest = {
            name: meta.id,
            version: meta.version,
            type: meta.type,
            description: meta.description,
            capabilities: meta.capabilities,
            dependencies: meta.dependencies || [],
            config: {}
        };
        fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

        const indexContent = `class ${this._toClassName(pluginId)}Plugin {
    activate(deps) {
        this.serviceBus = deps.serviceBus;
    }

    deactivate() {}

    async execute(capability, params) {
        switch (capability) {
${meta.capabilities.map(cap => `            case '${cap}':
                return { success: true, capability: '${cap}', params };`).join('\n')}
            default:
                throw new Error('Unknown capability: ' + capability);
        }
    }
}

module.exports = ${this._toClassName(pluginId)}Plugin;
`;
        fs.writeFileSync(path.join(pluginDir, 'index.js'), indexContent, 'utf8');
    }

    _toClassName(id) {
        return id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    }

    getStats() {
        return {
            ...this._stats,
            registrySize: this._registry.length,
            installedCount: Object.keys(this._installed).length,
            availableCount: this.getAvailable().length,
            updatesCount: this.getUpdates().length
        };
    }
}

module.exports = new PluginMarket();
