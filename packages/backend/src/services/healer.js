/**
 * @file healer.js
 * @description 异常自愈机制入口，负责任务执行过程中的异常检测、多路径重试
 *              和自动恢复，确保任务链路在遇到错误时能够优雅降级或自动修复
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const Healer = require("./healer/index");

module.exports = Healer;
