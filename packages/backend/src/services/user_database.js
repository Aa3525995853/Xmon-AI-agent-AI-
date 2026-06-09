/**
 * @file user_database.js
 * @description 用户数据库服务入口，委托给 user_database/ 子目录中的模块，提供用户数据持久化存储
 * @module services/user_database
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const UserDatabase = require("./user_database/index");

module.exports = UserDatabase;
