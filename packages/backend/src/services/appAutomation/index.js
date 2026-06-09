/**
 * @file index.js
 * @description AppAutomation 主入口 - 应用自动化控制服务，
 *              通过 Win32 API 和 PowerShell 实现 Windows 应用自动化，
 *              支持网易云音乐播放控制、通用键盘/窗口操作等
 * @module services/appAutomation
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块：避免循环依赖，按需初始化
// ============================================================

let _win32Helper = null;
let _appRegistry = null;
let _actionExecutor = null;

/**
 * @description 获取 Win32 助手单例
 * @returns {Object} Win32Helper 实例
 */
function getWin32Helper() {
    if (!_win32Helper) _win32Helper = require('./win32_helper');
    return _win32Helper;
}

/**
 * @description 获取应用注册表单例
 * @returns {Object} AppRegistry 实例
 */
function getAppRegistry() {
    if (!_appRegistry) _appRegistry = require('./app_registry');
    return _appRegistry;
}

/**
 * @description 获取动作执行器实例（非单例，每次创建新实例）
 * @returns {ActionExecutor} ActionExecutor 实例
 */
function getActionExecutor() {
    if (!_actionExecutor) {
        const ActionExecutor = require('./action_executor');
        _actionExecutor = new ActionExecutor();
    }
    return _actionExecutor;
}

// ============================================================
// AppAutomation 类：应用自动化服务主类
// ============================================================

class AppAutomation {
    constructor() {
        this.win32Helper = getWin32Helper();
        this.appRegistry = getAppRegistry();
        this.actionExecutor = getActionExecutor();
        this.actionExecutor.setWin32Helper(this.win32Helper);

        logger.info('[AppAutomation] 应用自动化初始化完成');
    }

    /**
     * @description 执行应用操作，按优先级查找：内置云音乐动作 > 内置通用动作 > 注册表定义动作
     * @param {string} appName - 应用名称
     * @param {string} actionName - 动作名称
     * @param {Object} [params={}] - 动作参数
     * @returns {Promise<{success: boolean, message: string}>} 执行结果
     */
    async execute(appName, actionName, params = {}) {
        // 优先使用 CLOUDMUSIC_ACTIONS 中的内置实现
        const ActionExecutor = require('./action_executor');
        if (ActionExecutor.CLOUDMUSIC_ACTIONS[actionName]) {
            return await ActionExecutor.CLOUDMUSIC_ACTIONS[actionName](params, this.actionExecutor);
        }
        if (ActionExecutor.GENERIC_ACTIONS[actionName]) {
            return await ActionExecutor.GENERIC_ACTIONS[actionName](params, this.actionExecutor);
        }

        // 回退到 app_registry 定义的动作
        const app = this.appRegistry.findApp(appName);
        const action = this.appRegistry.getAction(app, actionName);

        if (action) {
            return await this.actionExecutor.runPS(action.script, params);
        }

        const genericAction = this.appRegistry.getGenericAction(actionName);
        if (genericAction) {
            return await this.actionExecutor.runPS(genericAction.script, params);
        }

        if (app) {
            const available = Object.keys(app.actions);
            return { success: false, message: `${appName}不支持"${actionName}"操作，支持的操作有：${available.join('、')}` };
        }

        return { success: false, message: `暂时还不支持自动操作${appName}，目前支持：${this.appRegistry.listAppNames().join('、')}` };
    }

    /**
     * @description 获取供 LLM 工具调用使用的工具定义
     * @returns {Array<Object>} 工具定义数组
     */
    getToolsForLLM() {
        return [{
            type: 'function',
            function: {
                name: 'app_action',
                description: '在已打开的应用中执行操作，如播放音乐、发送消息、暂停等。当用户说"播放XX歌曲"、"播放XX歌单"、"暂停音乐"、"下一首"、"给XX发消息"时使用。',
                parameters: {
                    type: 'object',
                    properties: {
                        app_name: { type: 'string', description: '应用名称，如"网易云音乐"、"微信"' },
                        action: {
                            type: 'string',
                            enum: ['play_song', 'play_playlist', 'play_music', 'pause', 'next_song', 'prev_song', 'volume_up', 'volume_down', 'auto_play', 'send_message', 'type_text', 'press_key', 'hotkey', 'activate_window'],
                            description: '要执行的操作'
                        },
                        params: {
                            type: 'object',
                            description: '操作参数',
                            properties: {
                                song: { type: 'string', description: '歌曲名（play_song时使用）' },
                                playlist: { type: 'string', description: '歌单名（play_playlist时使用）' },
                                name: { type: 'string', description: '歌单名（play_playlist时使用，与playlist等价）' },
                                keyword: { type: 'string', description: '搜索关键词（play_music时使用，智能匹配歌单或歌曲）' },
                                contact: { type: 'string', description: '联系人（send_message时使用）' },
                                message: { type: 'string', description: '消息内容（send_message时使用）' },
                                text: { type: 'string', description: '要输入的文字（type_text时使用）' },
                                key: { type: 'string', description: '按键名称（press_key时使用）' },
                                keys: { type: 'string', description: '快捷键组合（hotkey时使用），如^f表示Ctrl+F' }
                            }
                        }
                    },
                    required: ['app_name', 'action']
                }
            }
        }];
    }

    /**
     * @description 处理 LLM 工具调用请求
     * @param {string} toolName - 工具名称
     * @param {Object} args - 工具调用参数
     * @returns {Promise<Object|null>} 执行结果，工具不匹配返回 null
     */
    async handleToolCall(toolName, args) {
        if (toolName === 'app_action') {
            return await this.execute(args.app_name, args.action, args.params || {});
        }
        return null;
    }

    /**
     * @description 获取所有支持的应用及其操作列表
     * @returns {Array<{name: string, actions: Array}>} 应用列表
     */
    listSupportedApps() {
        return this.appRegistry.listApps();
    }
}

const instance = new AppAutomation();
module.exports = instance;