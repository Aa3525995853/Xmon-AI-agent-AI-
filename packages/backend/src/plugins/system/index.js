/**
 * @file system/index.js
 * @description 系统控制插件，提供应用启动、音乐播放、网页搜索、截图等系统级操作能力
 * @module plugins/system
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const systemControl = require('../../services/system_control');

class SystemPlugin {
    /**
     * @description 激活插件，注入服务总线依赖和系统控制服务实例
     * @param {Object} deps - 插件依赖对象
     * @param {Object} deps.serviceBus - 服务总线，用于插件间通信
     */
    activate(deps) {
        this.serviceBus = deps.serviceBus;
        this.system = systemControl;
    }

    /**
     * @description 停用插件，清理资源
     */
    deactivate() {}

    /**
     * @description 执行系统控制插件能力，将插件能力标识映射到系统控制工具名称
     * @param {string} capability - 能力标识，如 system:launch_app、system:play_music 等
     * @param {Object} params - 工具执行参数
     * @returns {Promise<Object>} 工具执行结果
     * @throws {Error} 未知能力标识时抛出异常
     */
    async execute(capability, params) {
        // 插件能力标识到系统控制工具名称的映射表
        const toolMap = {
            'system:launch_app': 'launch_app',
            'system:play_music': 'play_music',
            'system:open_url': 'open_url',
            'system:search_web': 'search_web',
            'system:search_shopping': 'search_shopping',
            'system:search_video': 'search_video',
            'system:get_system_info': 'get_system_info',
            'system:create_folder': 'create_folder',
            'system:take_screenshot': 'take_screenshot',
            'system:search_local_files': 'search_local_files'
        };

        const toolName = toolMap[capability];
        if (!toolName) throw new Error(`Unknown capability: ${capability}`);

        return await this.system.executeTool(toolName, params);
    }
}

module.exports = SystemPlugin;
