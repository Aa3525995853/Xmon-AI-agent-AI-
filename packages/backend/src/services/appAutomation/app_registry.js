/**
 * @file app_registry.js
 * @description 应用注册表 - 管理支持自动化的应用配置信息，
 *              包括进程名、可执行路径、别名映射和支持的操作定义
 * @module services/appAutomation
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义：应用配置与通用动作
// ============================================================

/** 已注册的应用配置，包含别名、进程名、可执行路径和支持的操作 */
const APP_CONFIGS = {
    '网易云音乐': {
        aliases: ['网易云', 'cloudmusic', 'netease', '音乐'],
        processName: 'cloudmusic',
        exePath: 'C:\\Program Files\\NetEase\\CloudMusic\\cloudmusic.exe',
        actions: {
            play_song: { desc: '搜索并播放歌曲', params: ['song'], async: true },
            pause: { desc: '暂停/继续播放', params: [], async: true },
            next_song: { desc: '下一首', params: [], async: true },
            prev_song: { desc: '上一首', params: [], async: true },
            volume_up: { desc: '调大音量', params: [], async: true },
            volume_down: { desc: '调小音量', params: [], async: true },
            auto_play: { desc: '启动并自动播放', params: [], async: true }
        }
    },
    '微信': {
        aliases: ['wechat', 'WeChat'],
        processName: 'WeChat',
        actions: {
            send_message: { desc: '发送消息给联系人', params: ['contact', 'message'], async: true }
        }
    },
    'QQ': {
        aliases: ['qq'],
        processName: 'QQ',
        actions: {
            send_message: { desc: '发送消息给联系人', params: ['contact', 'message'], async: true }
        }
    }
};

/** 通用动作配置，不绑定特定应用 */
const GENERIC_ACTIONS = {
    type_text: { desc: '在当前活动窗口输入文字', params: ['text'], async: true },
    press_key: { desc: '模拟按键', params: ['key'], async: true },
    hotkey: { desc: '模拟快捷键组合', params: ['keys'], async: true },
    activate_window: { desc: '激活指定应用窗口', params: ['app_name'], async: true }
};

// ============================================================
// AppRegistry 类：应用查找与动作查询
// ============================================================

class AppRegistry {
    constructor() {
        /** 应用名/别名 → 配置的映射表 */
        this.appMap = {};

        // 构建映射：原名 + 所有别名（小写）均指向同一配置
        for (const [name, config] of Object.entries(APP_CONFIGS)) {
            this.appMap[name] = config;
            for (const alias of (config.aliases || [])) {
                this.appMap[alias.toLowerCase()] = config;
            }
        }
    }

    /**
     * @description 根据应用名称或别名查找应用配置，支持模糊匹配
     * @param {string} appName - 应用名称或别名
     * @returns {Object|null} 应用配置对象，未找到返回 null
     */
    findApp(appName) {
        if (!appName) return null;
        // 精确匹配
        if (this.appMap[appName]) return this.appMap[appName];

        // 小写精确匹配
        const lower = appName.toLowerCase();
        if (this.appMap[lower]) return this.appMap[lower];

        // 模糊匹配：名称包含关系或别名包含关系
        for (const [key, config] of Object.entries(this.appMap)) {
            if (key.includes(lower) || lower.includes(key)) return config;
            if (config.aliases?.some(a => a.toLowerCase().includes(lower) || lower.includes(a.toLowerCase()))) {
                return config;
            }
        }
        return null;
    }

    /**
     * @description 获取指定应用的某个动作配置
     * @param {Object|null} app - 应用配置对象
     * @param {string} actionName - 动作名称
     * @returns {Object|undefined} 动作配置
     */
    getAction(app, actionName) {
        return app?.actions?.[actionName];
    }

    /**
     * @description 获取通用动作配置
     * @param {string} actionName - 动作名称
     * @returns {Object|undefined} 动作配置
     */
    getGenericAction(actionName) {
        return GENERIC_ACTIONS[actionName];
    }

    /**
     * @description 获取所有已注册应用的名称列表
     * @returns {Array<string>} 应用名称数组
     */
    listAppNames() {
        return Object.keys(APP_CONFIGS);
    }

    /**
     * @description 获取所有已注册应用及其操作的详细信息列表
     * @returns {Array<{name: string, actions: Array<{name: string, desc: string, params: Array}>}>} 应用详情列表
     */
    listApps() {
        return Object.entries(APP_CONFIGS).map(([name, config]) => ({
            name,
            actions: Object.entries(config.actions).map(([actionName, action]) => ({
                name: actionName,
                desc: action.desc,
                params: action.params
            }))
        }));
    }
}

module.exports = new AppRegistry();