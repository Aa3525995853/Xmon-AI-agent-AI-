/**
 * @file mimo_enhancer.js
 * @description MiMo TTS 情绪增强器入口文件，加载并导出情绪增强模块，
 *              用于在 TTS 文本中插入情感标签以实现情感化语音输出
 * @module services/mimo_enhancer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：MiMo 情绪增强器入口
// 功能说明：加载并导出 MiMoPromptEnhancer 模块
// ============================================================

const MiMoPromptEnhancer = require("./mimo_enhancer/index");

module.exports = MiMoPromptEnhancer;
