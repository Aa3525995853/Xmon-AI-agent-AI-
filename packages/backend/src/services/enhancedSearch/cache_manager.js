/**
 * @file cache_manager.js
 * @description 搜索缓存管理器 - 基于内存的 LRU 风格缓存，
 *              支持 TTL 过期淘汰和容量上限时的最老条目淘汰
 * @module services/enhancedSearch
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：缓存配置
// ============================================================

/** 缓存最大条目数 */
const MAX_CACHE_SIZE = 100;

/** 默认缓存过期时间（毫秒），1 小时 */
const DEFAULT_TTL = 3600000;

// ============================================================
// CacheManager 类：搜索缓存管理
// ============================================================

class CacheManager {
    constructor() {
        /** @type {Map<string, {data: *, timestamp: number, ttl: number}>} 缓存存储 */
        this.cache = new Map();
        this.maxSize = MAX_CACHE_SIZE;
        this.defaultTTL = DEFAULT_TTL;
    }

    /**
     * @description 获取缓存数据，过期条目自动删除
     * @param {string} key - 缓存键
     * @returns {*|null} 缓存数据，未命中或已过期返回 null
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) return null;

        // 检查是否过期
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    /**
     * @description 写入缓存，容量满时自动淘汰最老条目
     * @param {string} key - 缓存键
     * @param {*} data - 缓存数据
     * @param {number} [ttl] - 过期时间（毫秒），默认使用 defaultTTL
     */
    set(key, data, ttl = this.defaultTTL) {
        // 如果缓存已满，删除最老的条目
        if (this.cache.size >= this.maxSize) {
            this._evictOldest();
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    /**
     * @description 清理所有缓存
     * @returns {{removed: number}} 清理的条目数
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        return { removed: size };
    }

    /**
     * @description 淘汰最老的缓存条目（基于时间戳最小值）
     * @returns {void}
     */
    _evictOldest() {
        let oldest = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldest = key;
            }
        }

        if (oldest) {
            this.cache.delete(oldest);
        }
    }

    /**
     * @description 获取缓存统计信息
     * @returns {{size: number, maxSize: number, entries: Array<string>}} 缓存统计
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            entries: Array.from(this.cache.keys())
        };
    }
}

module.exports = new CacheManager();