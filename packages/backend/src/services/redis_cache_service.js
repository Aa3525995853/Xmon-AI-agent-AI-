/**
 * @file redis_cache_service.js
 * @description Redis 缓存服务，用于价格提醒、订单追踪等数据的缓存，
 *              支持 Redis 不可用时自动降级到内存缓存
 * @module services/redis_cache_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 功能：
 * 1. 价格数据缓存 - 减少重复 API 调用
 * 2. 会话缓存 - 多用户支持
 * 3. 实时数据存储 - 有过期时间的临时数据
 */

const { createClient } = require('redis');
const { logger } = require('../utils/logger');

// ============================================================
// 模块名称：Redis 配置与常量
// 功能说明：定义 Redis 连接配置、缓存过期时间和 key 前缀
// ============================================================

/** Redis 重连最大延迟（毫秒） */
const MAX_RETRY_DELAY_MS = 2000;

/** Redis 每次请求最大重试次数 */
const MAX_RETRIES_PER_REQUEST = 3;

/** Redis 连接配置 */
const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryStrategy: (times) => {
        // 重连延迟随次数递增，但不超过上限
        const delay = Math.min(times * 50, MAX_RETRY_DELAY_MS);
        return delay;
    },
    maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST
};

// 缓存过期时间配置（秒）
const TTL = {
    PRICE_DATA: 300,        // 价格数据 5 分钟
    SEARCH_RESULT: 600,      // 搜索结果 10 分钟
    USER_SESSION: 3600,     // 用户会话 1 小时
    RATE_LIMIT: 60,          // 限流计数 1 分钟
    TEMP_DATA: 300          // 临时数据 5 分钟
};

// 缓存 key 前缀
const KEY_PREFIX = {
    PRICE: 'price:',
    TICKET: 'ticket:',
    ORDER: 'order:',
    USER: 'user:',
    SESSION: 'session:',
    ALERT: 'alert:',
    RATE_LIMIT: 'ratelimit:'
};

// ============================================================
// 模块名称：RedisCacheService 类
// 功能说明：Redis 缓存服务核心实现，支持降级到内存缓存
// ============================================================

