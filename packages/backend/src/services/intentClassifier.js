/**
 * @file intentClassifier.js
 * @description 意图识别服务入口，负责将用户输入分类为对话意图或任务意图，
 *              支持复杂意图检测和工作大脑模式判断，并提供基于成功案例的学习能力
 * @module services/intentClassifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const IntentClassifier = require("./intentClassifier/index");

// ============================================================
// 模块导出：意图识别服务
// 功能说明：统一导出意图分类器实例及其核心方法和常量
// ============================================================

module.exports = IntentClassifier;
module.exports.classify = IntentClassifier.classify;
module.exports.isTaskIntent = IntentClassifier.isTaskIntent;
module.exports.isComplexIntent = IntentClassifier.isComplexIntent;
module.exports.needsWorkBrain = IntentClassifier.needsWorkBrain;
module.exports.learnFromSuccess = IntentClassifier.learnFromSuccess;
module.exports.TASK_KEYWORDS = IntentClassifier.TASK_KEYWORDS;
module.exports.TASK_KEYWORDS_EN = IntentClassifier.TASK_KEYWORDS_EN;
module.exports.COMPLEX_KEYWORDS = IntentClassifier.COMPLEX_KEYWORDS;
module.exports.TASK_PATTERNS = IntentClassifier.TASK_PATTERNS;
module.exports.TASK_PATTERNS_EN = IntentClassifier.TASK_PATTERNS_EN;
