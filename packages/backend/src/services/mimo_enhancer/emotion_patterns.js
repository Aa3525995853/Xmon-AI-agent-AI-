/**
 * @file emotion_patterns.js
 * @description 情绪模式匹配器 - 基于正则规则为文本匹配对应的情绪表演标签，
 *              按优先级排序，越靠前的模式越优先匹配
 * @module mimo_enhancer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义：情绪模式规则（按优先级排序）
// ============================================================

/**
 * 情绪模式匹配规则 - 每条规则包含正则表达式和对应的表演标签
 * @type {Array<{regex: RegExp, tag: string}>}
 */
const EMOTION_PATTERNS = [
    // 愤怒/强烈情绪
    { regex: /(?:滚|闭嘴|够了|受够了|去死|混蛋|该死)/, tag: '（愤怒，提高音量）' },
    // 惊讶/疑问
    { regex: /(?:真的吗|怎么可能|不会吧|天哪|我的天|啊\?+|什么\?+)/, tag: '（惊讶，迟疑）' },
    // 开心/愉悦
    { regex: /(?:哈哈|嘻嘻|太好了|太棒了|耶|好开心|真高兴)/, tag: '（开心地笑）' },
    // 冷漠/无奈
    { regex: /(?:算了|随便|无所谓|呵呵|哦|行吧|好吧)/, tag: '（冷笑，无奈）' },
    // 紧张/警告
    { regex: /(?:注意|小心|危险|别动|快跑|快点|赶紧)/, tag: '（紧张，低声急促）' },
    // 疲惫
    { regex: /(?:累|疲惫|困|熬|撑不住|好困|好累|受不了)/, tag: '（极其疲惫，有气无力）' },
    // 寒冷
    { regex: /(?:冷|冻|好凉|发抖|哆嗦)/, tag: '（寒冷导致的急促呼吸，发抖）' },
    // 悄悄话/秘密
    { regex: /(?:悄悄|小声|秘密|偷偷|别让.*知道)/, tag: '（压低声音，悄悄话）' },
    // 悲伤
    { regex: /(?:难过|伤心|哭|呜呜|对不起|抱歉|失望|遗憾)/, tag: '（悲伤，声音低沉）' },
    // 温柔/安慰
    { regex: /(?:别怕|没事|乖|哥哥|姐姐|亲爱的|放心)/, tag: '（温柔，轻声）' }
];

// ============================================================
// 核心类：EmotionPatterns
// 功能说明：基于正则的情绪标签匹配
// ============================================================

class EmotionPatterns {

    /**
     * @description 构造函数，初始化情绪模式列表
     */
    constructor() {
        this.patterns = EMOTION_PATTERNS;
    }

    /**
     * @description 根据文本内容匹配第一个命中的情绪标签
     * @param {string} text - 待匹配的文本内容
     * @returns {string} 匹配到的情绪表演标签，未匹配时返回空字符串
     */
    matchEmotion(text) {
        const matched = this.patterns.find(e => e.regex.test(text));
        return matched ? matched.tag : '';
    }

    /**
     * @description 获取所有情绪模式规则
     * @returns {Array<{regex: RegExp, tag: string}>} 情绪模式列表
     */
    getPatterns() {
        return this.patterns;
    }
}

module.exports = new EmotionPatterns();