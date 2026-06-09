/**
 * @file check_emoji.js
 * @description 检查 Emoji 字符的 Unicode 码点和范围，验证 Emoji 过滤正则表达式
 *   是否能正确匹配和替换 Emoji 字符
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块：Emoji Unicode 码点检查
// 功能说明：输出 🎉 的码点并检查其所属的 Unicode 范围
// ============================================================

/** @constant {string} party - Emoji 派对图标，用于码点范围验证 */
const party = "🎉";
console.log(`"🎉" 的码点: ${party.codePointAt(0)}`);
console.log(`"🎉" 的 Unicode: U+${party.codePointAt(0).toString(16).toUpperCase()}`);

/** @type {number} code - 🎉 的 Unicode 码点数值 */
const code = party.codePointAt(0);

// ============================================================
// 模块：Unicode 范围判断
// 功能说明：检查 🎉 所属的 Emoji Unicode 子范围
// ============================================================

console.log(`\n范围检查:`);
console.log(`U+1F300 = ${0x1F300} (${0x1F300.toString(16)})`);
console.log(`U+1F3FF = ${0x1F3FF} (${0x1F3FF.toString(16)})`);
console.log(`U+1F400 = ${0x1F400} (${0x1F400.toString(16)})`);
console.log(`U+1F4FF = ${0x1F4FF} (${0x1F4FF.toString(16)})`);
console.log(`U+1F500 = ${0x1F500} (${0x1F500.toString(16)})`);
console.log(`U+1F5FF = ${0x1F5FF} (${0x1F5FF.toString(16)})`);

// 🎉 的码点为 0x1F389，属于 Misc Symbols and Pictographs 范围 (U+1F300-U+1F3FF)
console.log(`\n"🎉" 在 U+1F300-U+1F3FF: ${code >= 0x1F300 && code <= 0x1F3FF}`);
console.log(`"🎉" 在 U+1F400-U+1F4FF: ${code >= 0x1F400 && code <= 0x1F4FF}`);
console.log(`"🎉" 在 U+1F500-U+1F5FF: ${code >= 0x1F500 && code <= 0x1F5FF}`);

// ============================================================
// 模块：Emoji 正则表达式测试
// 功能说明：验证多范围 Emoji 正则是否能正确匹配和替换
// ============================================================

/**
 * @constant {RegExp} emojiRegex - 覆盖多个 Unicode 范围的 Emoji 匹配正则，
 *   包含表情、交通、旗帜、杂项符号、修饰符等范围
 */
const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]|[\u{1F300}-\u{1F3FF}]|[\u{1F400}-\u{1F4FF}]|[\u{1F500}-\u{1F5FF}]/gu;
const test = "今天很开心 😊 你呢？🎉";
console.log(`\n测试正则:`);
console.log(`原始: "${test}"`);
console.log(`替换后: "${test.replace(emojiRegex, '')}"`);
