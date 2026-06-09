/**
 * @file index.js
 * @description IntentClassifier 主入口 - 意图识别服务，双脑异步架构的"路由中枢"
 * @module intentClassifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 路由策略：
 * - chat: 闲聊 → Mimo（低延迟）
 * - task: 工作指令 → 工作大脑（有工具调用能力）
 * - complex: 复杂推理 → 工作大脑（更强模型）
 */

const { logger } = require('../../utils/logger');

// 延迟加载子模块
let _intentDetector = null;
let _patternMatcher = null;
let _learner = null;
let _fuzzyMatcher = null;

function getIntentDetector() {
    if (!_intentDetector) _intentDetector = require('./intent_detector');
    return _intentDetector;
}

function getPatternMatcher() {
    if (!_patternMatcher) _patternMatcher = require('./pattern_matcher');
    return _patternMatcher;
}

function getLearner() {
    if (!_learner) _learner = require('./learner');
    return _learner;
}

function getFuzzyMatcher() {
    if (!_fuzzyMatcher) _fuzzyMatcher = require('./fuzzy_matcher');
    return _fuzzyMatcher;
}

class IntentClassifier {
    constructor() {
        this.detector = getIntentDetector();
        this.matcher = getPatternMatcher();
        this.learner = getLearner();
        this.fuzzyMatcher = getFuzzyMatcher();

        logger.info('[IntentClassifier] 意图识别服务初始化完成');
    }

    /**
     * @description 分类用户输入 - 按优先级依次检测，返回最高优先级的意图
     * @param {string} text - 用户输入文本
     * @returns {Object} 分类结果 { type, confidence, reason }
     */
    classify(text) {
        if (!text || typeof text !== 'string') {
            return { type: 'chat', confidence: 1.0, reason: 'empty_input' };
        }

        const trimmed = text.trim();

        // 优先级 0: 情感支持检测
        const emotional = this.detector.detectEmotional(trimmed);
        if (emotional) return emotional;

        // 优先级 1: 闲聊招呼语
        const chatPrefix = this.detector.detectChatPrefix(trimmed);
        if (chatPrefix) return chatPrefix;

        // 优先级 2: 代码审查
        const codeReview = this.matcher.matchCodeReview(trimmed);
        if (codeReview) return codeReview;

        // 优先级 3: 学习到的模式
        const learned = this.learner.classify(trimmed);
        if (learned && learned.count >= 3) {
            return { type: learned.type, confidence: 0.75, reason: 'learned_pattern' };
        }

        // 优先级 4: 英文任务模式
        const enPattern = this.matcher.matchEnglishPattern(trimmed);
        if (enPattern) return enPattern;

        // 优先级 5: 中文任务模式
        const cnPattern = this.matcher.matchChinesePattern(trimmed);
        if (cnPattern) return cnPattern;

        // 优先级 6: 英文关键词
        const enKeyword = this.detector.detectEnglishKeyword(trimmed);
        if (enKeyword) return enKeyword;

        // 优先级 7: 中文关键词
        const cnKeyword = this.detector.detectChineseKeyword(trimmed);
        if (cnKeyword) return cnKeyword;

        // 优先级 8: 复杂推理关键词
        const complex = this.detector.detectComplex(trimmed);
        if (complex) return complex;

        // 优先级 9: 模糊匹配容错
        const fuzzy = this.fuzzyMatcher.match(trimmed);
        if (fuzzy) return { type: 'task', confidence: fuzzy.similarity * 0.8, reason: 'fuzzy_match' };

        // 默认闲聊
        return { type: 'chat', confidence: 0.6, reason: 'default_chat' };
    }

    /**
     * @description 判断是否为任务意图（task 或 complex）
     * @param {string} text - 用户输入文本
     * @returns {boolean} 是否为任务意图
     */
    isTaskIntent(text) {
        const result = this.classify(text);
        return result.type === 'task' || result.type === 'complex';
    }

    /**
     * @description 判断是否为复杂推理意图
     * @param {string} text - 用户输入文本
     * @returns {boolean} 是否为复杂推理意图
     */
    isComplexIntent(text) {
        const result = this.classify(text);
        return result.type === 'complex';
    }

    /**
     * @description 判断是否需要工作大脑处理
     * @param {string} text - 用户输入文本
     * @returns {boolean} 是否需要工作大脑
     */
    needsWorkBrain(text) {
        const result = this.classify(text);
        return result.type === 'task' || result.type === 'complex';
    }

    /**
     * @description 从成功执行中学习模式 - 记录输入与分类的对应关系
     * @param {string} input - 用户输入文本
     * @param {string} classifiedType - 分类结果类型
     */
    learnFromSuccess(input, classifiedType) {
        this.learner.learn(input, classifiedType);
    }

    /**
     * @description 获取所有关键词列表
     * @returns {Object} 关键词集合 { TASK_KEYWORDS, TASK_KEYWORDS_EN, COMPLEX_KEYWORDS }
     */
    getKeywords() {
        return {
            TASK_KEYWORDS: this.detector.TASK_KEYWORDS,
            TASK_KEYWORDS_EN: this.detector.TASK_KEYWORDS_EN,
            COMPLEX_KEYWORDS: this.detector.COMPLEX_KEYWORDS
        };
    }

    /**
     * @description 获取所有模式匹配规则
     * @returns {Object} 模式集合 { TASK_PATTERNS, TASK_PATTERNS_EN }
     */
    getPatterns() {
        return {
            TASK_PATTERNS: this.matcher.TASK_PATTERNS,
            TASK_PATTERNS_EN: this.matcher.TASK_PATTERNS_EN
        };
    }
}

const instance = new IntentClassifier();

// 直接导出实例方法（不需要快捷方式）
module.exports = instance;

// 也导出静态访问器用于直接引用
module.exports.IntentClassifier = IntentClassifier;
module.exports.instance = instance;