/**
 * @file emotion_analyzer.js
 * @description 情感分析器 - 封装情感分类器，提供情感分类、趋势分析和LLM上下文生成
 * @module services/context_engine
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const EmotionClassifier = require('../emotion_classifier');

class EmotionAnalyzer {
    /**
     * @description 构造函数，初始化情感分类器
     */
    constructor() {
        this.classifier = new EmotionClassifier();
    }

    /**
     * @description 对文本进行情感分类
     * @param {string} text - 待分类的文本
     * @returns {Object} 分类结果，包含 emotion、intensity 等字段
     */
    classify(text) {
        return this.classifier.classify(text);
    }

    /**
     * @description 获取情感变化趋势
     * @returns {string} 趋势描述：improving/declining/stable
     */
    getEmotionTrend() {
        return this.classifier.getEmotionTrend();
    }

    /**
     * @description 根据情感类型获取响应策略
     * @param {string} emotion - 情感标签
     * @returns {Object} 响应策略，包含 approach、tone、priority 字段
     */
    getResponseStrategy(emotion) {
        return this.classifier.getResponseStrategy(emotion);
    }

    /**
     * @description 生成供LLM使用的情感上下文文本，包含用户情感状态、响应策略和交互指导
     * @param {Object} currentContext - 当前上下文对象
     * @param {string} currentContext.userEmotion - 用户情感标签
     * @param {string} currentContext.userEmotionIntensity - 情感强度
     * @param {string} currentContext.emotionTrend - 情感趋势
     * @returns {string} 格式化的情感上下文文本
     */
    getEmotionContextForLLM(currentContext) {
        const state = {
            emotion: currentContext.userEmotion,
            emotionLabel: this.classifier.emotionLabels[currentContext.userEmotion] || '平静',
            intensity: currentContext.userEmotionIntensity,
            trend: currentContext.emotionTrend
        };

        const strategy = this.getResponseStrategy(state.emotion);

        let context = `
## 用户当前情感状态
- 情感: ${state.emotionLabel} (${state.emotion})
- 强度: ${state.intensity}
- 趋势: ${state.trend === 'improving' ? '好转中' : state.trend === 'declining' ? '下滑中' : '稳定'}

## 情感响应策略
- 应对方式: ${strategy.approach}
- 语气风格: ${strategy.tone}
- 优先事项: ${strategy.priority.join(' > ')}
`;

        const guidance = {
            angry: '用户正在生气，请先安抚情绪，不要争辩，表示理解和接纳。',
            disgust: '用户表现出反感，请保持尊重距离，不要强行接近。',
            fear: '用户感到害怕，请给予安全感和支持，语气要温暖保护。',
            distressed: '用户内心辛苦，请表达理解和心疼，提供情感支持。',
            happy: '用户很开心，请一起分享喜悦，积极回应。',
            suffering: '用户正在经历困苦，请表达陪伴和力量，给予希望。',
            sad: '用户很悲伤，请给予安慰和陪伴，允许悲伤。',
            neutral: '用户情绪平稳，正常交流即可。'
        };

        context += `\n## 情感交互指导\n${guidance[state.emotion] || guidance.neutral}\n`;

        return context;
    }
}

module.exports = new EmotionAnalyzer();