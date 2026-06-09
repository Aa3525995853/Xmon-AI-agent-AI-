/**
 * @file browser/index.js
 * @description 浏览器插件，提供网页执行、搜索提取、内容提取和截图等浏览器操作能力
 * @module plugins/browser
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const browserService = require('../../services/browserService');

class BrowserPlugin {
    /**
     * @description 激活插件，注入服务总线依赖
     * @param {Object} deps - 插件依赖对象
     * @param {Object} deps.serviceBus - 服务总线，用于插件间通信
     */
    activate(deps) {
        this.serviceBus = deps.serviceBus;
    }

    /**
     * @description 停用插件，中止浏览器服务中正在进行的请求
     */
    deactivate() {
        browserService.abort();
    }

    /**
     * @description 执行浏览器插件能力，根据 capability 路由到对应的浏览器服务方法
     * @param {string} capability - 能力标识，支持 browser:execute、browser:search、browser:extract、browser:screenshot
     * @param {Object} params - 参数对象
     * @param {Object} [params.options] - 可选配置（搜索/提取/截图时使用）
     * @param {string} [params.query] - 搜索关键词（browser:search 时使用）
     * @param {string} [params.url] - 目标网页 URL（browser:extract/screenshot 时使用）
     * @returns {Promise<Object>} 浏览器操作结果
     * @throws {Error} 未知能力标识时抛出异常
     */
    async execute(capability, params) {
        switch (capability) {
            case 'browser:execute':
                return await browserService.execute(params);
            case 'browser:search':
                return await browserService.searchAndExtract(params.query, params.options);
            case 'browser:extract':
                return await browserService.extractContent(params.url, params.options);
            case 'browser:screenshot':
                return await browserService.screenshot(params.url, params.options);
            default:
                throw new Error(`Unknown capability: ${capability}`);
        }
    }
}

module.exports = BrowserPlugin;
