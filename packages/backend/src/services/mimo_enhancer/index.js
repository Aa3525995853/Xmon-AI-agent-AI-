/**
 * @file index.js
 * @description MiMoPromptEnhancer 主入口 - MiMo TTS 情绪增强器。
 *              自动分析文本情绪并注入表演指令标签，包括风格检测、情绪标签注入和呼吸点插入
 * @module mimo_enhancer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载：子模块按需引入
// ============================================================

/** @type {EmotionPatterns|null} 情绪模式匹配器延迟加载缓存 */
let _emotionPatterns = null;
/** @type {BreathInserter|null} 呼吸点插入器延迟加载缓存 */
let _breathInserter = null;
/** @type {NumberOralizer|null} 数字口语化处理器延迟加载缓存 */
let _numberOralizer = null;

/**
 * @description 延迟加载情绪模式匹配器
 * @returns {EmotionPatterns} 情绪模式匹配器实例
 */
function getEmotionPatterns() {
    if (!_emotionPatterns) _emotionPatterns = require('./emotion_patterns');
    return _emotionPatterns;
}

/**
 * @description 延迟加载呼吸点插入器
 * @returns {BreathInserter} 呼吸点插入器实例
 */
function getBreathInserter() {
    if (!_breathInserter) _breathInserter = require('./breath_inserter');
    return _breathInserter;
}

/**
 * @description 延迟加载数字口语化处理器
 * @returns {NumberOralizer} 数字口语化处理器实例
 */
function getNumberOralizer() {
    if (!_numberOralizer) _numberOralizer = require('./number_oralizer');
    return _numberOralizer;
}

// ============================================================
// 核心类：MiMoPromptEnhancer
// 功能说明：协调情绪检测、风格注入和呼吸点插入的文本增强
// ============================================================

class MiMoPromptEnhancer {

    /**
     * @description 构造函数，初始化子模块
     */
    constructor() {
        this.emotionPatterns = getEmotionPatterns();
        this.breathInserter = getBreathInserter();
        this.numberOralizer = getNumberOralizer();

        logger.info('[MiMo增强器] 初始化完成');
    }

    /**
     * @description 增强文本，添加风格标签、情绪标签和呼吸点。
     *              如果文本已包含 <style> 或情绪标签，则不重复添加
     * @param {string} text - 原始文本
     * @param {Object} [context={}] - 上下文信息
     * @returns {string} 增强后的文本
     */
    enhance(text, context = {}) {
        if (!text || text.trim().length === 0) {
            return text;
        }

        // 如果已经包含 <style> 标签，不重复添加风格
        const hasStyle = text.includes('<style>');

        // 1. 检测整体风格
        let style = '';
        if (!hasStyle) {
            style = this._detectStyle(text);
        }

        // 2. 在句首注入情绪标签（已有括号开头的情绪标签时不重复添加）
        const hasEmotionTag = /^[（\(]/.test(text.replace(/<style>.*?<\/style>/, '').trim());
        let emotionTag = '';
        if (!hasEmotionTag) {
            emotionTag = this.emotionPatterns.matchEmotion(text);
        }

        // 3. 长句智能断句并插入呼吸点
        const processedText = this.breathInserter.insert(text);

        return `${style}${emotionTag}${processedText}`;
    }

    /**
     * @description 根据文本特征检测整体风格
     * @param {string} text - 待检测文本
     * @returns {string} 风格标签，如 '<style>冷静</style>'，无匹配时返回空字符串
     * @private
     */
    _detectStyle(text) {
        if (/^[\d\s\.\-\+\%]+$/.test(text)) {
            return '<style>冷静</style>';
        } else if (text.length > 50) {
            return '<style>讲故事</style>';
        } else if (/[?!！？]{2,}/.test(text)) {
            return '<style>激动</style>';
        }
        return '';
    }

    /**
     * @description 完整处理流程：数字口语化 → 情绪增强 → 呼吸点插入
     * @param {string} text - 原始文本
     * @param {Object} [options={}] - 处理选项
     * @param {boolean} [options.oralizeNumbers=true] - 是否进行数字口语化
     * @param {boolean} [options.addEmotion=true] - 是否添加情绪标签
     * @param {boolean} [options.addBreathPoints=true] - 是否插入呼吸点
     * @returns {string} 处理后的文本
     */
    process(text, options = {}) {
        const {
            oralizeNumbers = true,
            addEmotion = true,
            addBreathPoints = true
        } = options;

        let result = text;

        // 1. 数字口语化
        if (oralizeNumbers) {
            result = this.numberOralizer.oralize(result);
        }

        // 2. 情绪增强
        if (addEmotion) {
            result = this.enhance(result, options);
        } else if (addBreathPoints) {
            result = this.breathInserter.insert(result);
        }

        return result;
    }
}

module.exports = new MiMoPromptEnhancer();