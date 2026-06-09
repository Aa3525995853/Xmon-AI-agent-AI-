/**
 * @file weather/index.js
 * @description 天气插件，提供天气查询、天气预报和空气质量查询功能
 * @module plugins/weather
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const weatherSearch = require('../../services/weather_search');

class WeatherPlugin {
    /**
     * @description 激活插件，注入服务总线依赖和天气服务实例
     * @param {Object} deps - 插件依赖对象
     * @param {Object} deps.serviceBus - 服务总线，用于插件间通信
     */
    activate(deps) {
        this.serviceBus = deps.serviceBus;
        this.weather = weatherSearch;
    }

    /**
     * @description 停用插件，清理资源
     */
    deactivate() {}

    /**
     * @description 执行天气插件能力，根据 capability 路由到对应的天气服务方法
     * @param {string} capability - 能力标识，支持 weather:query、weather:forecast、weather:air_quality
     * @param {Object} params - 参数对象
     * @param {string} params.city - 城市名称，查询和预报时默认为 '北京'
     * @returns {Promise<Object>} 天气查询结果
     * @throws {Error} 未知能力标识时抛出异常
     */
    async execute(capability, params) {
        switch (capability) {
            case 'weather:query':
                return await this.weather.search(params.city || '北京');
            case 'weather:forecast':
                return await this.weather.forecast(params.city);
            case 'weather:air_quality':
                return await this.weather.airQuality(params.city);
            default:
                throw new Error(`Unknown capability: ${capability}`);
        }
    }
}

module.exports = WeatherPlugin;
