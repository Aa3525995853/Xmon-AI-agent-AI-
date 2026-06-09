/**
 * @file intent_core.js
 * @description 意图理解核心 - 调用意图分类器理解用户输入，计算置信度并确定执行策略
 * @module services/executor
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const intentClassifier = require('../intentClassifier');

class IntentCore {
    /**
     * @description 构造函数，初始化置信度阈值
     */
    constructor() {
        /** @type {Object} 置信度阈值配置，用于判断执行策略 */
        this.confidenceThreshold = {
            high: 0.85,   // 高置信度：直接执行
            medium: 0.6,  // 中置信度：执行但需注意
            low: 0.3      // 低置信度：需用户确认
        };
    }

    /**
     * @description 理解用户输入的意图，调用分类器并计算置信度和建议操作
     * @param {string} text - 用户输入文本
     * @param {Object} [context={}] - 上下文信息
     * @returns {Promise<Object>} 意图对象 { originalInput, type, action, targets, entities, confidence, suggestedAction, disambiguation }
     */
    async understand(text, context = {}) {
        try {
            // 使用 intentClassifier 进行意图分类
            const classification = await intentClassifier.classify(text, context);

            // 构建意图对象
            const intent = {
                originalInput: text,
                type: classification.type,
                action: classification.action,
                targets: classification.targets || [],
                entities: classification.entities || {},
                confidence: this._calculateConfidence(classification),
                suggestedAction: this._determineAction(classification),
                disambiguation: classification.disambiguation || null
            };

            return intent;

        } catch (error) {
            console.error('[IntentCore] 意图理解失败:', error);
            return {
                originalInput: text,
                type: 'unknown',
                action: 'unknown',
                targets: [],
                confidence: { score: 0, level: 'low' },
                suggestedAction: { action: 'confirm_first', reason: '理解失败' },
                disambiguation: {
                    needed: true,
                    question: '我没能理解你的意思，能再说一次吗？',
                    options: [
                        { id: 'repeat', label: '重新说一遍' },
                        { id: 'cancel', label: '取消任务' }
                    ]
                }
            };
        }
    }

    /**
     * @description 根据分类结果计算置信度分数和等级，考虑匹配质量和实体完整性
     * @param {Object} classification - 分类结果
     * @param {number} [classification.confidence=0.5] - 初始置信度
     * @param {string} [classification.matchQuality] - 匹配质量：exact/fuzzy
     * @param {Array} [classification.missingEntities] - 缺失实体列表
     * @returns {{score: number, level: string}} 置信度 { score, level: high/medium/low }
     * @private
     */
    _calculateConfidence(classification) {
        let score = classification.confidence || 0.5;

        // 根据匹配质量调整
        if (classification.matchQuality === 'exact') {
            score = Math.min(1, score + 0.15);
        } else if (classification.matchQuality === 'fuzzy') {
            score = Math.max(0, score - 0.1);
        }

        // 根据实体完整性调整
        if (classification.missingEntities?.length > 0) {
            score = Math.max(0.3, score - classification.missingEntities.length * 0.1);
        }

        let level;
        if (score >= this.confidenceThreshold.high) {
            level = 'high';
        } else if (score >= this.confidenceThreshold.medium) {
            level = 'medium';
        } else {
            level = 'low';
        }

        return { score, level };
    }

    /**
     * @description 根据置信度确定建议操作策略
     * @param {Object} classification - 分类结果
     * @param {number} classification.confidence - 置信度分数
     * @returns {{action: string, reason: string}} 建议操作 { action: execute/execute_with_warning/confirm_first, reason }
     * @private
     */
    _determineAction(classification) {
        if (classification.confidence >= this.confidenceThreshold.high) {
            return { action: 'execute', reason: '高置信度' };
        } else if (classification.confidence >= this.confidenceThreshold.medium) {
            return { action: 'execute_with_warning', reason: '中置信度，需注意' };
        } else {
            return { action: 'confirm_first', reason: '低置信度，需确认' };
        }
    }

    /**
     * @description 消歧处理，当意图不明确时生成消歧问题和选项
     * @param {Object} intent - 意图对象
     * @param {Array<Object>} options - 消歧选项列表
     * @param {string} options[].value - 选项值
     * @param {string} options[].label - 选项标签
     * @param {string} options[].description - 选项描述
     * @returns {Promise<Object>} 带消歧信息的意图对象
     */
    async disambiguate(intent, options) {
        const disambiguation = {
            needed: true,
            question: this._generateQuestion(intent),
            options: options.map(o => ({
                id: o.value,
                label: o.label,
                description: o.description
            }))
        };

        return { ...intent, disambiguation };
    }

    /**
     * @description 根据意图类型生成消歧问题
     * @param {Object} intent - 意图对象
     * @param {Array} [intent.missingEntities] - 缺失实体列表
     * @param {string} [intent.type] - 意图类型
     * @returns {string} 消歧问题文本
     * @private
     */
    _generateQuestion(intent) {
        const missing = intent.missingEntities?.join(', ') || '某些信息';

        const questions = {
            search: `你想搜索什么内容？`,
            file_operation: `具体要操作哪个文件或文件夹？`,
            app_control: `要打开什么应用？`,
            email: `你要给谁发邮件？`,
            calendar: `什么时间？`
        };

        return questions[intent.type] || `需要确认${missing}`;
    }
}

module.exports = new IntentCore();