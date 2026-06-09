/**
 * @file test_textProcessor.js
 * @description 测试 textProcessor.js 的颜文字清理功能（cleanForTTS），
 *   验证颜文字在不同位置（开头、结尾、中间）以及复杂颜文字、Emoji、风格标签的清理效果
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const textProcessor = require('../utils/textProcessor.js');

// ============================================================
// 模块：cleanForTTS 测试用例
// 功能说明：定义和运行颜文字清理测试
// ============================================================

/**
 * @constant {Array<Object>} testCases - cleanForTTS 测试用例
 * @property {string} name - 测试用例名称
 * @property {string} input - 输入文本
 * @property {string} expected - 期望的清理结果
 */
const testCases = [
    {
        name: '颜文字在开头',
        input: '(｡♥‿♥｡) 你好呀！',
        expected: '你好呀！'
    },
    {
        name: '颜文字在结尾',
        input: '谢谢你！(｡♥‿♥｡)(✿◠‿◠)',
        expected: '谢谢你！'
    },
    {
        name: '颜文字在中间',
        input: '你好 (｡♥‿♥｡) 世界',
        expected: '你好 世界'
    },
    {
        name: '复杂颜文字',
        input: '(╯°□°）╯︵ ┻━┻ 这咋整啊？',
        expected: '这咋整啊？'
    },
    {
        name: 'Emoji + 颜文字',
        input: '你好！😊 (｡♥‿♥｡)',
        expected: '你好！'
    },
    {
        name: '带风格标签',
        input: '<style>台湾腔 温柔 撒娇</style>你好呀！(｡♥‿♥｡)',
        expected: '你好呀！'
    },
    {
        name: '正常文本',
        input: '今天天气真好！',
        expected: '今天天气真好！'
    }
];

console.log('=== 测试 textProcessor.cleanForTTS ===\n');

/** @type {number} 通过计数 */
let passCount = 0;
/** @type {number} 失败计数 */
let failCount = 0;

for (const test of testCases) {
    const result = textProcessor.cleanForTTS(test.input);
    const passed = result === test.expected;

    if (passed) {
        console.log(`✅ ${test.name}: 通过`);
        passCount++;
    } else {
        console.log(`❌ ${test.name}: 失败`);
        console.log(`   输入: "${test.input}"`);
        console.log(`   期望: "${test.expected}"`);
        console.log(`   实际: "${result}"`);
        failCount++;
    }
}

console.log(`\n=== 测试结果: ${passCount}/${testCases.length} 通过 ===`);

if (failCount === 0) {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
} else {
    console.log('\n❌ 部分测试失败');
    process.exit(1);
}
