/**
 * @file constants.js
 * @description 异常常量定义 - 定义异常自愈模块共用的严重级别、错误类别和重试策略常量，
 *              供其他 healer 子模块引用
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 严重级别定义
// ============================================================

/**
 * 异常严重级别枚举
 * - WARNING: 警告，不影响功能
 * - RECOVERABLE: 可恢复，系统可自动处理
 * - USER_REQUIRED: 需要用户介入
 * - FATAL: 致命错误，无法自动恢复
 */
const SeverityLevel = {
    WARNING: 'warning',
    RECOVERABLE: 'recoverable',
    USER_REQUIRED: 'user_required',
    FATAL: 'fatal'
};

// ============================================================
// 错误类别定义
// ============================================================

/**
 * 错误类别枚举，用于分类不同类型的异常
 */
const ErrorCategory = {
    NETWORK: 'network',
    PERMISSION: 'permission',
    RESOURCE: 'resource',
    FORMAT: 'format',
    TIMEOUT: 'timeout',
    NOT_FOUND: 'not_found',
    RATE_LIMIT: 'rate_limit',
    CAPTCHA: 'captcha',
    VALIDATION: 'validation',
    SYSTEM: 'system'
};

// ============================================================
// 重试策略定义
// ============================================================

/**
 * 各类错误的重试策略配置
 * - maxRetries: 最大重试次数
 * - delay: 初始延迟（毫秒）
 * - backoff: 退避倍数，每次重试延迟乘以此值
 * - errors: 触发该策略的错误关键字列表
 */
const RetryStrategies = {
    transient: {
        maxRetries: 3,
        delay: 500,
        backoff: 1.5,
        errors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']
    },
    rate_limit: {
        maxRetries: 5,
        delay: 5000,
        backoff: 2,
        errors: ['429', 'rate_limit', 'too many requests']
    },
    server_error: {
        maxRetries: 3,
        delay: 2000,
        backoff: 2,
        errors: ['500', '502', '503', '504', 'server error']
    },
    client_error: {
        maxRetries: 0,
        errors: ['400', '401', '403', '404', 'bad request']
    },
    network: {
        maxRetries: 4,
        delay: 1000,
        backoff: 1.8,
        errors: ['ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'network']
    }
};

module.exports = { SeverityLevel, ErrorCategory, RetryStrategies };