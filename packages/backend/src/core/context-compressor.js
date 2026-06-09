/**
 * @file context-compressor.js
 * @description 上下文压缩器，智能压缩冗余上下文以节省 token，支持滑动窗口、摘要和混合压缩策略
 * @module core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心理念：
 * - 智能压缩冗余的上下文，把算力留给当下的关键任务
 * - 保留关键信息，丢弃重复/过时内容
 * - 支持摘要压缩和滑动窗口
 */

/** 默认最大 token 数，超过此值触发压缩 */
const DEFAULT_MAX_TOKENS = 4000;
/** 触发摘要压缩的阈值比例（占 maxTokens 的比例） */
const DEFAULT_SUMMARY_THRESHOLD = 0.8;
/** 保留的最近消息数量，这些消息不会被摘要压缩 */
const DEFAULT_PRESERVE_RECENT_COUNT = 4;
/** 混合压缩中，旧消息允许占用的最大 token 比例 */
const HYBRID_OLD_MESSAGE_TOKEN_RATIO = 0.4;
/** 摘要生成时，用户消息截断长度 */
const SUMMARY_USER_MSG_MAX_LENGTH = 50;
/** 摘要生成时，助手消息截断长度 */
const SUMMARY_ASSISTANT_MSG_MAX_LENGTH = 80;
/** 摘要生成时，最少关键点数量（少于此数直接拼接） */
const SUMMARY_MIN_KEYPOINTS = 3;
/** 摘要生成时，最多保留的关键点数量 */
const SUMMARY_MAX_KEYPOINTS = 5;
/** 消息最小有效长度，低于此值的消息不参与摘要 */
const MIN_MESSAGE_LENGTH = 5;

class ContextCompressor {
    /**
     * @description 构造函数，初始化压缩参数
     * @param {Object} [options={}] - 配置选项
     * @param {number} [options.maxTokens] - 最大 token 数
     * @param {number} [options.summaryThreshold] - 摘要压缩阈值比例
     * @param {number} [options.preserveRecentCount] - 保留最近消息数
     */
    constructor(options = {}) {
        this.maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
        this.summaryThreshold = options.summaryThreshold || DEFAULT_SUMMARY_THRESHOLD;
        this.preserveRecentCount = options.preserveRecentCount || DEFAULT_PRESERVE_RECENT_COUNT;
    }

    /**
     * @description 压缩消息列表，根据策略选择滑动窗口、摘要或混合压缩
     * @param {Array} messages - 消息列表
     * @param {Object} [options={}] - 压缩选项
     * @param {string} [options.strategy='sliding_window'] - 压缩策略：sliding_window / summary / hybrid
     * @returns {Array} 压缩后的消息列表
     */
    compress(messages, options = {}) {
        if (!messages || messages.length === 0) return messages;

        const totalLength = messages.reduce((sum, m) => sum + this._estimateTokens(m.content || ''), 0);

        if (totalLength <= this.maxTokens) return messages;

        const strategy = options.strategy || 'sliding_window';

        switch (strategy) {
            case 'sliding_window':
                return this._slidingWindow(messages);
            case 'summary':
                return this._summaryCompress(messages);
            case 'hybrid':
            default:
                return this._hybridCompress(messages);
        }
    }

    /**
     * @description 滑动窗口压缩策略，保留最近的消息，丢弃最早的
     * @param {Array} messages - 消息列表
     * @returns {Array} 压缩后的消息列表
     */
    _slidingWindow(messages) {
        const systemMessages = messages.filter(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');

        let totalTokens = systemMessages.reduce((s, m) => s + this._estimateTokens(m.content || ''), 0);

        const kept = [];
        for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
            const msg = nonSystemMessages[i];
            const tokens = this._estimateTokens(msg.content || '');
            if (totalTokens + tokens > this.maxTokens) break;
            totalTokens += tokens;
            kept.unshift(msg);
        }

        if (kept.length < nonSystemMessages.length) {
            kept.unshift({
                role: 'system',
                content: `[之前的对话已压缩，共${nonSystemMessages.length - kept.length}条消息被省略]`
            });
        }

        return [...systemMessages, ...kept];
    }

