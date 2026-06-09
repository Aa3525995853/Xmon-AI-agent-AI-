/**
 * @file breath_inserter.js
 * @description 呼吸点插入器 - 在长句中标点后插入轻吸气标记，
 *              使 TTS 语音更自然，避免机器感
 * @module mimo_enhancer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义
// ============================================================

/** 单段文本中最多插入的呼吸点数量，避免过度插入 */
const MAX_INSERTS = 2;

/** 触发呼吸点插入的最小后续文字长度 */
const MIN_REST_LENGTH = 15;

/** 触发呼吸点插入的最大后续文字长度 */
const MAX_REST_LENGTH = 25;

// ============================================================
// 核心类：BreathInserter
// 功能说明：在标点后的长句中智能插入呼吸标记
// ============================================================

class BreathInserter {

    /**
     * @description 在合适的位置插入呼吸声标记，避免机器感。
     *              仅在逗号/句号/分号后、且后续文字超过15字的位置插入
     * @param {string} text - 原始文本
     * @returns {string} 插入呼吸点后的文本
     */
    insert(text) {
        let result = text;
        let insertCount = 0;

        // 在标点后、后续15-25字的段落前插入呼吸标记
        result = result.replace(/([，。；])((?:[^，。；！？]{15,25}))/g, (match, punct, rest) => {
            if (insertCount >= MAX_INSERTS) {
                return match;
            }
            insertCount++;
            return `${punct}（轻吸气）${rest}`;
        });

        return result;
    }
}

module.exports = new BreathInserter();