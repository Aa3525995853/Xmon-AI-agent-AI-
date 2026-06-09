/**
 * @file emotion_analyzer.js
 * @description 情感分析器 - 基于关键词匹配的文本情感检测，
 *              支持显式情感指定、情感强度分析和语气词提取
 * @module mimo_tts
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：情感关键词和强度词
// ============================================================

/** 情感关键词映射 - 每种情感对应一组触发关键词 */
const EMOTION_KEYWORDS = {
    开心: ['开心', '高兴', '快乐', '棒', '好', '喜欢', '爱', '哈哈', '嘻嘻', '耶', '太棒了', '真好', 'happy'],
    悲伤: ['难过', '伤心', '哭', '呜呜', '失望', '遗憾', '可惜', '对不起', '抱歉', 'sad'],
    生气: ['生气', '讨厌', '烦', '滚', '愤怒', '气死', '可恶', '混蛋', 'angry'],
    惊讶: ['啊', '哇', '天哪', '真的吗', '不会吧', '居然', '竟然', 'surprised'],
    温柔: ['亲爱的', '哥哥', '姐姐', '乖', '听话', '摸摸', '抱抱', '别怕', 'tender'],
    疑问: ['？', '?', '吗', '呢', '为什么', '怎么', '什么', '谁', '哪里', 'why'],
    调皮: ['哼', '才不', '骗人', '嘿嘿', 'playful'],
    悄悄话: ['悄悄', '小声', 'secret'],
    夹子音: ['撒娇', '夹子', 'cute']
};

/** 情感强度词映射 - 用于判断情感的强弱程度 */
const INTENSITY_WORDS = {
    强: ['太', '非常', '特别', '极其', '超级'],
    弱: ['有点', '稍微', '略微', '一点点']
};

// ============================================================
// 核心类：EmotionAnalyzer
// 功能说明：基于关键词的文本情感检测和分析
// ============================================================

class EmotionAnalyzer {

    /**
     * @description 构造函数，初始化情感映射和强度词
     */
    constructor() {
        this.emotionMap = EMOTION_KEYWORDS;
        this.intensityWords = INTENSITY_WORDS;
    }

    /**
     * @description 检测文本中的主要情感，优先使用显式指定的情感，
     *              否则通过关键词匹配计算各情感得分并返回最高分情感
     * @param {string} text - 待检测的文本内容
     * @param {string|null} [explicitEmotion=null] - 显式指定的情感类型
     * @returns {string} 检测到的情感类型，无法识别时返回 'neutral'
     */
    detect(text, explicitEmotion = null) {
        // 优先使用显式指定的情感
        if (explicitEmotion) {
            return this._validateEmotion(explicitEmotion);
        }

        const lowerText = text.toLowerCase();

        // 统计每个情感的关键词命中数
        const scores = {};
        for (const [emotion, keywords] of Object.entries(this.emotionMap)) {
            const count = keywords.filter(kw => lowerText.includes(kw.toLowerCase())).length;
            if (count > 0) {
                scores[emotion] = count;
            }
        }

        // 无任何关键词命中时返回中性情感
        if (Object.keys(scores).length === 0) {
            return 'neutral';
        }

        // 返回得分最高的情感
        const dominant = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])[0];

        return dominant[0];
    }

    /**
     * @description 验证情感类型是否在有效范围内
     * @param {string} emotion - 待验证的情感类型
     * @returns {string} 有效的情感类型，无效时返回 'neutral'
     * @private
     */
    _validateEmotion(emotion) {
        const validEmotions = Object.keys(this.emotionMap);
        return validEmotions.includes(emotion) ? emotion : 'neutral';
    }

    /**
     * @description 分析文本中的情感强度
     * @param {string} text - 待分析的文本内容
     * @returns {string} 情感强度等级（'强'/'弱'/'normal'）
     */
    detectIntensity(text) {
        const lowerText = text.toLowerCase();

        for (const [level, words] of Object.entries(this.intensityWords)) {
            if (words.some(w => lowerText.includes(w))) {
                return level;
            }
        }

        return 'normal';
    }

    /**
     * @description 提取文本中的中文语气词
     * @param {string} text - 待提取的文本内容
     * @returns {string[]} 找到的语气词列表
     */
    extractParticles(text) {
        const particles = ['呀', '呢', '啦', '哦', '啊', '嘛', '呗', '哈', '嘛'];
        const found = particles.filter(p => text.includes(p));
        return found;
    }

    /**
     * @description 获取所有支持的情感类型列表
     * @returns {string[]} 情感类型名称数组
     */
    getEmotions() {
        return Object.keys(this.emotionMap);
    }
}

module.exports = new EmotionAnalyzer();