/**
 * 日记内容生成器
 */

const memoryService = require('../memory_service');

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

class ContentGenerator {
    /**
     * 获取过去一周的记忆数据
     */
    getWeeklyMemories() {
        const oneWeekAgo = Date.now() - ONE_WEEK_MS;
        const allMemories = memoryService.getAllMemories();

        return allMemories.filter(m => m.timestamp > oneWeekAgo);
    }

    /**
     * 生成日记内容
     */
    generate() {
        const memories = this.getWeeklyMemories();

        if (memories.length === 0) {
            return {
                text: '<style>调皮</style>这一周好像没什么特别的事情发生呢～过得平平淡淡，不过平淡也是一种幸福啦！',
                hasContent: false
            };
        }

        // 提取重要事件
        const importantEvents = memories
            .filter(m => m.importance > 0.5 || m.emotionIntensity > 0.6)
            .slice(0, 5);

        if (importantEvents.length === 0) {
            return {
                text: '<style>温柔</style>这一周和你聊了很多呢，虽然没有什么大事，但每天的陪伴都很珍贵～',
                hasContent: false
            };
        }

        // 构建日记内容
        const lines = ['<style>开心</style>让我来回顾一下这一周的重要时刻吧！'];

        importantEvents.forEach((event, index) => {
            const date = new Date(event.timestamp);
            const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`;
            const emotion = event.emotion || '开心';

            lines.push(`<style>${emotion}</style>${dateStr}：${event.summary || event.content.substring(0, 50)}`);
        });

        lines.push('<style>调皮</style>这一周真是丰富多彩呢！期待下一周的故事～');

        return {
            text: lines.join('\n'),
            hasContent: true,
            eventCount: importantEvents.length
        };
    }
}

module.exports = new ContentGenerator();