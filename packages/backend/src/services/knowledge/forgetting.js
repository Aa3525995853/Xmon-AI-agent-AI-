/**
 * 遗忘机制
 */

const FORGETTING_CONFIG = {
    decayRate: 0.95,
    minStrength: 0.1,
    decayInterval: 24 * 60 * 60 * 1000,  // 24小时
    maxEpisodicAge: 7 * 24 * 60 * 60 * 1000  // 7天
};

class Forgetting {
    constructor() {
        this.config = FORGETTING_CONFIG;
    }

    /**
     * 应用遗忘
     */
    apply(semanticMemory, proceduralMemory, episodicMemory) {
        const now = Date.now();

        // 遗忘语义记忆
        if (semanticMemory?.memories) {
            for (const [key, memory] of semanticMemory.memories) {
                const age = now - memory.lastAccess;
                if (age > this.config.decayInterval) {
                    memory.strength *= this.config.decayRate;

                    if (memory.strength < this.config.minStrength) {
                        semanticMemory.memories.delete(key);
                    }
                }
            }
        }

        // 遗忘程序记忆（更慢）
        if (proceduralMemory?.memories) {
            for (const [pattern, habit] of proceduralMemory.memories) {
                const age = now - habit.lastUsed;
                if (age > this.config.decayInterval * 7) {
                    habit.strength *= this.config.decayRate;

                    if (habit.strength < this.config.minStrength) {
                        proceduralMemory.memories.delete(pattern);
                    }
                }
            }
        }

        // 清理过期情景记忆
        if (episodicMemory?.memories) {
            episodicMemory.memories = episodicMemory.memories.filter(m =>
                (now - m.timestamp) < this.config.maxEpisodicAge
            );
        }
    }
}

module.exports = new Forgetting();