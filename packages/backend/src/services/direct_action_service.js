/**
 * @file direct_action_service.js
 * @description 直达服务入口，让用户一键完成任务，包括快捷搜索、快捷操作和意图识别，
 *              减少交互步骤，实现"说完就做完"的核心体验
 * @module services/direct_action_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/**
 * 直达服务架构：
 * ┌─────────────────────────────────────────────────┐
 * │         DirectActionService                    │
 * │  意图识别 + 搜索执行 + 工具执行              │
 * └─────────────────────────────────────────────────┘
 *                    ↓
 *           ┌─────────────────────┐
 *           │     子模块拆分       │
 *           ├─────────────────────┤
 *           │ index.js           │ ← 主入口
 *           │ intent_recognizer.js │ ← 意图识别
 *           │ search_executor.js   │ ← 搜索执行
 *           │ tool_executor.js    │ ← 工具执行
 *           └─────────────────────┘
 */

const DirectActionMain = require('./direct_action/index');

module.exports = DirectActionMain;