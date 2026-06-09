/**
 * @file cache.js
 * @description 请求缓存中间件，缓存重复请求的结果，减少API调用和计算资源消耗
 * @module middleware
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const crypto = require('crypto');
const securityAudit = require('../services/security_audit');

/** 内存缓存存储 */
const cacheStore = new Map();

/** 缓存配置 */
const CACHE_CONFIG = {
    /** 最大缓存条目数，超过时触发LRU淘汰 */
    maxSize: 1000,
    /** 默认TTL（毫秒），缓存条目超过此时间自动失效 */
    defaultTTL: 60 * 1000
};

/** 缓存统计信息 */
const cacheStats = {
    hits: 0,
    misses: 0,
    total: 0
};

/** 缓存清理间隔（毫秒），每5分钟清理一次过期缓存 */
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000;

/**
 * @description 安全的JSON字符串化，处理循环引用
 * @param {Object} obj - 要序列化的对象
 * @returns {string} JSON字符串
 */
function safeStringify(obj) {
    try {
        // 处理循环引用
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular]';
                }
                seen.add(value);
            }
            return value;
        });
    } catch (e) {
        return String(obj);
    }
}

/**
 * @description 生成缓存键，基于请求方法、URL和指定字段计算MD5哈希
 * @param {Object} req - Express请求对象
 * @param {Array} [keyFields=['body','query']] - 用于生成缓存键的字段
 * @returns {string} 缓存键（MD5哈希值）
 */
function generateCacheKey(req, keyFields = ['body', 'query']) {
    const keyParts = [];
    keyParts.push(req.method);
    keyParts.push(req.originalUrl || req.url);

    // 根据指定字段生成键
    for (const field of keyFields) {
        if (field === 'user' && req.user) {
            // 处理用户字段
            keyParts.push(`user:${req.user.id || req.user._id || 'anonymous'}`);
        } else if (req[field] && typeof req[field] === 'object' && Object.keys(req[field]).length > 0) {
            // 排序键值对以确保一致性
            const sorted = Object.keys(req[field]).sort().reduce((acc, k) => {
                acc[k] = req[field][k];
                return acc;
            }, {});
            keyParts.push(safeStringify(sorted));
        }
    }

    return crypto.createHash('md5').update(keyParts.join('|')).digest('hex');
}

/**
 * @description 清理过期缓存和LRU淘汰，保证缓存不超过最大限制
 */
function cleanupExpiredCache() {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of cacheStore) {
        if (entry.expiry < now) {
            cacheStore.delete(key);
            expiredCount++;
        }
    }

    // LRU淘汰：如果缓存超过最大限制，删除最旧的条目
    if (cacheStore.size > CACHE_CONFIG.maxSize) {
        const sortedEntries = [...cacheStore.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toDelete = sortedEntries.slice(0, cacheStore.size - CACHE_CONFIG.maxSize);
        for (const [key] of toDelete) {
            cacheStore.delete(key);
        }
        console.log(`[缓存] LRU淘汰: 删除了 ${toDelete.length} 个旧缓存项`);
    }

    if (expiredCount > 0) {
        console.log(`[缓存] 清理了 ${expiredCount} 个过期缓存项`);
    }
}

// 定期清理过期缓存
setInterval(cleanupExpiredCache, CACHE_CLEANUP_INTERVAL);

/**
 * @description 请求缓存中间件，拦截GET/POST请求并缓存成功响应
 * @param {Object} [options={}] - 缓存配置选项
 * @param {number} [options.ttl=60000] - 缓存有效期（毫秒）
 * @param {Array} [options.keyFields=['body']] - 用于生成缓存键的字段
 * @param {Function} [options.condition=null] - 自定义缓存条件函数
 * @param {boolean} [options.includeUser=false] - 是否根据用户区分缓存
 * @returns {Function} Express中间件
 */
