/**
 * IntentCore 主入口 - 意图理解中枢
 *
 * 核心职责：理解用户的真实意图，处理模糊、不完整的输入
 *
 * 能力：
 * 1. 上下文追踪 - 追踪对话历史和用户最近操作
 * 2. 意图补全 - 填充缺失的参数和目标
 * 3. 置信度评估 - 评估理解置信度，决定是否直接执行
 * 4. 意图消歧 - 处理多可能的意图
 * 5. 习惯学习 - 从用户反馈中学习偏好
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');

// 延迟加载子模块
let _contextManager = null;
let _intentClassifier = null;
let _intentCompleter = null;
let _disambiguationEngine = null;

function getContextManager() {
    if (!_contextManager) _contextManager = require('./context_manager');
    return _contextManager;
}

function getIntentClassifier() {
    if (!_intentClassifier) _intentClassifier = require('./intent_classifier');
    return _intentClassifier;
}

function getIntentCompleter() {
    if (!_intentCompleter) _intentCompleter = require('./intent_completer');
    return _intentCompleter;
}

function getDisambiguationEngine() {
    if (!_disambiguationEngine) _disambiguationEngine = require('./disambiguation_engine');
    return _disambiguationEngine;
}

// 意图类型
const IntentType = {
    CHAT: 'chat',
    TASK: 'task',
    COMPLEX: 'complex',
    QUERY: 'query',
    ACTION: 'action',
    EMPTY: 'empty'
};

// 置信度等级
const ConfidenceLevel = {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    UNKNOWN: 'unknown'
};

class IntentCore extends EventEmitter {
    constructor() {
        super();

        this.contextManager = getContextManager();
        this.intentClassifier = getIntentClassifier();
        this.intentCompleter = getIntentCompleter();
        this.disambiguationEngine = getDisambiguationEngine();

        // 置信度阈值
        this.confidenceThresholds = {
            [IntentType.TASK]: { high: 0.75, low: 0.4 },
            [IntentType.COMPLEX]: { high: 0.8, low: 0.5 },
            [IntentType.QUERY]: { high: 0.7, low: 0.3 },
            [IntentType.ACTION]: { high: 0.7, low: 0.4 }
        };

        logger.info('[IntentCore] 意图理解中枢初始化完成');
    }

    /**
     * 理解用户意图
     */
    async understand(input, options = {}) {
        try {
            // 1. 上下文追踪
            const context = await this.contextManager.getContext(options.conversationId);

            // 2. 意图分类
            const classification = await this.intentClassifier.classify(input, context);

            // 3. 意图补全
            const completion = await this.intentCompleter.complete(classification, context);

            // 4. 置信度评估
            const confidence = this._evaluateConfidence(completion);

            // 5. 意图消歧（如需要）
            let result = completion;
            if (confidence.level === ConfidenceLevel.UNKNOWN) {
                const disambiguation = await this.disambiguationEngine.disambiguate(input, context);
                if (disambiguation.success) {
                    result = disambiguation.result;
                }
            }

            // 更新上下文
            await this.contextManager.updateContext(options.conversationId, {
                lastIntent: result,
                entities: result.entities
            });

            return {
                success: true,
                ...result,
                confidence
            };

        } catch (error) {
            logger.error('[IntentCore] 理解失败:', error);
            return { success: false, message: error.message };
        }
    }

    _evaluateConfidence(result) {
        const score = result.confidenceScore || 0.5;

        let level = ConfidenceLevel.UNKNOWN;
        if (score > 0.8) level = ConfidenceLevel.HIGH;
        else if (score > 0.5) level = ConfidenceLevel.MEDIUM;
        else if (score > 0) level = ConfidenceLevel.LOW;

        return { level, score };
    }

    getIntentType() {
        return IntentType;
    }

    getConfidenceLevel() {
        return ConfidenceLevel;
    }
}

module.exports = IntentCore;