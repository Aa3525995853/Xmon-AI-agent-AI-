/**
 * @file test_dialect.js
 * @description 测试方言 TTS 文本清理功能，验证不同方言（台湾腔、东北话、四川话）
 *   带颜文字的文本经过 textCleaner 和 mimoTTS 清理后的效果
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const mimoTTS = require('../services/mimo_tts.js');
const textCleaner = require('../services/text_cleaner.js');

// ============================================================
// 模块：方言 TTS 文本清理测试
// 功能说明：验证各方言带颜文字文本的清理效果
// ============================================================

/**
 * @constant {Array<Object>} testCases - 方言 TTS 清理测试用例
 * @property {string} name - 测试用例名称
 * @property {string} input - 输入文本（含风格标签和颜文字）
 * @property {string|null} dialect - 方言标识（taiwan/dongbei/sichuan/null）
 */
const testCases = [
    {
        name: '台湾腔带颜文字',
        input: '<style>台湾腔 温柔 撒娇</style>你好呀！(｡♥‿♥｡) 今天天气不错呢～',
        dialect: 'taiwan'
    },
    {
        name: '东北话带颜文字',
        input: '<style>东北话 开心 调皮</style>哎呀妈呀！(╯°□°）╯︵ ┻━┻ 这咋整啊？',
        dialect: 'dongbei'
    },
    {
        name: '四川话带颜文字',
        input: '<style>四川话 俏皮 温柔</style>巴适得板！(✿◠‿◠) 要不要得嘛？',
        dialect: 'sichuan'
    },
    {
        name: '复杂颜文字组合',
        input: '你好！(｡♥‿♥｡) 今天很开心 😊 你呢？🎉 (´｡• ᵕ •｡`)',
        dialect: null
    }
];

console.log('=== 测试方言TTS文本清理 ===\n');

for (const test of testCases) {
    console.log(`测试: ${test.name}`);
    console.log(`输入: "${test.input}"`);
    
    // 1. textProcessor.cleanForTTS 清理
    const clean1 = textCleaner.cleanForTTS(test.input);
    console.log(`textCleaner.cleanForTTS: "${clean1}"`);
    
    // 2. mimoTTS.sanitizeTtsText 清理
    const clean2 = mimoTTS.sanitizeTtsText(test.input);
    console.log(`mimoTTS.sanitizeTtsText: "${clean2}"`);
    
    console.log('');
}

// ============================================================
// 模块：长文本分段测试
// 功能说明：验证长文本经过清理和分段后的效果
// ============================================================

/** @constant {number} SEGMENT_MAX_LENGTH - 分段最大字符长度 */
const SEGMENT_MAX_LENGTH = 100;

console.log('=== 测试长文本分段 ===\n');

/**
 * @constant {string} longText - 包含多句和颜文字的长文本，用于测试分段处理
 */
const longText = '<style>台湾腔 温柔 撒娇</style>你好呀！(｡♥‿♥｡) 今天天气真的超级好，阳光明媚，万里无云，特别适合出去玩呢～ (✿◠‿◠) 你要不要一起去公园走走呀？我们可以带点小零食，找个舒服的地方坐下来聊聊天，多惬意啊！(´｡• ᵕ •｡`)';

console.log('长文本输入:');
console.log(longText);
console.log('');

const cleaned = mimoTTS.sanitizeTtsText(longText);
console.log('清理后:');
console.log(cleaned);
console.log('');

// 模拟分段
// 使用常量 SEGMENT_MAX_LENGTH 作为分段最大长度
const segments = mimoTTS.splitTextIntoSegments(cleaned, SEGMENT_MAX_LENGTH);
console.log(`分成 ${segments.length} 段:`);
segments.forEach((seg, i) => {
    console.log(`  段 ${i + 1}: "${seg}"`);
});
