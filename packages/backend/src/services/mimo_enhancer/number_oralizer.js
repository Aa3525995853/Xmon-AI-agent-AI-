/**
 * @file number_oralizer.js
 * @description 数字口语化处理器 - 将文本中的阿拉伯数字转换为口语化的中文表达，
 *              包括百分比、大数字等，使 TTS 朗读更自然
 * @module mimo_enhancer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义
// ============================================================

/** 中文数字字符表，用于个位数字的中文映射 */
const CHINESE_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 需要口语化处理的大数字最小位数（4位及以上百分比、5位及以上纯数字） */
const PERCENT_LARGE_DIGITS = 4;
const PURE_LARGE_DIGITS = 5;

// ============================================================
// 核心类：NumberOralizer
// 功能说明：将数字转换为口语化的中文表达
// ============================================================

class NumberOralizer {

    /**
     * @description 对文本中的数字进行口语化处理，包括百分比和大数字
     * @param {string} text - 原始文本
     * @returns {string} 口语化处理后的文本
     */
    oralize(text) {
        return text
            // 4位及以上的百分比 → "XX个百分点"
            .replace(/(\d{4,})%/g, (match, num) => {
                return this.toChinese(parseInt(num)) + '个百分点';
            })
            // 1-3位的百分比 → "百分之XX"
            .replace(/(\d+)%/g, (match, num) => {
                return '百分之' + this.toChinese(parseInt(num));
            })
            // 5位及以上的纯数字 → 中文大数字表达
            .replace(/(\d{5,})/g, (match, num) => {
                return this.toChinese(parseInt(num));
            });
    }

    /**
     * @description 将数字转换为中文大数字表达（亿/万/千级别）
     * @param {number} num - 待转换的数字
     * @returns {string} 中文大数字表达，如 "1.5亿"、"3.2万"
     */
    toChinese(num) {
        if (num >= 100000000) {
            return (num / 100000000).toFixed(1).replace('.0', '') + '亿';
        } else if (num >= 10000) {
            return (num / 10000).toFixed(1).replace('.0', '') + '万';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1).replace('.0', '') + '千';
        }
        return num.toString();
    }
}

module.exports = new NumberOralizer();