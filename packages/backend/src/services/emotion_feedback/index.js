/**
 * @file index.js
 * @description EmotionFeedbackService 主入口 - 情感反馈服务，
 *              整合完成语生成、努力认可、建议引擎、安慰提供和问候管理，
 *              让任务结果反馈不再冷冰冰，而是温暖、贴心、有情感
 * @module services/emotion_feedback
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块：避免循环依赖，按需初始化
// ============================================================
let _completionGenerator = null;
let _effortRecognizer = null;
let _suggestionEngine = null;
let _comfortProvider = null;
let _greetingManager = null;

/**
 * @description 获取完成语生成器单例
 * @returns {Object} CompletionGenerator 实例
 */
function getCompletionGenerator() {
    if (!_completionGenerator) _completionGenerator = require('./completion_generator');
    return _completionGenerator;
}

/**
 * @description 获取努力认可器单例
 * @returns {Object} EffortRecognizer 实例
 */
function getEffortRecognizer() {
    if (!_effortRecognizer) _effortRecognizer = require('./effort_recognizer');
    return _effortRecognizer;
}

/**
 * @description 获取建议引擎单例
 * @returns {Object} SuggestionEngine 实例
 */
function getSuggestionEngine() {
    if (!_suggestionEngine) _suggestionEngine = require('./suggestion_engine');
    return _suggestionEngine;
}

/**
 * @description 获取安慰提供者单例
 * @returns {Object} ComfortProvider 实例
 */
function getComfortProvider() {
    if (!_comfortProvider) _comfortProvider = require('./comfort_provider');
    return _comfortProvider;
}

/**
 * @description 获取问候语管理器单例
 * @returns {Object} GreetingManager 实例
 */
function getGreetingManager() {
    if (!_greetingManager) _greetingManager = require('./greeting_manager');
    return _greetingManager;
}

// ============================================================
// 常量定义：长时间工作阈值
// ============================================================

/** 长时间工作阈值（毫秒），2 小时 */
const LONG_SESSION_THRESHOLD = 2 * 60 * 60 * 1000;

/** 深夜工作开始时间（小时） */
const LATE_NIGHT_START = 23;

/** 深夜工作结束时间（小时） */
const LATE_NIGHT_END = 6;

// ============================================================
// EmotionFeedbackService 类：情感反馈服务主类
// ============================================================

class EmotionFeedbackService {
    constructor() {
        this.completionGenerator = getCompletionGenerator();
        this.effortRecognizer = getEffortRecognizer();
        this.suggestionEngine = getSuggestionEngine();
        this.comfortProvider = getComfortProvider();
        this.greetingManager = getGreetingManager();

        // 情绪语气配置
        this.emotionTones = {
            happy: { emoji: '🎉', warmth: 'high', particles: ['～', '呀', '呢'] },
            neutral: { emoji: '✨', warmth: 'medium', particles: ['～', '哦'] },
            worried: { emoji: '🤗', warmth: 'high', particles: ['～', '别担心'] },
            sad: { emoji: '💙', warmth: 'high', particles: ['～', '我帮你分担'] },
            angry: { emoji: '🤝', warmth: 'high', particles: ['～', '别急', '没事的'] },
            tired: { emoji: '☕', warmth: 'high', particles: ['～', '辛苦了'] }
        };

        logger.info('[EmotionFeedback] 情感反馈服务初始化完成');
    }

    /**
     * @description 生成温暖的任务完成反馈，根据用户情绪匹配语气风格
     * @param {Object} taskResult - 任务结果
     * @param {string} taskResult.taskType - 任务类型
     * @param {string} [taskResult.summary] - 任务摘要
     * @param {Object} [taskResult.details] - 任务详情
     * @param {string} [taskResult.effort='normal'] - 任务难度
     * @param {Object} [context={}] - 上下文
     * @param {string} [context.userEmotion='neutral'] - 用户情绪
     * @returns {string} 温暖的完成反馈文本
     */
    generateCompletionFeedback(taskResult, context = {}) {
        const { taskType, summary, details, effort = 'normal' } = taskResult;
        const userEmotion = context.userEmotion || 'neutral';
        const tone = this.emotionTones[userEmotion] || this.emotionTones.neutral;

        // 生成各部分
        const prefix = this.completionGenerator.getPrefix(taskType, effort);
        const coreContent = this.completionGenerator.formatCoreContent(taskResult);
        const effortPhrase = this.effortRecognizer.getPhrase(effort, details);

        // 组装
        let feedback = prefix + coreContent;
        if (effortPhrase) {
            feedback += '。' + effortPhrase;
        }

        // 添加语气词
        feedback = this.completionGenerator.addParticles(feedback, tone.particles);

        return feedback;
    }

    /**
     * @description 生成主动建议，综合任务类型建议和上下文建议，返回置信度最高的
     * @param {Object} taskResult - 任务结果
     * @param {Object} [context={}] - 上下文
     * @returns {Object|null} 建议对象，无建议时返回 null
     */
    generateSuggestion(taskResult, context = {}) {
        const suggestions = [];

        const taskSuggestion = this.suggestionEngine.getTaskSuggestion(taskResult, context);
        if (taskSuggestion) suggestions.push(taskSuggestion);

        const contextSuggestions = this.suggestionEngine.getContextSuggestions(context);
        suggestions.push(...contextSuggestions);

        return suggestions.sort((a, b) => b.confidence - a.confidence)[0] || null;
    }

    /**
     * @description 生成完整的结果交付，包含反馈、建议和详情
     * @param {Object} taskResult - 任务结果
     * @param {Object} [context={}] - 上下文
     * @returns {{feedback: string, suggestion: Object|null, summary: string, details: Object, canAct: boolean, timestamp: number}} 完整交付对象
     */
    generateDelivery(taskResult, context = {}) {
        const feedback = this.generateCompletionFeedback(taskResult, context);
        const suggestion = this.generateSuggestion(taskResult, context);

        return {
            feedback,
            suggestion,
            summary: taskResult.summary,
            details: taskResult.details,
            canAct: suggestion !== null && suggestion.action !== null,
            timestamp: Date.now()
        };
    }

    /**
     * @description 生成情绪安抚反馈
     * @param {string} userEmotion - 用户情绪（sad/angry/tired/worried）
     * @param {Object} [context={}] - 上下文
     * @returns {string} 安慰文本
     */
    generateComfortFeedback(userEmotion, context = {}) {
        return this.comfortProvider.generate(userEmotion, context);
    }

    /**
     * @description 获取基于当前时间的问候语
     * @returns {string} 问候语文本
     */
    getGreetingPhrase() {
        return this.greetingManager.getPhrase();
    }

    /**
     * @description 判断是否应该主动关怀用户，基于情绪、工作时长和时间段
     * @param {string} userEmotion - 用户情绪
     * @param {Object} context - 上下文
     * @param {number} [context.sessionDuration] - 会话持续时间（毫秒）
     * @returns {boolean} 是否应该主动关怀
     */
    shouldProactiveCare(userEmotion, context) {
        // 负面情绪时主动关怀
        if (['sad', 'angry', 'tired', 'worried'].includes(userEmotion)) {
            return true;
        }

        // 长时间工作后
        if (context.sessionDuration && context.sessionDuration > LONG_SESSION_THRESHOLD) {
            return true;
        }

        // 深夜工作时
        const hour = new Date().getHours();
        if (hour >= LATE_NIGHT_START || hour < LATE_NIGHT_END) {
            return true;
        }

        return false;
    }
}

const instance = new EmotionFeedbackService();
module.exports = instance;