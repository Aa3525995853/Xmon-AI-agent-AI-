/**
 * @file weather_search.js
 * @description 天气查询服务，基于高德地图 API 提供实时天气、天气预报和通用搜索功能
 * @module services/weather_search
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const https = require('https');

// ============================================================
// 常量配置：高德地图 API 相关参数
// ============================================================

/** 高德地图 API Key，从环境变量读取 */
const AMAP_KEY = process.env.AMAP_KEY || '';

/** 高德地图 API 基础地址 */
const AMAP_BASE_URL = 'https://restapi.amap.com/v3';

/** 天气查询缓存有效期（毫秒），默认30分钟 */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** HTTP 请求超时时间（毫秒） */
const HTTP_TIMEOUT_MS = 10000;

/** 天气预报最大天数限制（高德API最多4天） */
const MAX_FORECAST_DAYS = 4;

// ============================================================
// 天气查询服务类
// ============================================================

class WeatherSearch {
    /**
     * @description 构造函数，初始化缓存
     */
    constructor() {
        this.cache = new Map();
        this.CACHE_TTL = CACHE_TTL_MS;
    }

    /**
     * @description 校验高德地图 API Key 是否已配置
     * @throws {Error} AMAP_KEY 未配置时抛出错误
     */
    _requireAmapKey() {
        if (!AMAP_KEY) {
            throw new Error('AMAP_KEY is not configured; weather query is unavailable');
        }
    }

