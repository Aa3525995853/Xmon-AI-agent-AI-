/**
 * @file kimi_provider.js
 * @description Kimi LLM 提供者 - 基于 Moonshot API 的降级 LLM 服务，主服务不可用时自动切换
 * @module llm_service/providers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');
const { buildSystemPrompt, buildUserPrompt, parseLLMResponse } = require('../prompt_builder');

/** Kimi API 默认请求超时时间（毫秒） */
const KIMI_REQUEST_TIMEOUT = 30000;

/** Kimi API 健康检查超时时间（毫秒） */
const KIMI_HEALTH_TIMEOUT = 5000;

/** Kimi 默认生成温度 - 较高温度保证降级时仍有创造性 */
const KIMI_DEFAULT_TEMPERATURE = 0.8;

/** Kimi 默认最大生成 token 数 */
const KIMI_MAX_TOKENS = 2000;

class KimiProvider {
    constructor() {
        this.apiKey = process.env.KIMI_API_KEY || '';
        this.apiUrl = process.env.KIMI_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
        this.model = process.env.KIMI_MODEL || 'moonshot-v1-8k';
    }

    /**
     * @description 调用 Kimi LLM 生成回复
     * @param {string} text - 用户输入文本
     * @param {Array|null} tools - 可用工具列表（Function Calling）
     * @param {string} personality - 人格模式
     * @param {string|null} dialect - 方言模式
     * @returns {Promise<Object>} 回复结果 { success, text, emotion, raw, message }
     */
    async call(text, tools = null, personality = 'normal', dialect = null) {
        if (!this.apiKey) {
            return { success: false, message: 'Kimi API 未配置' };
        }

        try {
            const systemPrompt = buildSystemPrompt(personality, dialect, text);
            const userPrompt = buildUserPrompt(text);

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const requestBody = {
                model: this.model,
                messages,
                temperature: KIMI_DEFAULT_TEMPERATURE,
                max_tokens: KIMI_MAX_TOKENS
            };

            // 仅在传入工具时附加 tools 字段，避免空数组导致 API 报错
            if (tools) {
                requestBody.tools = tools;
            }

            const response = await axios.post(this.apiUrl, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: KIMI_REQUEST_TIMEOUT,
                proxy: false
            });

            const choice = response.data?.choices?.[0];
            if (!choice) {
                return { success: false, message: '无效的API响应' };
            }

            const message = choice.message;
            const parsed = parseLLMResponse(message.content);

            return {
                success: true,
                text: parsed.text,
                emotion: parsed.emotion,
                raw: parsed.raw
            };

        } catch (error) {
            console.error('[KimiProvider] 调用失败:', error.message);
            return {
                success: false,
                message: `Kimi调用失败: ${error.message}`
            };
        }
    }

    /**
     * @description 健康检查 - 发送最小请求验证 API 可用性
     * @returns {Promise<boolean>} API 是否可用
     */
    async healthCheck() {
        if (!this.apiKey) return false;
        try {
            const response = await axios.post(this.apiUrl, {
                model: this.model,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 10
            }, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
                timeout: KIMI_HEALTH_TIMEOUT,
                proxy: false
            });
            return response.status === 200;
        } catch (e) {
            return false;
        }
    }
}

module.exports = new KimiProvider();