    /**
     * @description 摘要压缩策略，将旧消息压缩为摘要，保留最近消息
     * @param {Array} messages - 消息列表
     * @returns {Array} 压缩后的消息列表
     */
    _summaryCompress(messages) {
        const systemMessages = messages.filter(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');

        if (nonSystemMessages.length <= this.preserveRecentCount * 2) {
            return messages;
        }

        const toCompress = nonSystemMessages.slice(0, -this.preserveRecentCount);
        const toKeep = nonSystemMessages.slice(-this.preserveRecentCount);

        const summary = this._generateSummary(toCompress);

        return [
            ...systemMessages,
            { role: 'system', content: `[对话摘要] ${summary}` },
            ...toKeep
        ];
    }

    /**
     * @description 混合压缩策略，结合滑动窗口和摘要压缩的优点
     * @param {Array} messages - 消息列表
     * @returns {Array} 压缩后的消息列表
     */
    _hybridCompress(messages) {
        const systemMessages = messages.filter(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');

        if (nonSystemMessages.length <= this.preserveRecentCount * 2) {
            return this._slidingWindow(messages);
        }

        const recent = nonSystemMessages.slice(-this.preserveRecentCount);
        const older = nonSystemMessages.slice(0, -this.preserveRecentCount);

        let totalTokens = systemMessages.reduce((s, m) => s + this._estimateTokens(m.content || ''), 0);
        totalTokens += recent.reduce((s, m) => s + this._estimateTokens(m.content || ''), 0);

        const compressedOlder = [];
        for (let i = older.length - 1; i >= 0; i--) {
            const tokens = this._estimateTokens(older[i].content || '');
            if (totalTokens + tokens > this.maxTokens * HYBRID_OLD_MESSAGE_TOKEN_RATIO) break;
            totalTokens += tokens;
            compressedOlder.unshift(older[i]);
        }

        const summary = compressedOlder.length < older.length
            ? this._generateSummary(older.slice(0, older.length - compressedOlder.length))
            : '';

        const result = [...systemMessages];
        if (summary) {
            result.push({ role: 'system', content: `[对话摘要] ${summary}` });
        }
        result.push(...compressedOlder, ...recent);

        return result;
    }

    /**
     * @description 从消息列表生成摘要文本
     * @param {Array} messages - 消息列表
     * @returns {string} 摘要文本
     */
    _generateSummary(messages) {
        const keyPoints = [];

        for (const msg of messages) {
            const content = (msg.content || '').trim();
            if (content.length < MIN_MESSAGE_LENGTH) continue;

            if (msg.role === 'user') {
                const short = content.length > SUMMARY_USER_MSG_MAX_LENGTH ? content.substring(0, SUMMARY_USER_MSG_MAX_LENGTH) + '...' : content;
                keyPoints.push(`用户问: ${short}`);
            } else if (msg.role === 'assistant') {
                const short = content.length > SUMMARY_ASSISTANT_MSG_MAX_LENGTH ? content.substring(0, SUMMARY_ASSISTANT_MSG_MAX_LENGTH) + '...' : content;
                keyPoints.push(`小梦答: ${short}`);
            }
        }

        if (keyPoints.length <= SUMMARY_MIN_KEYPOINTS) {
            return keyPoints.join('; ');
        }

        return keyPoints.slice(0, SUMMARY_MAX_KEYPOINTS).join('; ') + `; (共${keyPoints.length}条)`;
    }

    /**
     * @description 估算文本的 token 数，中文按1.5倍计算，英文按0.5倍计算
     * @param {string} text - 输入文本
     * @returns {number} 估算的 token 数
     */
    _estimateTokens(text) {
        if (!text) return 0;
        const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const otherChars = text.length - chineseChars;
        return Math.ceil(chineseChars * 1.5 + otherChars * 0.5);
    }
}

module.exports = new ContextCompressor();
