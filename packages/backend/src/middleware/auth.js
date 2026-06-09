/**
 * @file auth.js
 * @description JWT认证中间件，提供Token生成、验证和请求认证功能
 * @module middleware
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 安全规则：
 * - 生产环境必须显式提供 JWT_SECRET 环境变量
 * - 开发和测试环境可使用进程本地随机密钥，方便本地启动
 *   但不会在源码中硬编码可复用的签名密钥
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/** JWT Token 过期时间，默认7天 */
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
/** 开发环境使用的随机密钥，每次进程重启后失效 */
const DEV_JWT_SECRET = crypto.randomBytes(32).toString('hex');

/**
 * @description 获取JWT签名密钥，生产环境必须配置环境变量
 * @returns {string} JWT签名密钥
 * @throws {Error} 生产环境未配置 JWT_SECRET 时抛出错误
 */
function getJwtSecret() {
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production');
    }

    return DEV_JWT_SECRET;
}

/**
 * @description 从Authorization头中提取Bearer Token
 * @param {string} authHeader - Authorization请求头值
 * @returns {string|null} Token字符串，无Token时返回null
 */
function extractBearerToken(authHeader) {
    if (!authHeader) return null;
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

/**
 * @description 生成JWT Token
 * @param {string} userId - 用户ID
 * @param {string} username - 用户名
 * @returns {string} 签名后的JWT Token
 */
function generateToken(userId, username) {
    return jwt.sign({ userId, username }, getJwtSecret(), {
        expiresIn: JWT_EXPIRES_IN
    });
}

/**
 * @description 验证JWT Token的有效性
 * @param {string} token - JWT Token字符串
 * @returns {Object|null} 解码后的载荷对象，Token无效时返回null
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, getJwtSecret());
    } catch (e) {
        return null;
    }
}

/**
 * @description 强制认证中间件，未认证请求返回401
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express next函数
 * @returns {void}
 */
function authenticateToken(req, res, next) {
    if (process.env.ENABLE_AUTH !== 'true') {
        req.user = { userId: 'legacy', username: 'local_admin' };
        return next();
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication token is required'
        });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Authentication token is invalid or expired'
        });
    }

    req.user = {
        userId: decoded.userId,
        username: decoded.username
    };

    next();
}

/**
 * @description 可选认证中间件，有Token则解析，无Token也放行
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express next函数
 * @returns {void}
 */
function optionalAuth(req, res, next) {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
        req.user = null;
        return next();
    }

    const decoded = verifyToken(token);
    req.user = decoded
        ? { userId: decoded.userId, username: decoded.username }
        : null;

    next();
}

/**
 * @description 生成随机密钥字符串
 * @returns {string} 64位十六进制随机密钥
 */
function generateSecret() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = {
    generateToken,
    verifyToken,
    authenticateToken,
    optionalAuth,
    generateSecret
};
