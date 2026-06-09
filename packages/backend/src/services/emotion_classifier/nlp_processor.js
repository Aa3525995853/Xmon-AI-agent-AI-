/**
 * @file nlp_processor.js
 * @description NLP 处理器 - 模拟 TextCNN、BiLSTM 和 Self-Attention 架构进行情感特征提取和融合
 * @module emotion_classifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/** n-gram 特征权重 - 更长的 n-gram 匹配权重更高 */
const NGRAM_WEIGHT_MULTIPLIER = 1.5;

/** 特征融合权重 - n-gram、序列特征和注意力特征的占比 */
const FUSION_WEIGHTS = { ngram: 0.3, sequence: 0.5, attention: 0.2 };

/** 上下文窗口大小 - BiLSTM 检测否定词和程度副词的窗口 */
const CONTEXT_WINDOW_SIZE = 5;

class NlpProcessor {
    /**
     * @description TextCNN: 提取 n-gram 局部特征 - 匹配1/2/3-gram与情感词典
     * @param {string} text - 输入文本
     * @param {Object} detector - 情感检测器（提供词典）
     * @returns {Object} 各情感类型的 n-gram 分数
     */
    extractNgramFeatures(text, detector) {
        const scores = {};
        detector.emotions.forEach(e => scores[e] = 0);

        // 1-gram, 2-gram, 3-gram 匹配
        for (let n = 1; n <= 3; n++) {
            const ngrams = this.getNgrams(text, n);
            ngrams.forEach(gram => {
                detector.emotions.forEach(emotion => {
                    const lexiconWords = detector.lexicon[emotion];
                    if (lexiconWords.includes(gram)) {
                        // 更长的 n-gram 匹配权重更高，n * 1.5
                        scores[emotion] += n * NGRAM_WEIGHT_MULTIPLIER;
                    }
                });
            });
        }

        return scores;
    }

    /**
     * @description 生成指定 n 的 n-gram 列表
     * @param {string} text - 输入文本
     * @param {number} n - gram 长度
     * @returns {Array<string>} n-gram 列表
     */
    getNgrams(text, n) {
        const chars = text.split('');
        const ngrams = [];
        for (let i = 0; i <= chars.length - n; i++) {
            ngrams.push(chars.slice(i, i + n).join(''));
        }
        return ngrams;
    }

    /**
     * @description BiLSTM 模拟: 提取序列特征 - 检测否定词和程度副词对情感词的修饰
     * @param {string} text - 输入文本
     * @param {Object} detector - 情感检测器（提供词典、否定词、程度副词）
     * @returns {Object} 各情感类型的序列特征分数
     */
    extractSequenceFeatures(text, detector) {
        const scores = {};
        detector.emotions.forEach(e => scores[e] = 0);

        const words = text.split(/\s+/);
        const windowSize = CONTEXT_WINDOW_SIZE;

        for (let i = 0; i < words.length; i++) {
            detector.emotions.forEach(emotion => {
                if (detector.lexicon[emotion].includes(words[i])) {
                    let score = 1.0;

                    // 检查否定词
                    const start = Math.max(0, i - windowSize);
                    const end = Math.min(words.length, i + windowSize + 1);
                    const context = words.slice(start, end);

                    const negationCount = context.filter(w => detector.negations.includes(w)).length;
                    if (negationCount > 0) {
                        score *= -0.8;
                    }

                    // 检查程度副词
                    context.forEach(w => {
                        if (detector.intensifiers.strong.includes(w)) score *= 1.8;
                        else if (detector.intensifiers.moderate.includes(w)) score *= 1.3;
                        else if (detector.intensifiers.weak.includes(w)) score *= 0.6;
                    });

                    scores[emotion] += score;
                }
            });
        }

        return scores;
    }

    /**
     * @description Self-Attention: 计算词语重要性权重 - 综合位置权重、情感词权重和标点权重
     * @param {string} text - 输入文本
     * @param {Object} detector - 情感检测器
     * @returns {Array<number>} 归一化后的注意力权重数组
     */
    computeAttentionWeights(text, detector) {
        const words = text.split(/\s+/);
        const weights = [];

        words.forEach((word, index) => {
            let weight = 1.0;

            // 位置权重
            const position = index / words.length;
            if (position < 0.2 || position > 0.8) {
                weight *= 1.5;
            }

            // 情感词权重
            detector.emotions.forEach(emotion => {
                if (detector.lexicon[emotion].includes(word)) {
                    weight *= 2.0;
                }
            });

            // 标点符号权重
            if (/[!！]{2,}/.test(word)) weight *= 1.8;
            if (/[?？]{2,}/.test(word)) weight *= 1.5;

            weights.push(weight);
        });

        // Softmax归一化
        const maxWeight = Math.max(...weights);
        return weights.map(w => w / maxWeight);
    }

    /**
     * @description 特征融合 - 按 n-gram:0.3 / 序列:0.5 / 注意力:0.2 的权重融合三类特征
     * @param {Object} ngramScores - n-gram 特征分数
     * @param {Object} sequenceScores - 序列特征分数
     * @param {Array<number>} attentionWeights - 注意力权重数组
     * @param {Object} detector - 情感检测器
     * @returns {Object} 融合后的各情感分数
     */
    fuseAndClassify(ngramScores, sequenceScores, attentionWeights, detector) {
        const fused = {};
        detector.emotions.forEach(e => {
            const ngram = ngramScores[e] || 0;
            const sequence = sequenceScores[e] || 0;
            const attention = attentionWeights.reduce((a, b) => a + b, 0) / attentionWeights.length;

            fused[e] = ngram * FUSION_WEIGHTS.ngram + sequence * FUSION_WEIGHTS.sequence + attention * FUSION_WEIGHTS.attention;
        });

        return fused;
    }
}

module.exports = new NlpProcessor();