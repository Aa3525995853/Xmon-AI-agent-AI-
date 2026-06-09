/**
 * @file index.js
 * @description UserDatabase 主入口 - 用户数据库服务，提供用户创建、验证、查询等操作
 * @module services/user_database
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataPath, ensureDir } = require('../../config/runtimePaths');

// ============================================================
// 延迟加载子模块 - 避免循环依赖
// ============================================================
let _passwordManager = null;
let _userManager = null;

/**
 * @description 获取密码管理器单例
 * @returns {PasswordManager} 密码管理器实例
 */
function getPasswordManager() {
    if (!_passwordManager) _passwordManager = require('./password_manager');
    return _passwordManager;
}

/**
 * @description 获取用户管理器单例
 * @returns {UserManager} 用户管理器实例
 */
function getUserManager() {
    if (!_userManager) _userManager = require('./user_manager');
    return _userManager;
}

class UserDatabase {
    constructor() {
        this.dataDir = dataPath('auth');
        this.dataPath = path.join(this.dataDir, 'users.json');

        this.passwordManager = getPasswordManager();
        this.userManager = getUserManager();

        this.ensureDataDir();
        this.ensureDataFile();

        logger.info('[用户数据库] 初始化完成');
    }

    /**
     * @description 确保数据目录存在
     * @returns {void}
     */
    ensureDataDir() {
        ensureDir(this.dataDir);
    }

    /**
     * @description 确保数据文件存在，不存在则创建空的用户数据文件
     * @returns {void}
     */
    ensureDataFile() {
        if (!fs.existsSync(this.dataPath)) {
            fs.writeFileSync(this.dataPath, JSON.stringify({ users: {} }, null, 2), 'utf8');
        }
    }

    /**
     * @description 生成 UUID v4
     * @returns {string} UUID 字符串
     */
    generateUUID() {
        return crypto.randomUUID();
    }

    /**
     * @description 加载用户数据文件
     * @returns {Object} 用户数据对象
     */
    loadData() {
        try {
            const content = fs.readFileSync(this.dataPath, 'utf8');
            return JSON.parse(content);
        } catch (e) {
            return { users: {} };
        }
    }

    /**
     * @description 保存数据（原子写入，先写临时文件再重命名，防止数据损坏）
     * @param {Object} data - 要保存的数据
     * @returns {void}
     */
    saveData(data) {
        const tmpPath = this.dataPath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmpPath, this.dataPath);
    }

    /**
     * @description 创建新用户
     * @param {string} username - 用户名
     * @param {string} password - 明文密码
     * @returns {Promise<Object>} 创建结果，包含 userId、username、createdAt
     * @throws {Error} 用户名已存在时抛出异常
     */
    async createUser(username, password) {
        const data = this.loadData();
        const users = data.users;

        // 检查用户名是否已存在
        const existingUser = this.userManager.findByUsername(users, username);
        if (existingUser) {
            throw new Error('用户名已存在');
        }

        // 生成用户ID
        const userId = this.generateUUID();

        // 加密密码
        const passwordHash = await this.passwordManager.hash(password);

        // 创建用户数据
        const newUser = {
            userId,
            username,
            passwordHash,
            role: 'user',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };

        // 保存到数据库
        users[userId] = newUser;
        this.saveData(data);

        // 创建用户数据目录
        this.userManager.createUserDirectory(userId);

        return {
            userId,
            username,
            createdAt: newUser.createdAt
        };
    }

    /**
     * @description 验证用户密码
     * @param {string} username - 用户名
     * @param {string} password - 明文密码
     * @returns {Promise<Object|null>} 验证成功返回用户信息，失败返回 null
     */
    async verifyPassword(username, password) {
        const data = this.loadData();
        const users = data.users;

        const user = this.userManager.findByUsername(users, username);
        if (!user) {
            return null;
        }

        const isValid = await this.passwordManager.compare(password, user.passwordHash);

        if (isValid) {
            return {
                userId: user.userId,
                username: user.username,
                createdAt: user.createdAt
            };
        }

        return null;
    }

    /**
     * @description 按用户ID查找用户
     * @param {string} userId - 用户ID
     * @returns {Object|undefined} 用户数据
     */
    findUserById(userId) {
        const data = this.loadData();
        return data.users[userId];
    }

    /**
     * @description 更新用户最后登录时间
     * @param {string} userId - 用户ID
     * @returns {void}
     */
    updateLastLogin(userId) {
        const data = this.loadData();
        if (data.users[userId]) {
            data.users[userId].lastLogin = new Date().toISOString();
            this.saveData(data);
        }
    }

    /**
     * @description 删除用户
     * @param {string} userId - 用户ID
     * @returns {boolean} 删除成功返回 true，用户不存在返回 false
     */
    deleteUser(userId) {
        const data = this.loadData();
        if (data.users[userId]) {
            delete data.users[userId];
            this.saveData(data);
            return true;
        }
        return false;
    }

    /**
     * @description 更新用户角色
     * @param {string} userId - 用户ID
     * @param {string} role - 新角色
     * @returns {boolean} 更新成功返回 true，用户不存在返回 false
     */
    updateUserRole(userId, role) {
        const data = this.loadData();
        if (data.users[userId]) {
            data.users[userId].role = role;
            this.saveData(data);
            return true;
        }
        return false;
    }

    /**
     * @description 获取用户列表（去除密码等敏感信息）
     * @returns {Array<Object>} 用户列表
     */
    getUserList() {
        const data = this.loadData();
        return this.userManager.getUserList(data.users);
    }
}

// 导出单例
module.exports = new UserDatabase();
