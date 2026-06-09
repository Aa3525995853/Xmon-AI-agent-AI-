/**
 * @file check_all_kaomoji.js
 * @description 检查所有可能的颜文字字符是否被 text_cleaner 正确清理，
 *   逐个测试常见颜文字字符和完整颜文字组合
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const textCleaner = require('../services/text_cleaner.js');
const mimoTTS = require('../services/mimo_tts.js');

// ============================================================
// 模块：单个颜文字字符检查
// 功能说明：逐个测试颜文字字符是否被 cleanForTTS 清理
// ============================================================

/**
 * @constant {string[]} kaomojiChars - 常见颜文字字符列表，
 *   用于逐个验证是否被文本清理函数正确移除
 */
const kaomojiChars = [
    '｡', '◠', '‿', '◕', '╯', '°', '□', '´', '•', 'ᵕ', '✿', '♥',
    '┻', '━', '┳', '╮', '╭', '╰', '╯', '︵', '･', 'ω', '・', '∀',
    '▽', '△', '▿', '▵', '◡', '⊙', '◉', '◐', '◑', '◒', '◓',
    '☆', '★', '✧', '✦', '♡', '♥', '❤', '❥', '❣', '❦', '❧'
];

console.log('=== 检查颜文字字符是否被清理 ===\n');

for (const char of kaomojiChars) {
    const testText = `你好${char}世界`;
    const cleaned = textCleaner.cleanForTTS(testText);
    const isCleaned = !cleaned.includes(char);
    
    if (!isCleaned) {
        console.log(`❌ 字符 "${char}" (U+${char.codePointAt(0).toString(16).toUpperCase()}) 未被清理`);
        console.log(`   原始: "${testText}"`);
        console.log(`   清理后: "${cleaned}"`);
    }
}

console.log('\n=== 测试常见颜文字 ===\n');

// ============================================================
// 模块：完整颜文字组合检查
// 功能说明：测试常见颜文字组合是否被 cleanForTTS 完全清理
// ============================================================

/**
 * @constant {string[]} commonKaomojis - 常见颜文字组合列表，
 *   用于验证完整颜文字是否被清理函数完全移除
 */
const commonKaomojis = [
    '(｡♥‿♥｡)',
    '(╯°□°）╯︵ ┻━┻',
    '(´｡• ᵕ •｡`)',
    '(✿◠‿◠)',
    '(◕‿◕)',
    '(･ω･)',
    '(・∀・)',
    '(´▽｀)',
    '(｀▽´)',
    '(´△｀)',
    '(｀△´)',
    '(´▵｀)',
    '(｀▵´)',
    '(´▿｀)',
    '(｀▿´)',
    '(´◡｀)',
    '(｀◡´)',
    '(´⊙｀)',
    '(｀⊙´)',
    '(´◉｀)',
    '(｀◉´)',
    '(´◐｀)',
    '(｀◐´)',
    '(´◑｀)',
    '(｀◑´)',
    '(´☆｀)',
    '(｀☆´)',
    '(´★｀)',
    '(｀★´)',
    '(´✧｀)',
    '(｀✧´)',
    '(´✦｀)',
    '(｀✦´)',
    '(´♡｀)',
    '(｀♡´)',
    '(´♥｀)',
    '(｀♥´)',
    '(´❤｀)',
    '(｀❤´)',
    '(´❥｀)',
    '(｀❥´)',
    '(´❣｀)',
    '(｀❣´)',
    '(´❦｀)',
    '(｀❦´)',
    '(´❧｀)',
    '(｀❧´)'
];

for (const kaomoji of commonKaomojis) {
    const testText = `你好${kaomoji}世界`;
    const cleaned = textCleaner.cleanForTTS(testText);
    const hasKaomoji = /[｡◠‿◕╯°□´•ᵕ✿♥┻━┳╮╭╰╯･ω・∀▽△▿▵◡⊙◉◐◑◒◓☆★✧✦♡❤❥❣❦❧]/.test(cleaned);
    
    if (hasKaomoji) {
        console.log(`❌ 颜文字 "${kaomoji}" 未被完全清理`);
        console.log(`   原始: "${testText}"`);
        console.log(`   清理后: "${cleaned}"`);
    }
}

console.log('\n✅ 颜文字检查完成');
