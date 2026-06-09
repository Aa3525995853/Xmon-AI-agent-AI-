/**
 * @file debug_style.js
 * @description 调试 style 标签处理流程，逐步执行 text_cleaner 的每个清理阶段，
 *   观察中间结果，定位 style 标签和颜文字清理的问题
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const cleaner = require('../services/text_cleaner.js');

/** @constant {string} testInput - 包含 style 标签和颜文字的测试输入 */
const testInput = '<style>调皮</style>你好呀！(｡♥‿♥｡)';
console.log('输入:', testInput);
console.log('');

let cleaned = testInput;

// ============================================================
// 逐步执行 text_cleaner 的每个清理阶段
// 每一步输出中间结果，便于定位问题
// ============================================================

console.log('0. 原始:', cleaned);

// 步骤1：删除书面化停顿词和省略号
cleaned = cleaner.removeWrittenFillers(cleaned);
console.log('1. removeWrittenFillers:', cleaned);

// 步骤2：检测并移动游离的情绪词到前面加括号
cleaned = cleaner.detectAndMoveEmotionWord(cleaned);
console.log('2. detectAndMoveEmotionWord:', cleaned);

// 步骤3：删除CSS代码块和样式标签
cleaned = cleaner.removeCssCode(cleaned);
console.log('3. removeCssCode:', cleaned);

// 步骤4：删除HTML标签
cleaned = cleaner.removeHtmlTags(cleaned);
console.log('4. removeHtmlTags:', cleaned);

// 步骤5：删除代码块
cleaned = cleaner.removeCodeBlocks(cleaned);
console.log('5. removeCodeBlocks:', cleaned);

// 步骤6：提取并处理全局风格标签 <style>...</style>
cleaned = cleaner.extractAndNormalizeStyle(cleaned);
console.log('6. extractAndNormalizeStyle:', cleaned);

// 步骤7：删除所有表情符号（emoji）
cleaned = cleaner.removeEmojis(cleaned);
console.log('7. removeEmojis:', cleaned);

// 步骤8：删除所有圆括号内的标签（情绪标签不读出来）
cleaned = cleaner.removeAllActionTags(cleaned);
console.log('8. removeAllActionTags:', cleaned);

// 步骤9：清理多余空格和格式
cleaned = cleaner.cleanWhitespace(cleaned);
console.log('9. cleanWhitespace:', cleaned);

// 步骤10：确保风格标签在开头（但也要删除）
cleaned = cleaner.removeStyleTags(cleaned);
console.log('10. removeStyleTags:', cleaned);

console.log('');
console.log('最终结果:', cleaned);
console.log('期望结果: 你好呀！');
