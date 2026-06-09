/**
 * @file authRoutes.js
 * @description 认证 API 路由，处理用户注册、登录、登出、用户信息获取及
 *              管理员用户管理（列表/删除/角色修改）等功能
 * @module routes/authRoutes
 * @author 小梦团队
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const userDatabase = require('../services/user_database');
const { generateToken, authenticateToken } = require('../middleware/auth');

/** 用户名最小长度 */
const USERNAME_MIN_LENGTH = 3;

/** 用户名最大长度 */
const USERNAME_MAX_LENGTH = 20;

/** 用户名格式正则：字母数字下划线 */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

/** 密码最小长度 */
const PASSWORD_MIN_LENGTH = 6;

/** 允许的用户角色值 */
const VALID_ROLES = ['user', 'admin'];

// ============================================================
// 模块名称：公开认证 API
// 功能说明：用户注册与登录，无需认证即可访问
// ============================================================

/**
 * @description 用户注册，创建新用户并返回 JWT Token
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.username - 用户名（3-20字符，字母数字下划线）
 * @param {string} req.body.password - 密码（至少6字符）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, token: string, user: Object }
 * @throws {400} 用户名或密码为空 / 用户名格式错误 / 密码过短 / 用户名已存在
 * @throws {500} 注册失败
 */
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 输入验证
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }

        // 用户名格式验证：仅允许字母数字下划线，长度 3-20
        if (!USERNAME_PATTERN.test(username)) {
            return res.status(400).json({
                success: false,
                error: '用户名必须为3-20个字符，只能包含字母、数字和下划线'
            });
        }

        // 密码长度验证
        if (password.length < PASSWORD_MIN_LENGTH) {
            return res.status(400).json({
                success: false,
                error: '密码长度不能少于6个字符'
            });
        }

        // 创建用户
        const user = await userDatabase.createUser(username, password);

        // 生成 token
        const token = generateToken(user.userId, user.username);

        res.json({
            success: true,
            token,
            user: {
                userId: user.userId,
                username: user.username,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('[认证] 注册失败:', error.message);

        if (error.message === '用户名已存在') {
            return res.status(400).json({
                success: false,
                error: '用户名已被注册'
            });
        }

        res.status(500).json({
            success: false,
            error: '注册失败，请稍后重试'
        });
    }
});

/**
 * @description 用户登录，验证凭据并返回 JWT Token
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.username - 用户名
 * @param {string} req.body.password - 密码
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, token: string, user: Object }
 * @throws {400} 用户名或密码为空
 * @throws {401} 用户名或密码错误
 * @throws {500} 登录失败
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 输入验证
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }

        // 验证密码
        const user = await userDatabase.verifyPassword(username, password);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: '用户名或密码错误'
            });
        }

        // 更新最后登录时间
        userDatabase.updateLastLogin(user.userId);

        // 生成 token
        const token = generateToken(user.userId, user.username);

        res.json({
            success: true,
            token,
            user: {
                userId: user.userId,
                username: user.username,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('[认证] 登录失败:', error.message);
        res.status(500).json({
            success: false,
            error: '登录失败，请稍后重试'
        });
    }
});

// ============================================================
// 模块名称：需要认证的 API
// 功能说明：用户信息获取、登出及管理员用户管理
// ============================================================

/**
 * @description 获取当前登录用户的信息
 * @param {Object} req - Express 请求对象（需 authenticateToken 中间件）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, user: Object }
 * @throws {404} 用户不存在
 */
router.get('/me', authenticateToken, (req, res) => {
    const user = userDatabase.findUserById(req.user.userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            error: '用户不存在'
        });
    }

    res.json({
        success: true,
        user: {
            userId: user.userId,
            username: user.username,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin
        }
    });
});

/**
 * @description 用户登出，JWT 无状态模式，客户端自行清除 Token
 * @param {Object} req - Express 请求对象（需 authenticateToken 中间件）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, message: string }
 */
router.post('/logout', authenticateToken, (req, res) => {
    // JWT 无状态登出，服务器不存储 token
    // 客户端自行清除 localStorage 中的 token
    res.json({
        success: true,
        message: '已登出'
    });
});

// ============================================================
// 模块名称：管理员 API
// 功能说明：用户列表查询、用户删除及角色修改，需管理员权限
// ============================================================

/**
 * @description 获取用户列表，仅管理员可访问
 * @param {Object} req - Express 请求对象（需 authenticateToken + admin 角色）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, users: Array }
 * @throws {403} 需要管理员权限
 */
router.get('/users', authenticateToken, (req, res) => {
    // 管理员权限检查
    const currentUser = userDatabase.findUserById(req.user.userId);
    if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: '需要管理员权限'
        });
    }

    const users = userDatabase.getUserList();
    res.json({
        success: true,
        users
    });
});

/**
 * @description 删除指定用户，仅管理员可操作，且不能删除自己
 * @param {Object} req - Express 请求对象（需 authenticateToken + admin 角色）
 * @param {string} req.params.userId - 要删除的用户ID
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, message: string }
 * @throws {400} 不能删除自己
 * @throws {403} 需要管理员权限
 * @throws {404} 用户不存在
 */
router.delete('/users/:userId', authenticateToken, (req, res) => {
    // 管理员权限检查
    const currentUser = userDatabase.findUserById(req.user.userId);
    if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: '需要管理员权限'
        });
    }

    const { userId } = req.params;

    // 防止删除自己
    if (userId === req.user.userId) {
        return res.status(400).json({
            success: false,
            error: '不能删除自己'
        });
    }

    const success = userDatabase.deleteUser(userId);

    if (!success) {
        return res.status(404).json({
            success: false,
            error: '用户不存在'
        });
    }

    res.json({
        success: true,
        message: '用户已删除'
    });
});

/**
 * @description 修改用户角色，仅管理员可操作
 * @param {Object} req - Express 请求对象（需 authenticateToken + admin 角色）
 * @param {string} req.params.userId - 目标用户ID
 * @param {string} req.body.role - 新角色值（user 或 admin）
 * @param {Object} res - Express 响应对象
 * @returns {Object} { success: boolean, message: string }
 * @throws {400} 无效的角色值
 * @throws {403} 需要管理员权限
 * @throws {404} 用户不存在
 */
router.put('/users/:userId/role', authenticateToken, (req, res) => {
    // 管理员权限检查
    const currentUser = userDatabase.findUserById(req.user.userId);
    if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: '需要管理员权限'
        });
    }

    const { userId } = req.params;
    const { role } = req.body;

    // 验证角色值是否在允许范围内
    if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({
            success: false,
            error: '无效的角色值'
        });
    }

    const success = userDatabase.updateUserRole(userId, role);

    if (!success) {
        return res.status(404).json({
            success: false,
            error: '用户不存在'
        });
    }

    res.json({
        success: true,
        message: `用户角色已更新为 ${role === 'admin' ? '管理员' : '普通用户'}`
    });
});

module.exports = router;