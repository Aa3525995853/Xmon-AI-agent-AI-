/**
 * 语义记忆管理器
 */

class SemanticMemory {
    constructor() {
        this.memories = new Map();
    }

    /**
     * 学习偏好
     */
    learn(preference, action, semanticMemory) {
        const key = preference.key || `${action}_${preference.context}`;

        semanticMemory.set(key, {
            type: 'preference',
            value: preference.value,
            action: action,
            strength: 1.0,
            lastAccess: Date.now(),
            accessCount: 1,
            confidence: preference.confidence || 0.8
        });
    }

    /**
     * 更新访问时间
     */
    updateAccess(key, semanticMemory) {
        const memory = semanticMemory.get(key);
        if (memory) {
            memory.lastAccess = Date.now();
            memory.accessCount++;
            memory.strength = Math.min(1, memory.strength * 1.1);
        }
    }

    /**
     * 清除
     */
    clear() {
        this.memories.clear();
    }
}

module.exports = new SemanticMemory();