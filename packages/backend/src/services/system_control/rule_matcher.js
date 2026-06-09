/**
 * @file rule_matcher.js
 * @description 规则匹配器 - 当LLM不可用时的降级方案，通过正则表达式匹配用户意图
 * @module services/system_control
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class RuleMatcher {
    /**
     * @description 构造函数，初始化规则列表
     */
    constructor() {
        this.rules = this._initRules();
    }

    /**
     * @description 初始化所有匹配规则，覆盖系统操作、应用启动、音乐、搜索、文件、音量、窗口、剪贴板、浏览器等场景
     * @returns {Array<{pattern: RegExp, type: string, action?: string, extract?: number, dangerous?: boolean, platform?: number, app?: string}>} 规则数组
     * @private
     */
    _initRules() {
        return [
            // 系统操作
            { pattern: /^(锁屏|锁定)/, type: 'system_shortcut', action: 'lock' },
            { pattern: /^关机$/, type: 'system_shortcut', action: 'shutdown', dangerous: true },
            { pattern: /^重启$/, type: 'system_shortcut', action: 'restart', dangerous: true },
            { pattern: /^(睡眠|休眠)/, type: 'system_shortcut', action: 'sleep' },

            // 应用启动
            { pattern: /^(打开|启动|运行)\s*([^\s]+)/, type: 'launch_app', extract: 2 },
            { pattern: /^打开([^\s]+)$/, type: 'launch_app', extract: 1 },

            // 音乐控制
            { pattern: /^(播放|放|听)\s*(.+)/, type: 'play_music', extract: 2 },
            { pattern: /^来首\s*(.+)/, type: 'play_music', extract: 1 },

            // 搜索
            { pattern: /^搜索\s*(.+)/, type: 'search_web', extract: 1 },
            { pattern: /^查一下\s*(.+)/, type: 'search_web', extract: 1 },
            { pattern: /^搜\s*(.+)/, type: 'search_web', extract: 1 },

            // 搜索购物
            { pattern: /^(搜索|找|想买)\s*(.+)[\s,，]*(淘宝|天猫|京东)?/, type: 'search_shopping', extract: 2, platform: 3 },

            // 搜索视频
            { pattern: /^搜视频\s*(.+)/, type: 'search_video', extract: 1 },
            { pattern: /^看\s*(.+)视频/, type: 'search_video', extract: 1 },

            // 截图
            { pattern: /^(截图|截屏)/, type: 'take_screenshot' },
            { pattern: /^截个图/, type: 'take_screenshot' },

            // 文件操作
            { pattern: /^新建文件夹\s*(.+)/, type: 'create_folder', extract: 1 },
            { pattern: /^创建文件夹\s*(.+)/, type: 'create_folder', extract: 1 },
            { pattern: /^mkdir\s+(.+)/, type: 'create_folder', extract: 1 },

            // 音量控制
            { pattern: /^(音?[量声]|音量)\s*(调大|增大|升高|提高|加|up)/, type: 'control_volume', action: 'up' },
            { pattern: /^(音?[量声]|音量)\s*(调小|减小|降低|减小|减|down)/, type: 'control_volume', action: 'down' },
            { pattern: /^(静音|静音模式|关闭声音)/, type: 'control_volume', action: 'mute' },
            { pattern: /^(取消静音|恢复声音|打开声音)/, type: 'control_volume', action: 'unmute' },

            // 窗口管理
            { pattern: /^(最小化|缩小)/, type: 'manage_window', action: 'minimize' },
            { pattern: /^(最大化|放大)/, type: 'manage_window', action: 'maximize' },
            { pattern: /^(关闭窗口|关闭应用)/, type: 'manage_window', action: 'close' },
            { pattern: /^(还原|恢复窗口)/, type: 'manage_window', action: 'restore' },

            // 剪贴板
            { pattern: /^复制\s*(.+)/, type: 'clipboard_operation', action: 'copy', extract: 1 },
            { pattern: /^粘贴/, type: 'clipboard_operation', action: 'paste' },
            { pattern: /^清空剪贴板/, type: 'clipboard_operation', action: 'clear' },

            // 浏览器
            { pattern: /^打开\s*(https?:\/\/)?(.+)/, type: 'open_url', extract: 2 },
            { pattern: /^浏览\s*(.+)/, type: 'open_url', extract: 1 },

            // 系统信息
            { pattern: /^(系统信息|电脑配置|查看配置)/, type: 'get_system_info' },
            { pattern: /^我的电脑/, type: 'launch_app', app: 'explorer' },

            // 进程管理
            { pattern: /^(关闭|终止|杀掉)\s*(.+)/, type: 'manage_process', action: 'kill', extract: 2 },
            { pattern: /^查看进程/, type: 'manage_process', action: 'list' }
        ];
    }

    /**
     * @description 匹配用户输入，按规则顺序依次尝试正则匹配
     * @param {string} userInput - 用户输入的文本
     * @returns {{intent: {type: string, match?: Object}, requireConfirm?: boolean, message?: string}|null} 匹配结果，无匹配返回null
     */
    match(userInput) {
        for (const rule of this.rules) {
            const match = userInput.match(rule.pattern);
            if (match) {
                const intent = { type: rule.type };

                // 提取参数
                if (rule.extract && match[rule.extract]) {
                    intent.match = { [rule.extract === 1 ? 'value' : 'name']: match[rule.extract].trim() };
                } else if (rule.action) {
                    intent.match = { action: rule.action };
                }

                // 特殊参数
                if (rule.platform) {
                    intent.match = intent.match || {};
                    intent.match.platform = match[rule.platform] || 'taobao';
                }
                if (rule.app) {
                    intent.match = intent.match || {};
                    intent.match.app_name = rule.app;
                }

                const result = { intent };

                if (rule.dangerous) {
                    result.requireConfirm = true;
                    result.message = `这是一个危险操作(${rule.action})，确定要执行吗？`;
                }

                return result;
            }
        }

        return null;
    }

    /**
     * @description 动态添加新规则
     * @param {RegExp} pattern - 匹配正则
     * @param {string} type - 意图类型
     * @param {Object} [options={}] - 额外选项（action、extract、dangerous等）
     * @returns {void}
     */
    addRule(pattern, type, options = {}) {
        this.rules.push({ pattern, type, ...options });
    }
}

module.exports = new RuleMatcher();