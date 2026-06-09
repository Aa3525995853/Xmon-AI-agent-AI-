/**
 * @file cache_manager.js
 * @description 输入缓存管理器 - 管理输入处理结果的缓存，支持生成唯一输入ID
 * @module input_layer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const crypto = require('crypto');

class CacheManager {
    constructor() {
        /** @type {Map<string, Object>} 输入ID到处理结果的映射 */
        this.cache = new Map();
    }

    /**
     * @description 生成唯一的输入ID - 使用时间戳和随机字节确保唯一性
     * @returns {string} 唯一输入ID，格式：input_{时间戳36进制}_{8位hex}
     */
    generateId() {
        return `input_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * @description 设置缓存
     * @param {string} inputId - 输入ID
     * @param {Object} result - 处理结果
     */
    set(inputId, result) {
        this.cache.set(inputId, result);
    }

    /**
     * @description 获取缓存
     * @param {string} inputId - 输入ID
     * @returns {Object|undefined} 缓存的处理结果
     */
    get(inputId) {
        return this.cache.get(inputId);
    }

    /**
     * @description 删除指定缓存
     * @param {string} inputId - 输入ID
     */
    delete(inputId) {
        this.cache.delete(inputId);
    }

    /**
     * @description 清除所有缓存
     */
    clear() {
        this.cache.clear();
    }

    /**
     * @description 获取缓存大小
     * @returns {number} 缓存条目数
     */
    size() {
        return this.cache.size;
    }

    /**
     * @description 检查缓存是否存在
     * @param {string} inputId - 输入ID
     * @returns {boolean} 缓存是否有效
     */
    isValid(inputId) {
        return this.cache.has(inputId);
    }
}

module.exports = new CacheManager();