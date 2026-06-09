/**
 * 意图消歧引擎
 */

const { logger } = require('../../utils/logger');

class DisambiguationEngine {
    constructor() {
        this.clarificationStrategies = {
            missing_target: {
                question: '请问您是指哪个？',
                options: (context) => this._generateOptions(context)
            },
            missing_action: {
                question: '您想怎么处理？',
                options: (context) => ['打开', '查看', '编辑', '删除']
            },
            ambiguous: {
                question: '我理解的对吗？',
                options: () => ['是的', '不对']
            }
        };
    }

    async disambiguate(input, context) {
        try {
            // 分析可能的意图
            const possibilities = this._analyzePossibilities(input, context);

            if (possibilities.length === 0) {
                return {
                    success: false,
                    message: '无法理解，请明确说明'
                };
            }

            if (possibilities.length === 1) {
                return {
                    success: true,
                    result: possibilities[0],
                    needsClarification: false
                };
            }

            // 返回消歧选项
            return {
                success: true,
                needsClarification: true,
                possibilities,
                suggestedQuestion: this._generateClarificationQuestion(possibilities)
            };

        } catch (error) {
            logger.error('[消歧] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    _analyzePossibilities(input, context) {
        const possibilities = [];

        // 基于关键词分析
        if (input.includes('打开') || input.includes('启动')) {
            possibilities.push({ type: 'action', action: 'open', confidence: 0.8 });
        }

        if (input.includes('分析') || input.includes('查看')) {
            possibilities.push({ type: 'query', action: 'analyze', confidence: 0.7 });
        }

        if (input.includes('生成') || input.includes('创建')) {
            possibilities.push({ type: 'task', action: 'generate', confidence: 0.8 });
        }

        return possibilities;
    }

    _generateClarificationQuestion(possibilities) {
        if (possibilities.length === 2) {
            return `请问您是想${possibilities[0].action}还是${possibilities[1].action}？`;
        }

        return '请问您具体想做什么？';
    }

    _generateOptions(context) {
        const options = ['打开', '查看'];

        if (context.lastFiles?.length > 0) {
            options.push('处理文件');
        }

        return options;
    }
}

module.exports = new DisambiguationEngine();