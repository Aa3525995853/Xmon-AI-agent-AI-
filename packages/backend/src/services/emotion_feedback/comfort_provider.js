/**
 * @file comfort_provider.js
 * @description 安慰提供者 - 根据用户负面情绪生成安慰语，
 *              支持悲伤/愤怒/疲惫/担忧四种情绪，并根据关系亲密度调整语气
 * @module services/emotion_feedback
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义：情绪安慰语
// ============================================================

/** 各情绪对应的安慰语列表 */
const COMFORT_PHRASES = {
    sad: [
        '我理解你的感受。',
        '别难过，我在这里陪着你。',
        '低落的时候更要照顾好自己呀。'
    ],
    angry: [
        '消消气，不值得为这些伤神。',
        '我懂你，换我也会烦的。',
        '深呼吸，慢慢来～'
    ],
    tired: [
        '辛苦啦，先休息一下吧。',
        '你已经很努力了，适当休息是应该的。',
        '累了就说，我帮你分担～'
    ],
    worried: [
        '别担心，我们一起想办法。',
        '有什么事说出来，我帮你分析分析。',
        '放心，有我在呢。'
    ]
};

// ============================================================
// 常量定义：亲密度阈值
// ============================================================

/** 高亲密度阈值，超过此值时追加更亲密的安慰语 */
const HIGH_INTIMACY_THRESHOLD = 0.7;

// ============================================================
// ComfortProvider 类：安慰语生成
// ============================================================

class ComfortProvider {
    /**
     * @description 根据用户情绪生成安慰语，亲密度高时追加更亲密的表达
     * @param {string} userEmotion - 用户情绪（sad/angry/tired/worried）
     * @param {Object} [context={}] - 上下文
     * @param {number} [context.intimacy=0.5] - 关系亲密度 [0, 1]
     * @returns {string} 安慰语文本
     */
    generate(userEmotion, context = {}) {
        const phrases = COMFORT_PHRASES[userEmotion] || COMFORT_PHRASES.tired;
        const base = this.randomPick(phrases);

        // 根据关系程度调整，亲密度高时追加更亲密的安慰语
        const intimacy = context.intimacy || 0.5;
        if (intimacy > HIGH_INTIMACY_THRESHOLD) {
            return base + '要不休息一下，剩下的我帮你？';
        }

        return base;
    }

    /**
     * @description 从数组中随机选择一个元素
     * @param {Array} array - 候选数组
     * @returns {*} 随机选中的元素
     */
    randomPick(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

module.exports = new ComfortProvider();