/**
 * @file index.js
 * @description EmotionClassifier 主入口 - 情感分类器，基于 TextCNN-BiLSTM-SelfAttention 架构模拟
 * @module emotion_classifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 支持7种情感标签：angry, disgust, fear, distressed, happy, suffering, sad
 */

const { logger } = require('../../utils/logger');

// 延迟加载子模块
let _nlpProcessor = null;
let _emotionDector = null;
let _responseEnhancer = null;

function getNlpProcessor() {
    if (!_nlpProcessor) _nlpProcessor = require('./nlp_processor');
    return _nlpProcessor;
}

function getEmotionDector() {
    if (!_emotionDector) _emotionDector = require('./emotion_detector');
    return _emotionDector;
}

function getResponseEnhancer() {
    if (!_responseEnhancer) _responseEnhancer = require('./response_enhancer');
    return _responseEnhancer;
}

class EmotionClassifier {
    constructor() {
        this.nlp = getNlpProcessor();
        this.detector = getEmotionDector();
        this.enhancer = getResponseEnhancer();

        this.emotions = this.detector.emotions;
        this.emotionLabels = this.detector.emotionLabels;

        logger.info('[EmotionClassifier] 情感分类器初始化完成');
    }

    /**
     * @description 主分类方法 - 依次执行 n-gram 特征提取、序列特征提取、注意力权重计算、特征融合和情感动量调整
     * @param {string} text - 待分类文本
     * @returns {Object} 分类结果 { emotion, confidence, intensity, scores, details }
     */
    classify(text) {
        if (!text || typeof text !== 'string') {
            return { emotion: 'neutral', confidence: 0, intensity: 'weak', details: {} };
        }

        const cleanedText = text.toLowerCase().trim();

        // 1. TextCNN: 提取局部n-gram特征
        const ngramFeatures = this.nlp.extractNgramFeatures(cleanedText, this.detector);

        // 2. BiLSTM模拟: 提取序列特征
        const sequenceFeatures = this.nlp.extractSequenceFeatures(cleanedText, this.detector);

        // 3. Self-Attention: 计算词语重要性权重
        const attentionWeights = this.nlp.computeAttentionWeights(cleanedText, this.detector);

        // 4. 融合特征并分类
        const scores = this.nlp.fuseAndClassify(ngramFeatures, sequenceFeatures, attentionWeights, this.detector);

        // 5. 计算情感动量（历史平滑）
        const momentumAdjusted = this.detector.applyMomentum(scores);

        // 6. 确定最终情感
        const result = this.detector.determineEmotion(momentumAdjusted);

        // 7. 记录历史
        this.detector.updateHistory(result);

        return result;
    }

    /**
     * @description 批量分类
     * @param {Array<string>} texts - 待分类文本数组
     * @returns {Array<Object>} 分类结果数组
     */
    classifyBatch(texts) {
        return texts.map(text => this.classify(text));
    }

    /**
     * @description 获取情感分布统计
     * @param {Array<string>} texts - 待分析文本数组
     * @returns {Object} 各情感类型的计数分布
     */
    getEmotionDistribution(texts) {
        const results = this.classifyBatch(texts);
        const distribution = {};
        this.emotions.forEach(e => distribution[e] = 0);
        distribution.neutral = 0;

        results.forEach(r => {
            distribution[r.emotion] = (distribution[r.emotion] || 0) + 1;
        });

        return distribution;
    }

    /**
     * @description 获取情感趋势（improving/declining/stable）
     * @returns {string} 情感趋势
     */
    getEmotionTrend() {
        return this.detector.getEmotionTrend();
    }

    /**
     * @description 清空情感历史记录
     */
    clearHistory() {
        this.detector.clearHistory();
    }

    /**
     * 获取语气词
     */
    getParticles(emotion, count = 1) {
        return this.enhancer.getParticles(emotion, count);
    }

    /**
     * 获取表情
     */
    getEmoji(emotion) {
        return this.enhancer.getEmoji(emotion);
    }

    /**
     * 增强回复
     */
    enhanceResponse(text, emotion) {
        return this.enhancer.enhanceResponse(text, emotion);
    }

    /**
     * 获取响应策略
     */
    getResponseStrategy(emotion) {
        return this.enhancer.getResponseStrategy(emotion);
    }

    /**
     * 生成高情商回复
     */
    generateEmpathyResponse(userEmotion, userText) {
        return this.enhancer.generateEmpathyResponse(userEmotion);
    }
}

const instance = new EmotionClassifier();
module.exports = instance;
module.exports.EmotionClassifier = EmotionClassifier;