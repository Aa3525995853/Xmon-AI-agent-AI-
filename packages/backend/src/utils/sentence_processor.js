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
 * @description 检测并提取数学公式，保护 $$...$$ 和 $...$ 公式不被拆分
 * 核心原则：
 * 1. 完整的公式（$$...$$ 或 $...$）作为一个整体输出
 * 2. 不完整的公式继续累积，不输出
 * 3. 句子边界只有在公式完成后才生效
 * @param {string} text - 待处理的文本
 * @returns {string[]} 处理后的句子数组
 */
function splitWithMathProtection(text) {
    if (!text) return [];

    // 提取所有完整公式
    const formulas = [];
    let i = 0;

    while (i < text.length) {
        // 检查块公式 $$
        if (text.slice(i, i + 2) === '$$') {
            const end = text.indexOf('$$', i + 2);
            if (end !== -1) {
                // 完整的 $$...$$
                formulas.push(text.slice(i, end + 2));
                i = end + 2;
                continue;
            }
            // 不完整，等待更多内容
            break;
        }

        // 检查行内公式 $
        if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) {
            let j = i + 1;
            while (j < text.length) {
                if (text[j] === '$' && text[j - 1] !== '\\') {
                    break;
                }
                j++;
            }
            if (j < text.length) {
                // 完整的 $...$
                formulas.push(text.slice(i, j + 1));
                i = j + 1;
                continue;
            }
            // 不完整，等待更多内容
            break;
        }

        // 普通字符，检查句子边界
        const char = text[i];
        if (SENTENCE_CONFIG.boundary.test(char)) {
            const sentence = text.slice(0, i + 1).trim();
            // 去除句子中的公式（因为公式会单独输出）
            const cleanSentence = removeFormulasFromText(sentence);
            if (cleanSentence) formulas.push(cleanSentence);
            text = text.slice(i + 1);
            i = 0;
            continue;
        }

        // 超长检查
        if (i >= SENTENCE_CONFIG.maxLength - 1) {
            const sentence = text.slice(0, i + 1).trim();
            const cleanSentence = removeFormulasFromText(sentence);
            if (cleanSentence) formulas.push(cleanSentence);
            text = text.slice(i + 1);
            i = 0;
            continue;
        }

        i++;
    }

    return formulas;
}

/**
 * @description 从文本中移除公式，保留普通文本
 * @param {string} text - 待处理的文本
 * @returns {string} 移除公式后的文本
 */
function removeFormulasFromText(text) {
    if (!text) return '';

    // 移除块公式
    text = text.replace(/\$\$[\s\S]*?\$\$/g, '');
    // 移除行内公式
    text = text.replace(/\$[^$\n]+?\$/g, '');

    return text.trim();
}

/**
 * @description 按句子边界分割文本，超长句子按最大长度截断，同时保护数学公式
 * @param {string} text - 待分割的文本
 * @returns {string[]} 分割后的句子数组
 */
function splitBySentence(text) {
    // 特殊处理包含公式的文本
    if (text.includes('$$') || text.includes('$')) {
        return splitWithMathProtection(text);
    }

    // 普通文本使用原有逻辑
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