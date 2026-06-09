/**
 * @file rateLimiter.js
 * @description 请求限流中间件，防止API被恶意请求攻击，保护服务器资源
 * @module middleware
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const rateLimit = require('express-rate-limit');

// ============================================================
// 预定义限流器：不同API端点的限流配置
// ============================================================

/**
 * @description 通用API限流配置，每IP每分钟300个请求
 */
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    message: {
        success: false,
        error: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_ERROR',
        retryAfter: 10
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`[限流] IP ${req.ip} 请求过于频繁: ${req.url}`);
        res.status(429).json(options.message);
    },
    skip: (req) => {
        return req.path === '/health' || req.path === '/api/health' || req.path.startsWith('/api/growth') || req.path.startsWith('/api/task') || req.path.startsWith('/api/digest') || req.path.startsWith('/api/direct') || req.path.startsWith('/api/memory') || req.path.startsWith('/api/proactive');
    }
});

/**
 * @description 聊天API限流配置，每IP每分钟60个请求（更严格）
 */
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: {
        success: false,
        error: '聊天请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_ERROR',
        retryAfter: 10
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`[限流] IP ${req.ip} 聊天请求过于频繁: ${req.url}`);
        res.status(429).json(options.message);
    }
});

/**
 * @description TTS API限流配置，每IP每分钟60个请求（中等限制）
 */
const ttsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: {
        success: false,
        error: 'TTS请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_ERROR',
        retryAfter: 10
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`[限流] IP ${req.ip} TTS请求过于频繁: ${req.url}`);
        res.status(429).json(options.message);
    }
});

/**
 * @description 严格限流配置，用于敏感操作，每IP每小时10个请求
 */
const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1小时
    max: 10, // 每小时最多10个请求
    message: {
        success: false,
        error: '操作过于频繁，请稍后再试',
        code: 'RATE_LIMIT_ERROR',
        retryAfter: 3600
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`[限流] IP ${req.ip} 敏感操作过于频繁: ${req.url}`);
        res.status(429).json(options.message);
    }
});

// ============================================================
// 自定义限流器构建
// ============================================================

/**
 * @description 创建自定义限流器
 * @param {Object} [options={}] - 限流配置选项
 * @param {number} [options.windowMs=60000] - 时间窗口（毫秒）
 * @param {number} [options.max=60] - 窗口内最大请求数
 * @returns {Function} express-rate-limit 中间件
 */
function createCustomLimiter(options = {}) {
    const defaultOptions = {
        windowMs: 60 * 1000,
        max: 60,
        message: {
            success: false,
            error: '请求过于频繁',
            code: 'RATE_LIMIT_ERROR'
        },
        standardHeaders: true,
        legacyHeaders: false
    };

    return rateLimit({
        ...defaultOptions,
        ...options
    });
}

module.exports = {
    generalLimiter,
    chatLimiter,
    ttsLimiter,
    strictLimiter,
    createCustomLimiter
};
