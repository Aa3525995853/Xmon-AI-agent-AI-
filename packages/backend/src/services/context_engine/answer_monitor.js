/**
 * @file answer_monitor.js
 * @description 答案情感监视器 - 监控AI回复与用户情感的匹配度，生成调整建议
 * @module services/context_engine
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class AnswerMonitor {
    /**
     * @description 构造函数，初始化情感匹配统计
     */
    constructor() {
        /** @type {Object} 情感匹配统计数据 */
        this.stats = {
            lastUserEmotion: 'neutral',
            lastBotEmotion: 'neutral',
            emotionMismatchCount: 0,
            totalInteractions: 0
        };
    }

    /**
     * @description 监视AI回复的情感与用户情感的匹配度，统计不匹配率并生成建议
     * @param {string} botResponse - AI回复文本
     * @param {string} userEmotion - 用户情感标签
     * @param {Object} emotionAnalyzer - 情感分析器实例，用于分类AI回复情感
     * @returns {{userEmotion: string, botEmotion: string, isMatched: boolean, mismatchRate: number, suggestion: string|null}} 监视结果
     */
    monitor(botResponse, userEmotion, emotionAnalyzer) {
        const botEmotionResult = emotionAnalyzer.classify(botResponse);
        const botEmotion = botEmotionResult.emotion;

        this.stats.totalInteractions++;
        this.stats.lastBotEmotion = botEmotion;
        this.stats.lastUserEmotion = userEmotion;

        const isMatched = this.checkEmotionMatch(userEmotion, botEmotion);

        if (!isMatched) {
            this.stats.emotionMismatchCount++;
        }

        const mismatchRate = this.stats.emotionMismatchCount / this.stats.totalInteractions;

        return {
            userEmotion,
            botEmotion,
            isMatched,
            mismatchRate,
            suggestion: isMatched ? null : this.generateSuggestion(userEmotion)
        };
    }

    /**
     * @description 检查用户情感与AI回复情感是否匹配，基于情感兼容性映射表判断
     * @param {string} userEmotion - 用户情感标签
     * @param {string} botEmotion - AI回复情感标签
     * @returns {boolean} 是否匹配
     */
    checkEmotionMatch(userEmotion, botEmotion) {
        // 情感兼容性映射：每种用户情感对应一组可接受的AI回复情感
        const compatibility = {
            angry: ['angry', 'disgust', 'distressed', 'sad', 'suffering'],
            disgust: ['disgust', 'neutral', 'distressed'],
            fear: ['fear', 'distressed', 'sad', 'suffering'],
            distressed: ['distressed', 'sad', 'suffering', 'happy'],
            happy: ['happy', 'excited'],
            suffering: ['suffering', 'sad', 'distressed'],
            sad: ['sad', 'distressed', 'suffering'],
            neutral: ['neutral', 'happy']
        };

        const compatible = compatibility[userEmotion] || ['neutral'];
        return compatible.includes(botEmotion);
    }

    /**
     * @description 根据用户情感生成AI回复调整建议
     * @param {string} userEmotion - 用户情感标签
     * @returns {string} 调整建议文本
     */
    generateSuggestion(userEmotion) {
        const suggestions = {
            angry: '用户正在生气，AI回复应该更加安抚和理解，避免说教或争辩。',
            disgust: '用户表现出反感，AI应该保持尊重和中立，不要过度热情。',
            fear: '用户感到害怕，AI应该更加温暖和保护，提供安全感。',
            distressed: '用户内心辛苦，AI应该表达更多理解和心疼。',
            happy: '用户很开心，AI应该更加积极和热情，分享喜悦。',
            suffering: '用户正在经历困苦，AI应该表达更多陪伴和力量。',
            sad: '用户很悲伤，AI应该更加温柔和安慰，给予情感支持。'
        };

        return suggestions[userEmotion] || '请调整回复情感以更好匹配用户当前情绪。';
    }

    /**
     * @description 获取情感匹配统计数据，包含不匹配率
     * @returns {{lastUserEmotion: string, lastBotEmotion: string, emotionMismatchCount: number, totalInteractions: number, mismatchRate: number}} 统计数据
     */
    getStats() {
        return {
            ...this.stats,
            mismatchRate: this.stats.totalInteractions > 0
                ? this.stats.emotionMismatchCount / this.stats.totalInteractions
                : 0
        };
    }
}

module.exports = new AnswerMonitor();