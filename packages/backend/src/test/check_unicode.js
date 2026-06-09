/**
 * @file check_unicode.js
 * @description 检查特定字符的 Unicode 码点，验证中文字符和 Emoji 是否在
 *   预期的 Unicode 范围内，用于调试 Emoji 过滤正则表达式
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块：Unicode 码点检查
// 功能说明：输出字符的 Unicode 码点并判断是否在 Emoji 范围内
// ============================================================

/** @constant {string} heart - 中文字符"心"，用于验证是否被误判为 Emoji */
const heart = "心";
const codePoint = heart.codePointAt(0).toString(16).toUpperCase();
console.log(`"心" 的 Unicode: U+${codePoint}`);

/** @constant {string} emoji - Emoji 笑脸，用于验证 Emoji 码点范围 */
const emoji = "😊";
const emojiCodePoint = emoji.codePointAt(0).toString(16).toUpperCase();
console.log(`"😊" 的 Unicode: U+${emojiCodePoint}`);

/** @constant {string} party - Emoji 派对，用于验证 Emoji 码点范围 */
const party = "🎉";
const partyCodePoint = party.codePointAt(0).toString(16).toUpperCase();
console.log(`"🎉" 的 Unicode: U+${partyCodePoint}`);

// ============================================================
// 模块：Unicode 范围检查
// 功能说明：验证"心"字是否在 Emoji Unicode 范围 U+1F300-U+1F5FF 内
// ============================================================

console.log("\n范围检查:");
console.log(`U+1F300 = ${0x1F300}`);
console.log(`U+1F5FF = ${0x1F5FF}`);
console.log(`"心" 的码点 = ${heart.codePointAt(0)}`);
// "心"的码点为 0x5FC3，远小于 Emoji 范围起始值 0x1F300，不应被 Emoji 正则匹配
console.log(`"心" 在 U+1F300-U+1F5FF 范围内: ${heart.codePointAt(0) >= 0x1F300 && heart.codePointAt(0) <= 0x1F5FF}`);
