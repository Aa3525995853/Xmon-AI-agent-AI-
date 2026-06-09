/**
 * @file test_audio_processing.js
 * @description 测试音频处理函数，验证 smoothPcm16 的 fadeOut、appendTailSilence、
 *   splitTextIntoSegments 等音频和文本处理函数的正确性
 * @module test
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const mimoTTS = require('../services/mimo_tts.js');

// ============================================================
// 模块：smoothPcm16 fadeOut 测试
// 功能说明：验证 PCM16 音频缓冲区的 fadeOut 渐变处理
// ============================================================

/** @constant {number} TEST_SAMPLE_COUNT - 测试用采样数 */
const TEST_SAMPLE_COUNT = 10;
/** @constant {number} TEST_SAMPLE_VALUE - 测试用采样值（固定幅度） */
const TEST_SAMPLE_VALUE = 10000;
/** @constant {number} FADE_OUT_SAMPLES - fadeOut 渐变采样数 */
const FADE_OUT_SAMPLES = 5;
/** @constant {number} TAIL_SILENCE_MS - 尾部静音时长（毫秒） */
const TAIL_SILENCE_MS = 60;
/** @constant {number} SAMPLE_RATE - 音频采样率（Hz） */
const SAMPLE_RATE = 24000;
/** @constant {number} SEGMENT_MAX_LENGTH - 文本分段最大字符长度 */
const SEGMENT_MAX_LENGTH = 20;

console.log('=== 测试音频处理函数 ===\n');

// 测试 smoothPcm16 的 fadeOut
console.log('1. 测试 smoothPcm16 fadeOut');
// 创建 20 字节缓冲区（10 个 16-bit 采样），全部填充固定值
const testBuffer = Buffer.alloc(TEST_SAMPLE_COUNT * 2);
for (let i = 0; i < TEST_SAMPLE_COUNT; i++) {
    testBuffer.writeInt16LE(TEST_SAMPLE_VALUE, i * 2);
}

const smoothed = mimoTTS.smoothPcm16(testBuffer, {
    fadeInSamples: 0,
    fadeOutSamples: FADE_OUT_SAMPLES,
    removeDc: false,
    softLimit: false
});

console.log('  原始buffer (前5个sample):');
for (let i = 0; i < 5; i++) {
    console.log(`    sample ${i}: ${testBuffer.readInt16LE(i * 2)}`);
}

console.log('  fadeOut后的buffer (后5个sample):');
for (let i = 5; i < 10; i++) {
    console.log(`    sample ${i}: ${smoothed.readInt16LE(i * 2)}`);
}

// 检查最后一个sample是否为0，若为0说明 fadeOut 过度导致爆音
const lastSample = smoothed.readInt16LE(18);
console.log(`  最后一个sample: ${lastSample}`);
if (lastSample === 0) {
    console.log('  ❌ 最后一个sample是0，可能产生爆音');
} else {
    console.log('  ✅ 最后一个sample不是0，渐变正确');
}

// ============================================================
// 模块：appendTailSilence 测试
// 功能说明：验证尾部静音追加功能
// ============================================================

// 测试 appendTailSilence
console.log('\n2. 测试 appendTailSilence');
const audioBuffer = Buffer.alloc(10);
for (let i = 0; i < 5; i++) {
    audioBuffer.writeInt16LE(TEST_SAMPLE_VALUE, i * 2);
}

const withSilence = mimoTTS.appendTailSilence(audioBuffer, SAMPLE_RATE, TAIL_SILENCE_MS);
console.log(`  原始buffer长度: ${audioBuffer.length} bytes`);
console.log(`  添加静音后长度: ${withSilence.length} bytes`);

// 检查静音buffer的开头是否有渐变
const silenceStart = audioBuffer.length;
console.log(`  静音部分前3个sample:`);
for (let i = 0; i < 3; i++) {
    console.log(`    sample ${i}: ${withSilence.readInt16LE(silenceStart + i * 2)}`);
}

// ============================================================
// 模块：splitTextIntoSegments 测试
// 功能说明：验证文本分段功能
// ============================================================

// 测试 splitTextIntoSegments
console.log('\n3. 测试 splitTextIntoSegments');
const testText = '你好！今天天气不错。要不要出去玩？';
const segments = mimoTTS.splitTextIntoSegments(testText, SEGMENT_MAX_LENGTH);
console.log(`  原始文本: "${testText}"`);
console.log(`  分段数: ${segments.length}`);
segments.forEach((seg, i) => {
    console.log(`    段 ${i + 1}: "${seg}"`);
});

// 检查最后一段是否只包含标点，纯标点段会导致 TTS 读出空白
const lastSeg = segments[segments.length - 1];
if (/^[。！？.!?]+$/.test(lastSeg)) {
    console.log('  ❌ 最后一段只包含标点');
} else {
    console.log('  ✅ 最后一段不只包含标点');
}

console.log('\n=== 测试完成 ===');
