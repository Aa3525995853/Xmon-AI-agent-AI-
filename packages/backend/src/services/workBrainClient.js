/**
 * @file workBrainClient.js
 * @description 工作大脑客户端入口，委托给 workBrainClient/ 子目录中的模块，提供工作大脑连接和健康检查功能
 * @module services/workBrainClient
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const WorkBrainClient = require("./workBrainClient/index");

module.exports = WorkBrainClient;
module.exports.WorkBrainClient = WorkBrainClient.WorkBrainClient;
