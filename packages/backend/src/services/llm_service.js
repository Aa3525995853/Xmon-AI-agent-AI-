/**
 * @file llm_service.js
 * @description LLM 服务统一入口文件，加载并导出 LLM 服务主模块，
 *              负责意图检测、路由分发和响应整合
 * @module services/llm_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 架构：
 * ┌────────────────────────────────────────────┐
 * │              LLM Service                    │
 * │  意图检测 + 路由分发 + 响应整合              │
 * └────────────────────────────────────────────┘
 *                    ↓
 *           ┌────────────────────────┐
 *           │     子模块拆分          │
 *           ├────────────────────────┤
 *           │ main.js              │ ← 入口、路由
 *           │ context_manager.js   │ ← 上下文管理
 *           │ prompt_builder.js    │ ← 提示词构建
 *           │ providers/          │ ← LLM提供商
 *           │   ├── mimo_provider.js
 *           │   ├── kimi_provider.js
 *           │   └── workbrain_provider.js
 *           └────────────────────────┘
 */

// ============================================================
// 模块名称：LLM 服务入口
// 功能说明：加载并导出 LLM 服务主模块
// ============================================================

const LLMServiceMain = require('./llm_service/main');

// 导出 LLM 服务主模块
module.exports = LLMServiceMain;