/**
 * @file capability-detector.js
 * @description 能力缺口检测器，自动检测缺失能力并从插件市场匹配安装
 * @module core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心能力：
 * 1. 意图→能力映射：分析用户意图需要哪些能力
 * 2. 缺口检测：对比已有能力和需求能力，发现缺口
 * 3. 自动匹配：从插件市场搜索匹配的插件
 * 4. 自动接入：安装插件后自动注册能力，无需重启
 * 5. 学习优化：记录能力使用频率，优化匹配排序
 *
 * 流程：识别缺口 → 匹配插件 → 自动接入 → 立即可用
 */

const serviceBus = require('./service-bus');
const pluginLoader = require('./plugin-loader');
const pluginMarket = require('./plugin-market');

/** 意图到能力的映射表，定义每个意图的关键词和优先级 */
const INTENT_CAPABILITY_MAP = {
    'news:search': { keywords: ['新闻', '资讯', '热点', '头条'], priority: 8 },
    'weather:query': { keywords: ['天气', '气温', '温度', '下雨'], priority: 8 },
    'system:launch_app': { keywords: ['打开', '启动', '运行'], priority: 7 },
    'system:play_music': { keywords: ['播放', '听歌', '音乐'], priority: 7 },
    'system:search_web': { keywords: ['搜索', '搜一下', '查一下'], priority: 7 },
    'system:open_url': { keywords: ['打开网址', '访问'], priority: 6 },
    'browser:execute': { keywords: ['浏览', '抓取', '截图'], priority: 6 },
    'llm:complex_task': { keywords: ['写', '做', '生成', '创建', '分析'], priority: 5 },
    'llm:chat': { keywords: [], priority: 1 },
    'calendar:schedule': { keywords: ['日程', '安排', '提醒', '日历'], priority: 4 },
    'calendar:remind': { keywords: ['提醒我', '别忘了', '记得'], priority: 4 },
    'translator:translate': { keywords: ['翻译', 'translate'], priority: 5 },
    'translator:detect': { keywords: ['什么语言', '哪国语言'], priority: 3 },
    'code:generate': { keywords: ['写代码', '编程', '代码'], priority: 5 },
    'code:debug': { keywords: ['debug', '调试', '报错'], priority: 5 },
    'code:explain': { keywords: ['解释代码', '代码什么意思'], priority: 4 },
    'file:read': { keywords: ['读取文件', '打开文件'], priority: 4 },
    'file:write': { keywords: ['写文件', '保存文件'], priority: 4 },
    'file:list': { keywords: ['列出文件', '目录'], priority: 3 },
    'email:send': { keywords: ['发邮件', '发送邮件'], priority: 4 },
    'email:read': { keywords: ['收邮件', '查看邮件'], priority: 4 }
};

/** 缺口历史最大保留数量 */
const MAX_GAP_HISTORY = 100;

class CapabilityDetector {
    /**
     * @description 构造函数，初始化能力使用统计和缺口历史
     */
    constructor() {
        this._capabilityUsage = new Map();
        this._gapHistory = [];
        this._autoInstallEnabled = true;
        this._stats = { gapsDetected: 0, pluginsMatched: 0, autoInstalled: 0, autoInstallFailed: 0 };
    }

    /**
     * @description 初始化能力检测器，订阅任务失败和插件崩溃事件
     */
    init() {
        serviceBus.subscribe('task:fail', (data) => {
            if (data.error && data.error.includes('CAPABILITY_NOT_FOUND')) {
                this._onCapabilityMissing(data);
            }
        });

        serviceBus.subscribe('plugin:crash', (data) => {
            this._onPluginCrash(data);
        });

        console.log('[CapabilityDetector] 初始化完成');
    }

    /**
     * @description 检测用户输入中缺失的能力
     * @param {string} userInput - 用户输入文本
     * @returns {Array} 缺失能力列表，按优先级排序
     */
    detectGap(userInput) {
        const text = userInput.toLowerCase();
        const neededCapabilities = [];
        const availableCapabilities = this._getAvailableCapabilities();

        for (const [capability, info] of Object.entries(INTENT_CAPABILITY_MAP)) {
            const isNeeded = info.keywords.some(kw => text.includes(kw));
            if (isNeeded) {
                neededCapabilities.push({
                    capability,
                    priority: info.priority,
                    available: availableCapabilities.has(capability)
                });
            }
        }

        const gaps = neededCapabilities
            .filter(c => !c.available)
            .sort((a, b) => b.priority - a.priority);

        if (gaps.length > 0) {
            this._stats.gapsDetected++;
            this._gapHistory.push({
                input: userInput,
                gaps: gaps.map(g => g.capability),
                timestamp: Date.now()
            });

            if (this._gapHistory.length > MAX_GAP_HISTORY) {
                this._gapHistory = this._gapHistory.slice(-MAX_GAP_HISTORY);
            }

            serviceBus.publish('capability:gap_detected', {
                input: userInput,
                gaps: gaps.map(g => g.capability)
            });
        }

        return gaps;
    }

