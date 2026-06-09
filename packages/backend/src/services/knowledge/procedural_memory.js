/**
 * 程序记忆管理器（习惯）
 */

class ProceduralMemory {
    constructor() {
        this.memories = new Map();
    }

    /**
     * 学习习惯
     */
    learn(action, context, proceduralMemory) {
        const pattern = this._generatePattern(action, context);
        const existing = proceduralMemory.get(pattern);

        if (existing) {
            existing.frequency++;
            existing.lastUsed = Date.now();
            existing.strength = Math.min(1, existing.strength + 0.1);
            existing.recentContexts.push({
                timestamp: Date.now(),
                params: context.params,
                success: context.success
            });

            if (existing.recentContexts.length > 10) {
                existing.recentContexts = existing.recentContexts.slice(-10);
            }
        } else {
            proceduralMemory.set(pattern, {
                pattern,
                action: action,
                params: context.params,
                frequency: 1,
                strength: 0.5,
                lastUsed: Date.now(),
                createdAt: Date.now(),
                recentContexts: [{
                    timestamp: Date.now(),
                    params: context.params,
                    success: context.success
                }]
            });
        }
    }

    /**
     * 生成习惯模式
     */
    _generatePattern(action, context) {
        const abstractContext = {
            action: action,
            targetType: context.targetType,
            location: context.location,
            timePeriod: this._getTimePeriod()
        };
        return JSON.stringify(abstractContext);
    }

    /**
     * 获取时间段
     */
    _getTimePeriod() {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 18) return 'afternoon';
        if (hour >= 18 && hour < 22) return 'evening';
        return 'night';
    }

    /**
     * 清除
     */
    clear() {
        this.memories.clear();
    }
}

module.exports = new ProceduralMemory();