/**
 * @file test_tts_fix.js
 * @description TTS 修复测试脚本，验证颜文字过滤、Emoji 过滤、文本清理等功能
 *   分别测试 text_cleaner.js 的 cleanForTTS 和 mimo_tts.js 的 sanitizeTtsText
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const path = require('path');

// ============================================================
// 模块：text_cleaner.js 测试
// 功能说明：验证 text_cleaner.cleanForTTS 的颜文字、Emoji、风格标签清理能力
// ============================================================

console.log('=== 测试 text_cleaner.js ===\n');

const cleaner = require('../services/text_cleaner.js');

/**
 * @constant {Array<Object>} testCases - text_cleaner 测试用例
 * @property {string} name - 测试用例名称
 * @property {string} input - 输入文本
 * @property {string} expected - 期望的清理结果
 */
const testCases = [
    {
        name: '颜文字过滤',
        input: '你好呀！(｡♥‿♥｡) 今天天气不错呢',
        expected: '你好呀！今天天气不错呢'
    },
    {
        name: '复杂颜文字',
        input: '(╯°□°）╯︵ ┻━┻ 生气了吗 (´｡• ᵕ •｡`)',
        expected: '生气了吗'
    },
    {
        name: 'Emoji 过滤',
        input: '今天很开心 😊 你呢？🎉',
        expected: '今天很开心 你呢？'
    },
    {
        name: '混合表情',
        input: '你好！(✿◠‿◠) 今天怎么样？😄',
        expected: '你好！今天怎么样？'
    },
    {
        name: '括号动作标签',
        input: '（微笑）你好呀（挥手）',
        expected: '你好呀'
    },
    {
        name: '正常文本',
        input: '今天天气真好，我们一起去公园玩吧！',
        expected: '今天天气真好，我们一起去公园玩吧！'
    },
    {
        name: '带风格标签',
        input: '<style>调皮</style>你好呀！(｡♥‿♥｡)',
        expected: '你好呀！'
    }
];

/** @type {number} text_cleaner 通过计数 */
let passCount = 0;
/** @type {number} text_cleaner 失败计数 */
let failCount = 0;

for (const test of testCases) {
    const result = cleaner.cleanForTTS(test.input);
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

console.log(`\n=== text_cleaner 测试结果: ${passCount}/${testCases.length} 通过 ===\n`);

// ============================================================
// 模块：mimo_tts.js sanitizeTtsText 测试
// 功能说明：验证 mimoTTS.sanitizeTtsText 的清理能力（保留风格标签）
// ============================================================
console.log('=== 测试 mimo_tts.js sanitizeTtsText ===\n');

const mimoTTS = require('../services/mimo_tts.js');

/**
 * @constant {Array<Object>} mimoTestCases - mimo_tts sanitizeTtsText 测试用例
 * @property {string} name - 测试用例名称
 * @property {string} input - 输入文本
 * @property {string} expected - 期望的清理结果
 */
const mimoTestCases = [
    {
        name: '颜文字过滤',
        input: '你好呀！(｡♥‿♥｡)',
        expected: '你好呀！'
    },
    {
        name: '风格标签保留',
        input: '<style>调皮</style>你好呀！',
        expected: '<style>调皮</style>你好呀！'
    },
    {
        name: '复杂颜文字',
        input: '(╯°□°）╯︵ ┻━┻ 生气了',
        expected: '生气了'
    }
];

/** @type {number} mimo_tts 通过计数 */
let mimoPassCount = 0;
/** @type {number} mimo_tts 失败计数 */
let mimoFailCount = 0;

for (const test of mimoTestCases) {
    const result = mimoTTS.sanitizeTtsText(test.input);
    const passed = result === test.expected;

    if (passed) {
        console.log(`✅ ${test.name}: 通过`);
        mimoPassCount++;
    } else {
        console.log(`❌ ${test.name}: 失败`);
        console.log(`   输入: "${test.input}"`);
        console.log(`   期望: "${test.expected}"`);
        console.log(`   实际: "${result}"`);
        mimoFailCount++;
    }
}

console.log(`\n=== mimo_tts 测试结果: ${mimoPassCount}/${mimoTestCases.length} 通过 ===\n`);

// ============================================================
// 模块：测试总结
// 功能说明：汇总两个模块的测试结果，全部通过退出码0，否则退出码1
// ============================================================
console.log('=== 测试总结 ===');
console.log(`text_cleaner: ${passCount}/${testCases.length} 通过`);
console.log(`mimo_tts: ${mimoPassCount}/${mimoTestCases.length} 通过`);

if (failCount === 0 && mimoFailCount === 0) {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
} else {
    console.log('\n❌ 部分测试失败，请检查修复');
    process.exit(1);
}
