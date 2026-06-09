/**
 * @file mimo_tts.js
 * @description MiMo TTS（小米语音合成）入口文件，加载并导出 MiMo TTS 服务模块，
 *              支持情感标签、流式合成和音频优化
 * @module services/mimo_tts
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：MiMo TTS 入口
// 功能说明：加载并导出 MiMo TTS 服务模块
// ============================================================

const MimoTTSService = require("./mimo_tts/index");

module.exports = MimoTTSService;