    /**
     * @description 发起 HTTPS GET 请求
     * @param {string} url - 请求地址
     * @returns {Promise<Object>} 解析后的 JSON 响应
     * @throws {Error} 请求超时或响应解析失败时抛出错误
     */
    httpGet(url) {
        return new Promise((resolve, reject) => {
            const request = https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Failed to parse weather API response'));
                    }
                });
            });

            request.on('error', reject);
            request.setTimeout(HTTP_TIMEOUT_MS, () => {
                request.destroy();
                reject(new Error('Weather API request timed out'));
            });
        });
    }

    /**
     * @description 从缓存中获取数据，过期返回 null
     * @param {string} key - 缓存键
     * @returns {Object|null} 缓存数据，过期或不存在时返回 null
     */
    getCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }
        return null;
    }

    /**
     * @description 写入缓存数据，附带当前时间戳
     * @param {string} key - 缓存键
     * @param {Object} data - 待缓存的数据
     * @returns {void}
     */
    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * @description 查询城市实时天气，包含温度、湿度、风力、穿衣建议等
     * @param {string} city - 城市名称
     * @returns {Promise<Object>} 格式化的天气数据
     * @throws {Error} 城市名为空、API Key 缺失或查询失败时抛出错误
     */
    async getCurrentWeather(city) {
        if (!city) {
            throw new Error('Please provide a city name');
        }

        this._requireAmapKey();

        const cacheKey = `weather:${city}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const cityCode = await this.getCityCode(city);
        if (!cityCode) {
            throw new Error(`City not found: ${city}`);
        }

        const url = `${AMAP_BASE_URL}/weather/weatherInfo?key=${AMAP_KEY}&city=${cityCode}&extensions=base&output=JSON`;
        const result = await this.httpGet(url);

        if (result.status === '0') {
            throw new Error(result.info || 'Weather query failed');
        }
        if (!result.lives || result.lives.length === 0) {
            throw new Error('Weather API returned no live weather data');
        }

        const weather = result.lives[0];
        const temperature = Number.parseInt(weather.temperature, 10);
        const formatted = {
            city: weather.city,
            weather: weather.weather,
            temperature,
            humidity: Number.parseInt(weather.humidity, 10),
            wind: `${weather.winddirection} wind ${weather.windpower}`,
            reportTime: weather.reporttime,
            tips: this.getWeatherTips(weather.weather, temperature),
            clothing: this.getClothingAdvice(weather.weather, temperature),
            emoji: this.getWeatherEmoji(weather.weather)
        };

        this.setCache(cacheKey, formatted);
        return formatted;
    }

    /**
     * @description 查询城市天气预报，支持1-4天预报
     * @param {string} city - 城市名称
     * @param {number} [days=3] - 预报天数，最多4天
     * @returns {Promise<Object>} 格式化的天气预报数据
     * @throws {Error} 城市名为空、API Key 缺失或查询失败时抛出错误
     */
    async getForecast(city, days = 3) {
        if (!city) {
            throw new Error('Please provide a city name');
        }

        this._requireAmapKey();
        const limitedDays = Math.min(Math.max(days, 1), MAX_FORECAST_DAYS);

        const cacheKey = `forecast:${city}:${limitedDays}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const cityCode = await this.getCityCode(city);
        if (!cityCode) {
            throw new Error(`City not found: ${city}`);
        }

        const url = `${AMAP_BASE_URL}/weather/weatherInfo?key=${AMAP_KEY}&city=${cityCode}&extensions=all&output=JSON`;
        const result = await this.httpGet(url);

        if (result.status === '0') {
            throw new Error(result.info || 'Forecast query failed');
        }
        if (!result.forecasts || result.forecasts.length === 0) {
            throw new Error('Weather API returned no forecast data');
        }

        const forecast = result.forecasts[0];
        const formatted = {
            city: forecast.city,
            reportTime: forecast.reporttime,
            forecasts: forecast.casts.slice(0, limitedDays).map(f => ({
                date: f.date,
                week: this.getWeekDay(f.week),
                dayWeather: f.dayweather,
                nightWeather: f.nightweather,
                dayTemp: Number.parseInt(f.daytemp, 10),
                nightTemp: Number.parseInt(f.nighttemp, 10),
                dayWind: f.daywind,
                nightWind: f.nightwind,
                dayPower: f.daypower,
                nightPower: f.nightpower,
                emoji: this.getWeatherEmoji(f.dayweather)
            }))
        };

        this.setCache(cacheKey, formatted);
        return formatted;
    }

    /**
     * @description 根据城市名称查询高德地图城市编码，纯数字直接返回
     * @param {string} cityName - 城市名称或城市编码
     * @returns {Promise<string|null>} 城市编码，未找到时返回 null
     */
    async getCityCode(cityName) {
        if (/^\d+$/.test(cityName)) {
            return cityName;
        }

        this._requireAmapKey();

        const cacheKey = `citycode:${cityName}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const url = `${AMAP_BASE_URL}/config/district?key=${AMAP_KEY}&keywords=${encodeURIComponent(cityName)}&subdistrict=0`;
        const result = await this.httpGet(url);

        if (result.districts && result.districts.length > 0) {
            const code = result.districts[0].adcode;
            this.setCache(cacheKey, code);
            return code;
        }
        return null;
    }

    /**
     * @description 将高德API返回的星期数字转为英文星期名
     * @param {string} week - 星期数字（1-7）
     * @returns {string} 英文星期名
     */
    getWeekDay(week) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[Number.parseInt(week, 10) - 1] || 'Unknown';
    }

    /**
     * @description 根据天气描述返回对应的 emoji 标识
     * @param {string} weather - 天气描述文本
     * @returns {string} emoji 标识（sunny/cloudy/overcast/rain/snow/fog/weather）
     */
    getWeatherEmoji(weather) {
        if (/晴|sun/i.test(weather)) return 'sunny';
        if (/多云|cloud/i.test(weather)) return 'cloudy';
        if (/阴|overcast/i.test(weather)) return 'overcast';
        if (/雨|rain/i.test(weather)) return 'rain';
        if (/雪|snow/i.test(weather)) return 'snow';
        if (/雾|fog/i.test(weather)) return 'fog';
        return 'weather';
    }

    /**
     * @description 根据天气和温度生成出行提示
     * @param {string} weather - 天气描述
     * @param {number} temp - 温度
     * @returns {Array<string>} 提示列表
     */
    getWeatherTips(weather, temp) {
        const tips = [];
        if (/雨|rain/i.test(weather)) tips.push('Carry rain gear');
        if (/雪|snow/i.test(weather)) tips.push('Watch for slippery roads');
        if (temp > 30) tips.push('High temperature; prevent heatstroke');
        if (temp < 5) tips.push('Low temperature; keep warm');
        return tips.length > 0 ? tips : ['Weather is suitable for going out'];
    }

    /**
     * @description 根据温度生成穿衣建议
     * @param {string} weather - 天气描述（暂未使用，预留扩展）
     * @param {number} temp - 温度
     * @returns {string} 穿衣建议文本
     */
    getClothingAdvice(weather, temp) {
        if (temp > 30) return 'Short sleeves and sun protection';
        if (temp > 25) return 'Short sleeves or light clothes';
        if (temp > 20) return 'Long sleeves or light jacket';
        if (temp > 15) return 'Jacket and jeans';
        if (temp > 10) return 'Sweater or lined jacket';
        if (temp > 5) return 'Cotton coat or thick jacket';
        return 'Down jacket, scarf and gloves';
    }

    /**
     * @description 通用搜索，基于 DuckDuckGo API 查询信息
     * @param {string} query - 搜索关键词
     * @returns {Promise<Object>} 搜索结果，包含 answer/url/topics/emoji
     * @throws {Error} 查询为空或请求失败时抛出错误
     */
    async search(query) {
        if (!query) {
            throw new Error('Please provide a search query');
        }

        const cacheKey = `search:${query}`;
        const cached = this.getCache(cacheKey);
        if (cached) return cached;

        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const result = await this.httpGet(url);
        const formatted = {
            query,
            answer: result.AbstractText || result.Answer || 'No relevant information found',
            url: result.AbstractURL || '',
            topics: (result.RelatedTopics || []).slice(0, 5).map(t => ({
                text: t.Text,
                url: t.FirstURL || ''
            })),
            emoji: this.getSearchEmoji(query)
        };

        this.setCache(cacheKey, formatted);
        return formatted;
    }

    /**
     * @description 根据搜索关键词返回对应的 emoji 标识
     * @param {string} query - 搜索关键词
     * @returns {string} emoji 标识
     */
    getSearchEmoji(query) {
        const lowerQuery = query.toLowerCase();
        if (/weather|天气/.test(lowerQuery)) return 'weather';
        if (/news|新闻/.test(lowerQuery)) return 'news';
        if (/movie|电影/.test(lowerQuery)) return 'movie';
        if (/music|音乐/.test(lowerQuery)) return 'music';
        return 'search';
    }

    /**
     * @description 清空所有缓存数据
     * @returns {void}
     */
    clearCache() {
        this.cache.clear();
    }
}

module.exports = new WeatherSearch();
