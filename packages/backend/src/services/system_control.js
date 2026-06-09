/**
 * @file system_control.js
 * @description 系统控制服务入口文件，委托给子模块处理系统控制功能，
 *              支持 LLM Function Calling 和规则匹配降级
 * @module services/system_control
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 架构：
 * ┌──────────────────────────────────────────┐
 * │            SystemControl                 │
 * │  工具定义 + 路由分发 + 日志管理            │
 * └──────────────────────────────────────────┘
 *                    ↓
 *           ┌───────────────────────┐
 *           │     子模块拆分         │
 *           ├───────────────────────┤
 *           │ system_control/main.js │ ← 主控制器
 *           │ app_tools.js          │ ← 应用启动、浏览器、搜索
 *           │ file_tools.js         │ ← 文件读写、目录操作
 *           │ system_tools.js       │ ← 窗口、音量、进程、系统
 *           │ rule_matcher.js       │ ← 规则匹配（降级方案）
 *           └───────────────────────┘
 *
 * 此文件作为入口，委托给子模块处理具体功能
 */

// ============================================================
// 模块名称：系统控制服务入口
// 功能说明：加载并导出系统控制主控制器
// ============================================================

const SystemControlMain = require('./system_control/main');

// 导出主控制器，外部通过此入口使用系统控制功能
module.exports = SystemControlMain;