/**
 * @file text_cleaner.js
 * @description 文本清洗拦截器入口，委托给 text_cleaner/ 子目录中的模块，解决 TTS"读标签"问题，过滤动作标签保留风格标签
 * @module services/text_cleaner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const TextCleanerMain = require('./text_cleaner/index');

// 导出
module.exports = TextCleanerMain;