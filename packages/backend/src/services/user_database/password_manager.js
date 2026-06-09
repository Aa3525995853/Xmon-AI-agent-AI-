/**
 * @file password_manager.js
 * @description 密码管理器 - 基于 bcrypt 的密码哈希和验证
 * @module services/user_database
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const bcrypt = require('bcryptjs');

/** bcrypt 盐轮数 - 越大越安全但越慢 */
const SALT_ROUNDS = 10;

class PasswordManager {
    /**
     * @description 对明文密码进行哈希
     * @param {string} password - 明文密码
     * @returns {Promise<string>} 哈希后的密码字符串
     */
    async hash(password) {
        return bcrypt.hash(password, SALT_ROUNDS);
    }

    /**
     * @description 验证明文密码与哈希是否匹配
     * @param {string} password - 明文密码
     * @param {string} hash - 哈希密码
     * @returns {Promise<boolean>} 是否匹配
     */
    async compare(password, hash) {
        return bcrypt.compare(password, hash);
    }
}

module.exports = new PasswordManager();