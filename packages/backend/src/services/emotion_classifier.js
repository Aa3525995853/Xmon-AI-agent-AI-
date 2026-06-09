/**
 * @file emotion_classifier.js
 * @description 情感分类器入口，负责对用户输入文本进行情感分析和分类，
 *              提供情感趋势追踪和回应策略推荐，为情感化交互提供基础能力
 * @module services/emotion_classifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const EmotionClassifierModule = require("./emotion_classifier/index");

// 模块导出的是实例，但旧代码可能需要类本身
// 如果模块有 .EmotionClassifier 属性，说明有类定义；否则直接导出实例
const EmotionClassifier = EmotionClassifierModule.EmotionClassifier || EmotionClassifierModule;

// 获取模块导出的实例（用于静态方法实现）
const instance = EmotionClassifierModule;

// ============================================================
// 模块导出：情感分类器
// 功能说明：导出分类器类和实例，并通过静态方法代理到模块实例
// ============================================================

module.exports = EmotionClassifier;
module.exports.EmotionClassifier = EmotionClassifier;

/**
 * @description 对文本进行情感分类
 * @param {string} text - 待分类的文本内容
 * @returns {Object} 情感分类结果，包含情感类型和置信度
 */
EmotionClassifier.classify = function(text) {
    return instance.classify(text);
};

/**
 * @description 获取情感变化趋势
 * @returns {Array} 情感趋势数据列表
 */
EmotionClassifier.getEmotionTrend = function() {
    return instance.getEmotionTrend();
};

/**
 * @description 根据情感类型获取对应的回应策略
 * @param {string} emotion - 情感类型标识
 * @returns {Object} 回应策略配置
 */
EmotionClassifier.getResponseStrategy = function(emotion) {
    return instance.getResponseStrategy(emotion);
};
