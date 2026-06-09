/**
 * @file test_emoji.js
 * @description 直接测试 text_cleaner 的 removeEmojis 函数，
 *   验证 Emoji 和颜文字的移除效果
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const cleaner = require('../services/text_cleaner.js');

/**
 * @constant {string[]} testCases - removeEmojis 测试输入列表
 *   包含 Emoji、颜文字、混合表情等场景
 */
const testCases = [
    '今天很开心 😊 你呢？🎉',
    '你好！(✿◠‿◠)',
    '(╯°□°）╯︵ ┻━┻ 生气了吗',
    '今天天气不错 😄🎊'
];

console.log('测试 removeEmojis:');
for (const test of testCases) {
    const result = cleaner.removeEmojis(test);
    console.log(`输入: "${test}"`);
    console.log(`输出: "${result}"`);
    console.log('');
}
