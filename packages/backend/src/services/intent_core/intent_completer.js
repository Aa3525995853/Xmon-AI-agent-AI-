/**
 * 意图补全器
 */

const { logger } = require('../../utils/logger');

class IntentCompleter {
    constructor() {
        this.completionStrategies = this._initStrategies();
    }

    _initStrategies() {
        return {
            file: {
                triggers: ['那个', '这个', '上次', '之前的'],
                resolve: async (trigger, context) => {
                    if (context.lastFiles?.length > 0) {
                        return context.lastFiles[0];
                    }
                    return null;
                }
            },
            operation: {
                triggers: ['做', '处理', '整理'],
                resolve: async (trigger, context) => {
                    if (context.lastTask?.operation) {
                        return context.lastTask.operation;
                    }
                    return null;
                }
            },
            target: {
                triggers: ['它', '这个', '那个'],
                resolve: async (trigger, context) => {
                    if (context.lastResults) {
                        return context.lastResults;
                    }
                    return null;
                }
            }
        };
    }

    async complete(intent, context) {
        if (!intent.success) return intent;

        // 检查是否需要补全
        const needsCompletion = this._checkNeedsCompletion(intent);

        if (!needsCompletion) {
            return intent;
        }

        // 执行补全
        const completed = await this._fillMissing(intent, context);

        return {
            ...completed,
            wasCompleted: true,
            completionDetails: needsCompletion
        };
    }

    _checkNeedsCompletion(intent) {
        const missing = [];

        // 检查必要参数
        if (!intent.target && ['task', 'action'].includes(intent.type)) {
            missing.push('target');
        }

        // 检查模糊引用
        if (intent.rawInput?.includes('那个') || intent.rawInput?.includes('这个')) {
            missing.push('reference');
        }

        return missing;
    }

    async _fillMissing(intent, context) {
        const completed = { ...intent };

        for (const [strategyName, strategy] of Object.entries(this.completionStrategies)) {
            const hasTrigger = strategy.triggers.some(t =>
                intent.rawInput?.includes(t)
            );

            if (hasTrigger) {
                const resolved = await strategy.resolve(null, context);
                if (resolved) {
                    completed[strategyName] = resolved;
                }
            }
        }

        return completed;
    }
}

module.exports = new IntentCompleter();