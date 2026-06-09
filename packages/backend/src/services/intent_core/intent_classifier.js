/**
 * 意图分类器
 */

const { logger } = require('../../utils/logger');

// 意图类型常量
const IntentType = {
    CHAT: 'chat',
    TASK: 'task',
    COMPLEX: 'complex',
    QUERY: 'query',
    ACTION: 'action',
    EMPTY: 'empty'
};

// 意图关键词
const INTENT_KEYWORDS = {
    [IntentType.CHAT]: ['你好', '在吗', '聊天', '随便', '天气', '怎么样'],
    [IntentType.TASK]: ['帮我', '请', '打开', '发送', '创建', '生成'],
    [IntentType.COMPLEX]: ['分析', '整理', '比较', '规划', '方案', '报告'],
    [IntentType.QUERY]: ['查', '找', '搜索', '看', '了解', '知道'],
    [IntentType.ACTION]: ['执行', '运行', '开始', '停止', '完成', '取消']
};

class IntentClassifier {
    constructor() {
        this.keywords = INTENT_KEYWORDS;
    }

    async classify(input, context) {
        if (!input || input.trim().length === 0) {
            return {
                type: IntentType.EMPTY,
                confidenceScore: 0,
                reason: '空输入'
            };
        }

        // 1. 规则匹配
        const ruleResult = this._ruleMatch(input);

        // 2. 上下文推断
        const contextHint = this._inferFromContext(context);

        // 3. 综合评分
        const finalType = this._combineResults(ruleResult, contextHint);
        const confidence = this._calculateConfidence(finalType, input);

        return {
            type: finalType,
            confidenceScore: confidence,
            reason: ruleResult.reason || contextHint.reason,
            entities: this._extractEntities(input)
        };
    }

    _ruleMatch(input) {
        const text = input.toLowerCase();

        for (const [type, keywords] of Object.entries(this.keywords)) {
            for (const keyword of keywords) {
                if (text.includes(keyword)) {
                    return {
                        type,
                        matchKeyword: keyword,
                        reason: `关键词匹配: ${keyword}`
                    };
                }
            }
        }

        return { type: IntentType.CHAT, reason: '默认闲聊' };
    }

    _inferFromContext(context) {
        if (!context) return { type: IntentType.CHAT, reason: '无上下文' };

        if (context.lastTask) {
            return {
                type: IntentType.ACTION,
                reason: `延续任务: ${context.lastTask.type}`
            };
        }

        if (context.lastFiles && context.lastFiles.length > 0) {
            return {
                type: IntentType.TASK,
                reason: '引用文件'
            };
        }

        return { type: null, reason: '无上下文提示' };
    }

    _combineResults(ruleResult, contextHint) {
        // 优先使用规则匹配结果
        if (ruleResult.type !== IntentType.CHAT) {
            return ruleResult.type;
        }

        // 使用上下文推断
        return contextHint.type || IntentType.CHAT;
    }

    _calculateConfidence(type, input) {
        let score = 0.5;

        // 根据输入长度调整
        if (input.length > 10) score += 0.1;
        if (input.length > 50) score += 0.1;

        // 根据类型调整
        if (type === IntentType.TASK || type === IntentType.QUERY) {
            score += 0.2;
        }

        return Math.min(score, 1);
    }

    _extractEntities(input) {
        const entities = {
            files: [],
            urls: [],
            numbers: [],
            dates: []
        };

        // 提取文件路径
        const filePattern = /[a-zA-Z]:\\[\w\\]+\.\w+|\/[\w\/]+\.\w+/g;
        entities.files = input.match(filePattern) || [];

        // 提取 URL
        const urlPattern = /https?:\/\/[^\s]+/g;
        entities.urls = input.match(urlPattern) || [];

        // 提取数字
        const numberPattern = /\d+([.,]\d+)?/g;
        entities.numbers = input.match(numberPattern) || [];

        // 提取日期
        const datePattern = /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?/g;
        entities.dates = input.match(datePattern) || [];

        return entities;
    }

    getIntentTypes() {
        return IntentType;
    }
}

module.exports = new IntentClassifier();