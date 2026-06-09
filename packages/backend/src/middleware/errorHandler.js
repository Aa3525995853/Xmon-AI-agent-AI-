/**
 * @file errorHandler.js
 * @description 统一错误处理中间件，集中处理所有请求错误，提供统一的错误响应格式
 * @module middleware
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 自定义应用错误类
// ============================================================

/**
 * @description 自定义应用错误类，支持HTTP状态码和错误代码
 */
class AppError extends Error {
    /**
     * @description 构造函数
     * @param {string} message - 错误消息
     * @param {number} [statusCode=500] - HTTP状态码
     * @param {string} [code='INTERNAL_ERROR'] - 错误代码
     */
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

// ============================================================
// 常见错误类型定义
// ============================================================

/**
 * @description 常见错误类型映射，定义错误代码和对应的HTTP状态码
 */
const ErrorTypes = {
    VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 400 },
    AUTHENTICATION_ERROR: { code: 'AUTHENTICATION_ERROR', status: 401 },
    AUTHORIZATION_ERROR: { code: 'AUTHORIZATION_ERROR', status: 403 },
    NOT_FOUND_ERROR: { code: 'NOT_FOUND_ERROR', status: 404 },
    CONFLICT_ERROR: { code: 'CONFLICT_ERROR', status: 409 },
    RATE_LIMIT_ERROR: { code: 'RATE_LIMIT_ERROR', status: 429 },
    INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500 },
    SERVICE_UNAVAILABLE: { code: 'SERVICE_UNAVAILABLE', status: 503 },
    
    // 业务错误
    LLM_ERROR: { code: 'LLM_ERROR', status: 500 },
    TTS_ERROR: { code: 'TTS_ERROR', status: 500 },
    ASR_ERROR: { code: 'ASR_ERROR', status: 500 },
    SYSTEM_CONTROL_ERROR: { code: 'SYSTEM_CONTROL_ERROR', status: 500 }
};

// ============================================================
// 错误创建和全局处理
// ============================================================

/**
 * @description 创建特定类型的错误对象
 * @param {string} type - 错误类型（ErrorTypes中的键名）
 * @param {string} message - 错误消息
 * @param {*} [details=null] - 错误详情
 * @returns {AppError} 应用错误对象
 */
function createError(type, message, details = null) {
    const errorConfig = ErrorTypes[type] || ErrorTypes.INTERNAL_ERROR;
    const error = new AppError(message, errorConfig.status, errorConfig.code);
    if (details) {
        error.details = details;
    }
    return error;
}

/**
 * @description 全局错误处理中间件，识别不同类型的错误并返回统一格式的响应
 * @param {Error} err - 错误对象
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express next函数
 * @returns {void}
 */
function globalErrorHandler(err, req, res, next) {
    // 记录错误日志
    console.error('[全局错误]', {
        timestamp: new Date().toISOString(),
        url: req.url,
        method: req.method,
        error: err.message,
        code: err.code || 'UNKNOWN',
        status: err.statusCode || 500,
        stack: err.stack
    });

    // 处理自定义应用错误
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
            code: err.code,
            details: err.details || null
        });
    }

    // 处理验证错误（如 express-validator）
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: '验证错误',
            code: 'VALIDATION_ERROR',
            details: err.message
        });
    }

    // 处理语法错误（如 JSON 解析错误）
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            error: '请求格式错误',
            code: 'INVALID_JSON',
            details: '请求体必须是有效的 JSON'
        });
    }

    // 处理 Multer 文件上传错误
    if (err.name === 'MulterError') {
        return res.status(400).json({
            success: false,
            error: '文件上传错误',
            code: 'FILE_UPLOAD_ERROR',
            details: err.message
        });
    }

    // 处理 Axios 请求错误
    if (err.isAxiosError) {
        const status = err.response?.status || 500;
        const message = err.response?.data?.error || err.message;
        return res.status(status).json({
            success: false,
            error: '外部服务请求失败',
            code: 'EXTERNAL_SERVICE_ERROR',
            details: message
        });
    }

    // 默认错误响应 - 始终返回详细错误信息用于调试
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
        success: false,
        error: err.message,
        code: 'INTERNAL_ERROR',
        details: err.stack
    });
}

/**
 * @description 异步错误包装器，用于包装异步路由处理函数，自动捕获Promise拒绝
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} 包装后的路由处理函数
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * @description 错误日志记录器，输出结构化错误信息到控制台
 * @param {Error} err - 错误对象
 * @param {Object} [context={}] - 附加上下文信息
 */
function logError(err, context = {}) {
    console.error('[错误日志]', {
        timestamp: new Date().toISOString(),
        message: err.message,
        code: err.code || 'UNKNOWN',
        stack: err.stack,
        ...context
    });
}

module.exports = {
    AppError,
    ErrorTypes,
    createError,
    globalErrorHandler,
    asyncHandler,
    logError
};