class RedisCacheService {
    /**
     * @description 构造函数，初始化 Redis 客户端和内存降级缓存
     */
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.fallbackCache = new Map(); // 内存缓存（Redis 不可用时）
        this.fallbackEnabled = true;    // 启用内存缓存作为降级
    }

    /**
     * @description 连接到 Redis 服务器，连接失败时自动降级到内存缓存
     * @returns {Promise<boolean>} 是否成功连接到 Redis
     */
    async connect() {
        try {
            this.client = createClient(REDIS_CONFIG);

            this.client.on('error', (err) => {
                logger.error('[Redis] 连接错误:', err.message);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                logger.info('[Redis] 已连接到 Redis 服务器');
                this.isConnected = true;
            });

            this.client.on('reconnecting', () => {
                logger.warn('[Redis] 正在重新连接...');
            });

            await this.client.connect();
            this.isConnected = true;
            logger.info('[Redis] 初始化完成');

            return true;
        } catch (error) {
            logger.warn('[Redis] 连接失败，使用内存缓存降级:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * @description 断开 Redis 连接并重置连接状态
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (this.client) {
            await this.client.quit();
            this.isConnected = false;
            logger.info('[Redis] 已断开连接');
        }
    }

    /**
     * @description 检查 Redis 是否可用
     * @returns {boolean} 是否已连接
     */
    isAvailable() {
        return this.isConnected;
    }

    // ==================== 基础操作 ====================

    /**
     * @description 设置缓存值，支持可选的过期时间，Redis 不可用时降级到内存缓存
     * @param {string} key - 缓存键名
     * @param {*} value - 缓存值（会被 JSON 序列化）
     * @param {number|null} ttlSeconds - 过期时间（秒），为 null 时永不过期
     * @returns {Promise<boolean>} 是否设置成功
     */
    async set(key, value, ttlSeconds = null) {
        try {
            const serialized = JSON.stringify(value);

            if (this.isConnected && this.client) {
                if (ttlSeconds) {
                    await this.client.setEx(key, ttlSeconds, serialized);
                } else {
                    await this.client.set(key, serialized);
                }
            } else {
                // 降级到内存缓存
                this.fallbackCache.set(key, {
                    value: serialized,
                    expireAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
                });
            }
            return true;
        } catch (error) {
            logger.error('[Redis] SET 失败:', error.message);
            return false;
        }
    }

    /**
     * @description 获取缓存值，自动 JSON 反序列化，内存缓存时检查过期
     * @param {string} key - 缓存键名
     * @returns {Promise<*|null>} 缓存值，不存在或过期返回 null
     */
    async get(key) {
        try {
            if (this.isConnected && this.client) {
                const data = await this.client.get(key);
                return data ? JSON.parse(data) : null;
            } else {
                // 从内存缓存获取
                const cached = this.fallbackCache.get(key);
                if (cached) {
                    // 检查是否过期
                    if (cached.expireAt && Date.now() > cached.expireAt) {
                        this.fallbackCache.delete(key);
                        return null;
                    }
                    return JSON.parse(cached.value);
                }
                return null;
            }
        } catch (error) {
            logger.error('[Redis] GET 失败:', error.message);
            return null;
        }
    }

    /**
     * @description 删除缓存值，同时清理 Redis 和内存缓存
     * @param {string} key - 缓存键名
     * @returns {Promise<boolean>} 是否删除成功
     */
    async del(key) {
        try {
            if (this.isConnected && this.client) {
                await this.client.del(key);
            }
            this.fallbackCache.delete(key);
            return true;
        } catch (error) {
            logger.error('[Redis] DEL 失败:', error.message);
            return false;
        }
    }

    /**
     * @description 检查缓存键是否存在且未过期
     * @param {string} key - 缓存键名
     * @returns {Promise<boolean>} 是否存在
     */
    async exists(key) {
        try {
            if (this.isConnected && this.client) {
                return await this.client.exists(key) === 1;
            } else {
                const cached = this.fallbackCache.get(key);
                if (cached && (!cached.expireAt || Date.now() <= cached.expireAt)) {
                    return true;
                }
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * @description 设置缓存键的过期时间
     * @param {string} key - 缓存键名
     * @param {number} seconds - 过期时间（秒）
     * @returns {Promise<boolean>} 是否设置成功
     */
    async expire(key, seconds) {
        try {
            if (this.isConnected && this.client) {
                await this.client.expire(key, seconds);
            }
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * @description 自增计数器，Redis 不可用时使用内存缓存模拟
     * @param {string} key - 计数器键名
     * @returns {Promise<number>} 自增后的值，失败返回 0
     */
    async incr(key) {
        try {
            if (this.isConnected && this.client) {
                return await this.client.incr(key);
            } else {
                // 内存缓存版本
                const current = parseInt(this.fallbackCache.get(key)?.value || '0');
                const newVal = current + 1;
                this.fallbackCache.set(key, {
                    value: newVal.toString(),
                    expireAt: Date.now() + 60000
                });
                return newVal;
            }
        } catch (error) {
            return 0;
        }
    }

    // ==================== 价格缓存 ====================

    /**
     * @description 生成价格缓存键名
     * @param {string} from - 出发地
     * @param {string} to - 目的地
     * @param {string} date - 日期
     * @param {string} type - 交通类型（默认 train）
     * @returns {string} 缓存键名
     */
    getPriceKey(from, to, date, type = 'train') {
        return `${KEY_PREFIX.PRICE}${from}:${to}:${date}:${type}`;
    }

    /**
     * @description 缓存价格数据，附带缓存时间和查询参数
     * @param {string} from - 出发地
     * @param {string} to - 目的地
     * @param {string} date - 日期
     * @param {string} type - 交通类型
     * @param {Object} priceData - 价格数据
     * @param {number} ttl - 过期时间（秒），默认 300 秒
     * @returns {Promise<boolean>} 是否缓存成功
     */
    async cachePrice(from, to, date, type, priceData, ttl = TTL.PRICE_DATA) {
        const key = this.getPriceKey(from, to, date, type);
        const data = {
            ...priceData,
            cachedAt: Date.now(),
            from,
            to,
            date,
            type
        };
        return await this.set(key, data, ttl);
    }

    /**
     * @description 获取缓存的价格数据
     * @param {string} from - 出发地
     * @param {string} to - 目的地
     * @param {string} date - 日期
     * @param {string} type - 交通类型
     * @returns {Promise<Object|null>} 价格数据，不存在返回 null
     */
    async getPrice(from, to, date, type) {
        const key = this.getPriceKey(from, to, date, type);
        const cached = await this.get(key);
        return cached;
    }

    /**
     * @description 检查价格缓存是否已过期（数据陈旧）
     * @param {string} from - 出发地
     * @param {string} to - 目的地
     * @param {string} date - 日期
     * @param {string} type - 交通类型
     * @param {number} maxAgeSeconds - 最大允许年龄（秒），默认 300 秒
     * @returns {Promise<boolean>} 是否已过期
     */
    async isPriceStale(from, to, date, type, maxAgeSeconds = TTL.PRICE_DATA) {
        const cached = await this.getPrice(from, to, date, type);
        if (!cached) return true;

        const age = (Date.now() - cached.cachedAt) / 1000;
        return age > maxAgeSeconds;
    }

    // ==================== 订票缓存 ====================

    /**
     * @description 缓存搜索结果
     * @param {string|Object} query - 搜索查询条件
     * @param {Object} result - 搜索结果
     * @param {number} ttl - 过期时间（秒），默认 600 秒
     * @returns {Promise<boolean>} 是否缓存成功
     */
    async cacheSearchResult(query, result, ttl = TTL.SEARCH_RESULT) {
        const key = `${KEY_PREFIX.TICKET}search:${this.hashQuery(query)}`;
        return await this.set(key, result, ttl);
    }

    /**
     * @description 获取缓存的搜索结果
     * @param {string|Object} query - 搜索查询条件
     * @returns {Promise<Object|null>} 搜索结果，不存在返回 null
     */
    async getSearchResult(query) {
        const key = `${KEY_PREFIX.TICKET}search:${this.hashQuery(query)}`;
        return await this.get(key);
    }

    /**
     * @description 生成查询条件的哈希值，用于构建缓存键
     * @param {string|Object} query - 查询条件
     * @returns {string} 哈希字符串
     */
    hashQuery(query) {
        const str = typeof query === 'string' ? query : JSON.stringify(query);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    // ==================== 订单缓存 ====================

    /**
     * 缓存订单数据
     */
    async cacheOrder(orderId, orderData) {
        const key = `${KEY_PREFIX.ORDER}${orderId}`;
        return await this.set(key, orderData, TTL.TEMP_DATA * 2); // 10 分钟
    }

    /**
     * @description 获取缓存的订单数据
     * @param {string} orderId - 订单 ID
     * @returns {Promise<Object|null>} 订单数据，不存在返回 null
     */
    async getCachedOrder(orderId) {
        const key = `${KEY_PREFIX.ORDER}${orderId}`;
        return await this.get(key);
    }

    // ==================== 价格提醒缓存 ====================

    /**
     * @description 缓存提醒数据，24 小时过期
     * @param {string} alertId - 提醒 ID
     * @param {Object} alertData - 提醒数据
     * @returns {Promise<boolean>} 是否缓存成功
     */
    async cacheAlert(alertId, alertData) {
        const key = `${KEY_PREFIX.ALERT}${alertId}`;
        return await this.set(key, alertData, 3600 * 24);
    }

    /**
     * @description 获取缓存的提醒数据
     * @param {string} alertId - 提醒 ID
     * @returns {Promise<Object|null>} 提醒数据，不存在返回 null
     */
    async getCachedAlert(alertId) {
        const key = `${KEY_PREFIX.ALERT}${alertId}`;
        return await this.get(key);
    }

    /**
     * @description 获取指定用户的所有提醒 ID 列表
     * @param {string} userId - 用户 ID
     * @returns {Promise<Array<string>>} 提醒 ID 数组
     */
    async getUserAlertIds(userId) {
        try {
            if (!this.isConnected || !this.client) return [];

            const pattern = `${KEY_PREFIX.ALERT}*`;
            const keys = await this.client.keys(pattern);

            const alertIds = [];
            for (const key of keys) {
                const data = await this.client.get(key);
                if (data) {
                    const alert = JSON.parse(data);
                    if (alert.userId === userId) {
                        alertIds.push(alert.id);
                    }
                }
            }
            return alertIds;
        } catch (error) {
            logger.error('[Redis] 获取用户提醒失败:', error.message);
            return [];
        }
    }

    // ==================== 限流 ====================

    /**
     * @description 检查是否超过限流阈值，首次请求时设置过期窗口
     * @param {string} key - 限流键名
     * @param {number} maxRequests - 窗口内最大请求数
     * @param {number} windowSeconds - 窗口时间（秒）
     * @returns {Promise<boolean>} 是否超过限流
     */
    async isRateLimited(key, maxRequests, windowSeconds) {
        try {
            const current = await this.incr(key);

            if (current === 1) {
                await this.expire(key, windowSeconds);
            }

            return current > maxRequests;
        } catch (error) {
            return false;
        }
    }

    /**
     * @description 获取限流计数信息
     * @param {string} key - 限流键名
     * @returns {Promise<{current: number, key: string}>} 当前计数和键名
     */
    async getRateLimitInfo(key) {
        const count = await this.get(key);
        return {
            current: count || 0,
            key
        };
    }

    // ==================== 批量操作 ====================

    /**
     * @description 删除匹配模式的所有缓存键
     * @param {string} pattern - 键名匹配模式（如 "price:*"）
     * @returns {Promise<number>} 删除的键数量
     */
    async delByPattern(pattern) {
        try {
            if (!this.isConnected || !this.client) return 0;

            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
            }
            return keys.length;
        } catch (error) {
            logger.error('[Redis] 删除 pattern 失败:', error.message);
            return 0;
        }
    }

    /**
     * @description 清空所有价格缓存
     * @returns {Promise<number>} 删除的键数量
     */
    async clearPriceCache() {
        return await this.delByPattern(`${KEY_PREFIX.PRICE}*`);
    }

    /**
     * @description 清空所有搜索缓存
     * @returns {Promise<number>} 删除的键数量
     */
    async clearSearchCache() {
        return await this.delByPattern(`${KEY_PREFIX.TICKET}search:*`);
    }

    // ==================== 状态 ====================

    /**
     * @description 获取缓存服务状态信息
     * @returns {{ connected: boolean, fallbackMode: boolean, fallbackSize: number, redisConfig: Object }} 状态信息
     */
    getStatus() {
        return {
            connected: this.isConnected,
            fallbackMode: !this.isConnected && this.fallbackEnabled,
            fallbackSize: this.fallbackCache.size,
            redisConfig: {
                host: REDIS_CONFIG.host,
                port: REDIS_CONFIG.port,
                db: REDIS_CONFIG.db
            }
        };
    }

    /**
     * @description 获取缓存统计信息，包括内存使用和数据库信息
     * @returns {Promise<Object>} 统计信息对象
     */
    async getStats() {
        try {
            if (!this.isConnected || !this.client) {
                return {
                    memoryCacheSize: this.fallbackCache.size,
                    mode: 'fallback'
                };
            }

            const info = await this.client.info('memory');
            const dbInfo = await this.client.info('keyspace');

            return {
                connected: true,
                mode: 'redis',
                memory: info,
                database: dbInfo
            };
        } catch (error) {
            return {
                connected: false,
                mode: 'fallback',
                fallbackSize: this.fallbackCache.size
            };
        }
    }
}

// ============================================================
// 模块名称：模块导出
// 功能说明：导出 Redis 缓存服务单例及配置常量
// ============================================================

// 导出单例实例
const redisCache = new RedisCacheService();

module.exports = redisCache;
module.exports.TTL = TTL;
module.exports.KEY_PREFIX = KEY_PREFIX;
module.exports.REDIS_CONFIG = REDIS_CONFIG;