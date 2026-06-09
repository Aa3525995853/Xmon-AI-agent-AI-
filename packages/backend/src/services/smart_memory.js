/**
 * @file smart_memory.js
 * @description 智能记忆服务入口，委托给 smart_memory/ 子目录中的模块，提供自动提取用户信息和主动召回功能
 * @module services/smart_memory
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const SmartMemoryMain = require('./smart_memory/index');

module.exports = SmartMemoryMain;