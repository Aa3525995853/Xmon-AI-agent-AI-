/**
 * @file sentence_processor.js
 * @description 句子分割、合并工具
 * @module utils
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */
const { SENTENCE_CONFIG } = require('../config/streamChatConfig');

/**
 * @description 按句子边界分割文本，超长句子按最大长度截断
 * @param {string} text - 待分割的文本
 * @returns {string[]} 分割后的句子数组
 */
function splitBySentence(text) {
    let sentences = [];
    let current = '';
    for (const char of text) {
        current += char;
        if (SENTENCE_CONFIG.boundary.test(char) || current.length >= SENTENCE_CONFIG.maxLength) {
            current = current.trim();
            if (current) sentences.push(current);
            current = '';
        }
    }
    if (current.trim()) sentences.push(current.trim());
    return sentences;
}

/**
 * @description 合并短句，避免过短文本单独调用 TTS
 * @param {string[]} sentences - 待合并的句子数组
 * @returns {string[]} 合并后的句子数组
 */
function mergeShortSentences(sentences) {
    if (sentences.length <= 1) return sentences;
    const merged = [];
    let buf = '';
    for (const s of sentences) {
        if (buf.length + s.length < SENTENCE_CONFIG.mergeThreshold) {
            buf += s;
        } else {
            if (buf) merged.push(buf);
            buf = s;
        }
    }
    if (buf) merged.push(buf);
    return merged;
}

module.exports = { splitBySentence, mergeShortSentences };