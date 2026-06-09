/**
 * 任务上下文管理
 */

const { legacyMemoryService: memoryService } = require('../memory_service');

class TaskContext {
    constructor() {
        this.stack = [];
    }

    /**
     * 获取当前上下文
     */
    getCurrent() {
        const conversationHistory = memoryService.getConversationHistory(10);

        return {
            currentTask: this.stack[this.stack.length - 1] || null,
            lastTask: this.stack[this.stack.length - 2] || null,
            conversationHistory
        };
    }

    /**
     * 更新上下文
     */
    update(intent, entities) {
        const taskContext = { intent, entities, timestamp: Date.now() };

        if (this.stack.length > 0) {
            const current = this.stack[this.stack.length - 1];
            if (current.intent !== intent) {
                this.stack.push(taskContext);
            } else {
                current.entities = { ...current.entities, ...entities };
                current.timestamp = Date.now();
            }
        } else {
            this.stack.push(taskContext);
        }

        // 限制栈深度
        if (this.stack.length > 5) {
            this.stack.shift();
        }
    }

    /**
     * 弹出任务
     */
    pop() {
        if (this.stack.length > 0) {
            this.stack.pop();
        }
    }

    /**
     * 获取任务状态
     */
    getStatus() {
        const current = this.stack[this.stack.length - 1];
        if (!current) return null;

        const clarificationEngine = require('./clarification_engine');
        const missingFields = clarificationEngine.checkMissing(current.intent, current.entities);

        return {
            intent: current.intent,
            entities: current.entities,
            isComplete: missingFields.length === 0
        };
    }
}

module.exports = new TaskContext();