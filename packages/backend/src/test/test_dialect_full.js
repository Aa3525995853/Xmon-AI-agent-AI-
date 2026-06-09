/**
 * @file test_dialect_full.js
 * @description 完整测试方言 TTS 流程，模拟 LLM 返回多句响应的场景，
 *   验证每句经过 cleanForTTS 和 sanitizeTtsText 后颜文字是否被完全清理
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const mimoTTS = require('../services/mimo_tts.js');
const textCleaner = require('../services/text_cleaner.js');

// ============================================================
// 模块：多句方言 TTS 流程测试
// 功能说明：模拟完整 LLM 响应中的多句处理
// ============================================================

/**
 * @constant {Array<Object>} testCases - 完整方言 TTS 流程测试用例
 * @property {string} name - 测试用例名称
 * @property {string[]} sentences - 模拟的多句响应数组
 */
const testCases = [
    {
        name: '开头和结尾都有颜文字',
        sentences: [
            '(｡♥‿♥｡) 你好呀！',
            '今天天气不错呢～',
            '要不要一起去玩？(✿◠‿◠)'
        ]
    },
    {
        name: '只有结尾有颜文字',
        sentences: [
            '你好！',
            '今天很开心。',
            '谢谢你！(｡♥‿♥｡)(✿◠‿◠)'
        ]
    },
    {
        name: '颜文字在中间',
        sentences: [
            '你好！',
            '(｡♥‿♥｡) 今天天气不错 (✿◠‿◠)',
            '一起去玩吧！'
        ]
    },
    {
        name: '复杂颜文字',
        sentences: [
            '哎呀！',
            '(╯°□°）╯︵ ┻━┻ 这咋整啊？',
            '真是的！(´｡• ᵕ •｡`)'
        ]
    }
];

console.log('=== 完整测试方言TTS流程 ===\n');

for (const test of testCases) {
    console.log(`\n测试: ${test.name}`);
    console.log('='.repeat(50));
    
    for (let i = 0; i < test.sentences.length; i++) {
        const sentence = test.sentences[i];
        const isFirst = (i === 0);
        const isLast = (i === test.sentences.length - 1);
        
        console.log(`\n句子 ${i + 1}: "${sentence}"`);
        console.log(`  isFirst: ${isFirst}, isLast: ${isLast}`);
        
        // 1. textProcessor.cleanForTTS 清理（模拟 processSentenceTTS）
        const cleanSentence = textCleaner.cleanForTTS(sentence) || sentence;
        console.log(`  cleanForTTS: "${cleanSentence}"`);
        
        // 2. 检查是否还有颜文字（通过常见颜文字字符集匹配）
        const hasKaomoji = /[｡◠‿◕╯°□´•ᵕ✿♥┻━┳╮╭╰╯｡]/.test(cleanSentence);
        console.log(`  是否还有颜文字: ${hasKaomoji}`);
        
        // 3. 模拟 generateVoiceStreamCallback 的清理
        const finalText = mimoTTS.sanitizeTtsText(cleanSentence);
        console.log(`  sanitizeTtsText: "${finalText}"`);
        
        // 4. 检查最终是否还有颜文字
        const hasKaomojiFinal = /[｡◠‿◕╯°□´•ᵕ✿♥┻━┳╮╭╰╯｡]/.test(finalText);
        console.log(`  最终是否还有颜文字: ${hasKaomojiFinal}`);
        
        if (hasKaomojiFinal) {
            console.log(`  ❌ 警告: 颜文字未被完全清理！`);
        } else {
            console.log(`  ✅ 颜文字已清理`);
        }
    }
}

// ============================================================
// 模块：长文本分段测试
// 功能说明：验证长文本经过清理和分段后每段是否仍有残留颜文字
// ============================================================

console.log('\n\n=== 测试长文本分段 ===\n');

/** @constant {number} SEGMENT_MAX_LENGTH - 分段最大字符长度 */
const SEGMENT_MAX_LENGTH = 100;

// 模拟一个长文本，包含多个句子和颜文字
const longText = '你好呀！(｡♥‿♥｡) 今天天气真的超级好，阳光明媚，万里无云，特别适合出去玩呢～ (✿◠‿◠) 你要不要一起去公园走走呀？我们可以带点小零食，找个舒服的地方坐下来聊聊天，多惬意啊！(´｡• ᵕ •｡`) 真是太期待了！(｡♥‿♥｡)';

console.log('长文本:');
console.log(longText);
console.log('');

// 清理
const cleaned = textCleaner.cleanForTTS(longText);
console.log('cleanForTTS 清理后:');
console.log(cleaned);
console.log('');

// 分段
const segments = mimoTTS.splitTextIntoSegments(cleaned, SEGMENT_MAX_LENGTH);
console.log(`分成 ${segments.length} 段:`);
segments.forEach((seg, i) => {
    console.log(`\n段 ${i + 1}:`);
    console.log(`  内容: "${seg}"`);
    
    // 检查是否还有颜文字
    const hasKaomoji = /[｡◠‿◕╯°□´•ᵕ✿♥┻━┳╮╭╰╯｡]/.test(seg);
    console.log(`  是否还有颜文字: ${hasKaomoji}`);
    
    if (hasKaomoji) {
        console.log(`  ❌ 警告: 这段还有颜文字！`);
    } else {
        console.log(`  ✅ 这段颜文字已清理`);
    }
});