function requestCache(options = {}) {
    const {
        ttl = 60 * 1000, // 默认1分钟
        keyFields = ['body'],
        condition = null,
        includeUser = false
    } = options;
    
    return (req, res, next) => {
        // 跳过非GET/POST请求
        if (!['GET', 'POST'].includes(req.method)) {
            return next();
        }

        // 安全审核：检查敏感内容，如果是则不缓存，直接返回
        if (req.body && req.body.message) {
            console.log(`[缓存] 检查安全: "${req.body.message}"`);
            const securityCheck = securityAudit.checkSensitiveContent(req.body.message);
            console.log(`[缓存] 安全检查结果: ${JSON.stringify(securityCheck)}`);
            if (securityCheck.isSensitive) {
                console.log(`[缓存] 安全审核拦截敏感内容，不缓存`);
                // 不缓存敏感请求，直接跳过缓存继续处理
                return next();
            }
        }

        // 检查自定义条件
        if (condition && !condition(req)) {
            return next();
        }
        
        // 生成缓存键
        const cacheFields = includeUser ? [...keyFields, 'user'] : keyFields;
        const cacheKey = generateCacheKey(req, cacheFields);
        
        // 检查缓存
        cacheStats.total++;
        const cached = cacheStore.get(cacheKey);
        
        if (cached && cached.expiry > Date.now()) {
            cacheStats.hits++;
            console.log(`[缓存命中] ${req.method} ${req.originalUrl} (命中率: ${(cacheStats.hits/cacheStats.total*100).toFixed(1)}%)`);

            // 设置缓存响应头
            res.set('X-Cache', 'HIT');
            res.set('X-Cache-TTL', Math.floor((cached.expiry - Date.now()) / 1000));

            // 返回缓存的响应（如果是Buffer需要复制一份）
            if (cached.contentType) {
                res.set('Content-Type', cached.contentType);
            }
            const dataToSend = Buffer.isBuffer(cached.data) ? Buffer.from(cached.data) : cached.data;
            return res.status(cached.statusCode).send(dataToSend);
        }
        
        cacheStats.misses++;
        console.log(`[缓存未命中] ${req.method} ${req.originalUrl}`);
        
        // 重写res.send以捕获响应
        const originalSend = res.send.bind(res);
        const originalJson = res.json.bind(res);
        
        // 标记响应是否已发送
        let responseSent = false;
        
        res.send = function(data) {
            if (responseSent) return originalSend(data);
            responseSent = true;

            // 先设置缓存响应头
            res.set('X-Cache', 'MISS');

            // 只缓存成功的响应
            if (res.statusCode >= 200 && res.statusCode < 300) {
                // 如果是Buffer，需要复制一份存储
                const dataToCache = Buffer.isBuffer(data) ? Buffer.from(data) : data;
                const cacheEntry = {
                    data: dataToCache,
                    statusCode: res.statusCode,
                    contentType: res.get('Content-Type'),
                    expiry: Date.now() + ttl,
                    timestamp: Date.now()
                };
                cacheStore.set(cacheKey, cacheEntry);
                console.log(`[缓存存储] ${req.method} ${req.originalUrl} (TTL: ${ttl}ms, 类型: ${Buffer.isBuffer(data) ? 'Buffer' : typeof data})`);
            } else {
                console.log(`[缓存跳过] ${req.method} ${req.originalUrl} - 状态码: ${res.statusCode}`);
            }

            return originalSend(data);
        };

        res.json = function(data) {
            if (responseSent) return originalJson(data);
            responseSent = true;

            // 先设置缓存响应头
            res.set('X-Cache', 'MISS');

            // 只缓存成功的响应
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const cacheEntry = {
                    data: data,
                    statusCode: res.statusCode,
                    contentType: 'application/json',
                    expiry: Date.now() + ttl,
                    timestamp: Date.now()
                };
                cacheStore.set(cacheKey, cacheEntry);
                console.log(`[缓存存储] ${req.method} ${req.originalUrl} (TTL: ${ttl}ms)`);
            } else {
                console.log(`[缓存跳过] ${req.method} ${req.originalUrl} - 状态码: ${res.statusCode}`);
            }

            return originalJson(data);
        };
        
        next();
    };
}

/**
 * @description 清除指定模式的缓存，支持正则匹配
 * @param {string|null} [pattern=null] - 缓存键匹配模式，null时清除所有缓存
 * @returns {number} 清除的缓存条目数
 */
function clearCache(pattern = null) {
    if (!pattern) {
        const count = cacheStore.size;
        cacheStore.clear();
        console.log(`[缓存] 清除了所有 ${count} 个缓存项`);
        return count;
    }
    
    const regex = new RegExp(pattern);
    let count = 0;
    
    for (const [key] of cacheStore) {
        if (regex.test(key)) {
            cacheStore.delete(key);
            count++;
        }
    }
    
    console.log(`[缓存] 清除了 ${count} 个匹配 "${pattern}" 的缓存项`);
    return count;
}

/**
 * 获取缓存统计信息
 */
function getCacheStats() {
    return {
        ...cacheStats,
        size: cacheStore.size,
        hitRate: cacheStats.total > 0 ? (cacheStats.hits / cacheStats.total * 100).toFixed(2) : 0
    };
}

/**
 * 获取缓存内容（用于调试）
 */
function getCacheContent() {
    const content = {};
    for (const [key, entry] of cacheStore) {
        content[key] = {
            expiry: new Date(entry.expiry).toISOString(),
            ttl: Math.floor((entry.expiry - Date.now()) / 1000),
            statusCode: entry.statusCode,
            dataPreview: typeof entry.data === 'string' 
                ? entry.data.substring(0, 100) 
                : JSON.stringify(entry.data).substring(0, 100)
        };
    }
    return content;
}

module.exports = {
    requestCache,
    clearCache,
    getCacheStats,
    getCacheContent,
    generateCacheKey
};
