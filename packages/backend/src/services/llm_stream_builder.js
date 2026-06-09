/**
 * @file llm_stream_builder.js
 * @description LLM 流式请求构建器
 * @module services
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */
const axios = require('axios');
const textProcessor = require('../utils/textProcessor');
const personalityManager = require('../config/personalities');
const { legacyMemoryService: memoryService } = require('./memory_service');
const { LLM_CONFIG, CONVERSATION_CONFIG } = require('../config/streamChatConfig');
const { logger } = require('../utils/logger');

/**
 * @description 选择 LLM 模型
 * @param {string} text - 用户输入文本
 * @returns {string} 选择的模型名称
 */
function selectModel(text) {
    return process.env.MIMO_MODEL || LLM_CONFIG.defaultModel;
}

/**
 * @description 获取系统提示词
 * @param {string} personality - 性格模式
 * @returns {string} 系统提示词
 */
function getSystemPrompt(personality = 'normal') {
    return personalityManager.getSystemPrompt(personality);
}

/**
 * @description 构建 LLM 请求消息列表
 * @param {string} text - 用户输入文本
 * @param {string} personality - 性格模式
 * @returns {Array<Object>} LLM 消息列表
 */
function buildLLMMessages(text, personality) {
    const systemPrompt = getSystemPrompt(personality);
    const history = memoryService.getConversationHistory(CONVERSATION_CONFIG.maxHistoryLength);
    logger.debug('[流式] 历史消息数', { count: history.length });

    return [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: text }
    ];
}

/**
 * @description 创建 LLM 流式请求
 * @param {string} text - 用户输入文本
 * @param {string} personality - 性格模式
 * @returns {Promise<Object>} axios 流式响应对象
 */
async function createLLMStreamRequest(text, personality) {
    const selectedModel = selectModel(text);
    const messages = buildLLMMessages(text, personality);
    const maxTokens = textProcessor.getMaxTokens(text);

    logger.info('[流式] 发起LLM请求', {
        model: selectedModel,
        maxTokens,
        messageCount: messages.length,
        lastMessage: messages[messages.length - 1]?.content?.substring(0, 50)
    });

    const requestBody = {
        model: selectedModel,
        messages,
        max_tokens: maxTokens,
        temperature: LLM_CONFIG.temperature,
        stream: true,
        ...(selectedModel === LLM_CONFIG.defaultModel ? { thinking: LLM_CONFIG.thinking } : {})
    };

    logger.debug('[流式] 请求体', { body: JSON.stringify(requestBody).substring(0, 200) });

    return axios.post(
        process.env.MIMO_API_URL,
        requestBody,
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MIMO_API_KEY}`
            },
            proxy: false,
            responseType: 'stream',
            timeout: LLM_CONFIG.timeout[selectedModel] || LLM_CONFIG.timeout.default
        }
    );
}

module.exports = {
    selectModel,
    getSystemPrompt,
    buildLLMMessages,
    createLLMStreamRequest
};