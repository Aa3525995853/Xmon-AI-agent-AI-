/**
 * @file context_resolver.js
 * @description 上下文解析器入口，负责解析和补全对话上下文中的缺失信息，
 *              消除指代歧义，将模糊的用户意图转化为明确的可执行指令
 * @module services/context_resolver
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const ContextResolver = require("./context_resolver/index");

module.exports = ContextResolver;
