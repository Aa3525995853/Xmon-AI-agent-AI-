/**
 * 情景记忆管理器
 */

class EpisodicMemory {
    constructor() {
        this.memories = [];
    }

    /**
     * 记录情景
     */
    record(event, context, episodicMemory) {
        const memory = {
            id: `epi_${Date.now().toString(36)}`,
            timestamp: Date.now(),
            event: event,
            context: {
                input: context.input,
                intent: context.intent,
                params: context.params
            },
            outcome: context.outcome,
            emotionalTag: context.emotionalTag
        };

        episodicMemory.push(memory);

        // 只保留最近的记忆
        if (episodicMemory.length > 100) {
            episodicMemory.splice(0, episodicMemory.length - 100);
        }
    }

    /**
     * 清除
     */
    clear() {
        this.memories = [];
    }
}

module.exports = new EpisodicMemory();