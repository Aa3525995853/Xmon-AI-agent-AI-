/**
 * 上下文管理器
 */

const { logger } = require('../../utils/logger');

class ContextManager {
    constructor() {
        this.contexts = new Map();
        this.contextWindow = 10;
    }

    async getContext(conversationId) {
        if (!conversationId) {
            return this._createEmptyContext();
        }

        const context = this.contexts.get(conversationId);
        if (context) {
            return context;
        }

        return this._createEmptyContext();
    }

    async updateContext(conversationId, updates) {
        if (!conversationId) return;

        let context = this.contexts.get(conversationId);
        if (!context) {
            context = this._createEmptyContext(conversationId);
        }

        Object.assign(context, updates);
        context.updatedAt = Date.now();

        this.contexts.set(conversationId, context);
    }

    _createEmptyContext(conversationId = null) {
        return {
            conversationId,
            lastTopic: null,
            lastTask: null,
            lastFiles: [],
            lastUrls: [],
            lastResults: null,
            entities: {},
            pendingClarifications: [],
            history: []
        };
    }

    clearContext(conversationId) {
        if (conversationId) {
            this.contexts.delete(conversationId);
        }
    }

    getActiveContexts() {
        return Array.from(this.contexts.keys());
    }
}

module.exports = new ContextManager();