    /**
     * @description 尝试从插件市场搜索并安装插件以填补能力缺口
     * @param {string} capability - 缺失的能力标识
     * @returns {Promise<Object>} 填补结果，包含 success、error、capability 等
     */
    async tryFillGap(capability) {
        const searchResults = pluginMarket.search(capability, { capability });

        if (searchResults.length === 0) {
            return { success: false, error: 'NO_MATCHING_PLUGIN', capability };
        }

        const bestMatch = searchResults[0];
        this._stats.pluginsMatched++;

        if (!this._autoInstallEnabled) {
            return {
                success: false,
                error: 'AUTO_INSTALL_DISABLED',
                capability,
                suggestedPlugin: bestMatch
            };
        }

        try {
            const result = await pluginMarket.install(bestMatch.id);

            if (result.success) {
                this._stats.autoInstalled++;
                serviceBus.publish('capability:auto_filled', {
                    capability,
                    pluginId: bestMatch.id,
                    pluginName: bestMatch.name
                });
                console.log(`[CapabilityDetector] 自动安装插件: ${bestMatch.name} 以满足能力 ${capability}`);
            }

            return result;
        } catch (e) {
            this._stats.autoInstallFailed++;
            return { success: false, error: e.message, capability };
        }
    }

    /**
     * @description 处理能力缺失事件，自动尝试填补缺口
     * @param {Object} data - 事件数据
     */
    async _onCapabilityMissing(data) {
        const capability = this._extractCapabilityFromError(data.error);
        if (!capability) return;

        console.log(`[CapabilityDetector] 检测到能力缺失: ${capability}`);

        const result = await this.tryFillGap(capability);
        if (result.success) {
            serviceBus.publish('capability:recovered', {
                originalError: data.error,
                capability,
                pluginId: result.pluginId
            });
        }
    }

    /**
     * @description 处理插件崩溃事件，记录不可用的能力
     * @param {Object} data - 崩溃事件数据
     */
    _onPluginCrash(data) {
        const pluginName = data.pluginName;
        const plugin = pluginLoader.getPlugin(pluginName);

        if (plugin && plugin.manifest && plugin.manifest.capabilities) {
            for (const cap of plugin.manifest.capabilities) {
                console.log(`[CapabilityDetector] 插件 ${pluginName} 崩溃，能力 ${cap} 暂时不可用`);
            }
        }
    }

    /**
     * @description 从错误信息中提取缺失的能力标识
     * @param {string} errorMsg - 错误信息
     * @returns {string|null} 能力标识
     */
    _extractCapabilityFromError(errorMsg) {
        const match = errorMsg.match(/CAPABILITY_NOT_FOUND:\s*(.+)/);
        return match ? match[1].trim() : null;
    }

    /**
     * @description 获取当前已注册的所有能力集合
     * @returns {Set<string>} 可用能力集合
     */
    _getAvailableCapabilities() {
        const capabilities = new Set();
        for (const [cap, _] of pluginLoader.capabilities) {
            capabilities.add(cap);
        }
        return capabilities;
    }

    /**
     * @description 记录能力使用次数
     * @param {string} capability - 能力标识
     */
    recordUsage(capability) {
        const count = this._capabilityUsage.get(capability) || 0;
        this._capabilityUsage.set(capability, count + 1);
    }

    /**
     * @description 获取能力使用频率统计，按使用次数降序排列
     * @returns {Array} 使用统计列表
     */
    getUsageStats() {
        return Array.from(this._capabilityUsage.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([cap, count]) => ({ capability: cap, count }));
    }

    /**
     * @description 获取缺口历史记录
     * @param {number} [limit=20] - 返回最近N条记录
     * @returns {Array} 缺口历史列表
     */
    getGapHistory(limit = 20) {
        return this._gapHistory.slice(-limit);
    }

    /**
     * @description 获取频繁出现的能力缺口，按出现次数降序排列
     * @returns {Array} 频繁缺口列表
     */
    getFrequentGaps() {
        const gapCounts = new Map();
        for (const entry of this._gapHistory) {
            for (const cap of entry.gaps) {
                gapCounts.set(cap, (gapCounts.get(cap) || 0) + 1);
            }
        }
        return Array.from(gapCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([cap, count]) => ({ capability: cap, count }));
    }

    /**
     * @description 设置是否启用自动安装插件
     * @param {boolean} enabled - 是否启用
     */
    setAutoInstall(enabled) {
        this._autoInstallEnabled = enabled;
    }

    /**
     * @description 获取能力检测器完整状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            availableCapabilities: this._getAvailableCapabilities().size,
            totalKnownCapabilities: Object.keys(INTENT_CAPABILITY_MAP).length,
            autoInstallEnabled: this._autoInstallEnabled,
            stats: { ...this._stats },
            frequentGaps: this.getFrequentGaps().slice(0, 5),
            recentGaps: this._gapHistory.slice(-5)
        };
    }

    /**
     * @description 获取能力检测器统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return { ...this._stats, autoInstallEnabled: this._autoInstallEnabled };
    }
}

module.exports = new CapabilityDetector();
