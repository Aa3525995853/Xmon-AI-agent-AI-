/**
 * @file llm/index.js
 * @description LLM 插件，提供大语言模型对话和复杂任务处理能力，
 *              支持模型降级链（主模型失败时自动切换到备用模型）
 * @module plugins/llm
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');

// LLM API 配置（从环境变量读取）
const VOLC_API_KEY = process.env.KIMI_API_KEY;
const VOLC_API_URL = process.env.KIMI_API_URL;
const VOLC_MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro';

// 模型降级链：主模型失败时依次尝试备用模型
const MODEL_FALLBACK_CHAIN = [
    { model: VOLC_MODEL, url: VOLC_API_URL, key: VOLC_API_KEY },
    { model: 'deepseek-v4-flash', url: VOLC_API_URL, key: VOLC_API_KEY }
];

// LLM 请求默认参数
const LLM_DEFAULT_TEMPERATURE = 0.3;
const LLM_DEFAULT_MAX_TOKENS = 2000;
const LLM_REQUEST_TIMEOUT = 60000;

class LLMPlugin {
    /**
     * @description 激活插件，注入服务总线依赖并初始化模型索引
     * @param {Object} deps - 插件依赖对象
     * @param {Object} deps.serviceBus - 服务总线，用于插件间通信和模型降级通知
     */
    activate(deps) {
        this.serviceBus = deps.serviceBus;
        // 当前使用的模型索引（用于降级追踪）
        this._currentModelIndex = 0;
    }

    /**
     * @description 停用插件，清理资源
     */
    deactivate() {}

    /**
     * @description 执行 LLM 插件能力，根据 capability 路由到对应的处理方法
     * @param {string} capability - 能力标识，支持 llm:chat（普通对话）和 llm:complex_task（复杂任务）
     * @param {Object} params - 参数对象
     * @param {string} params.prompt - 用户提示词
     * @returns {Promise<string>} LLM 生成的回复文本
     * @throws {Error} 未知能力标识时抛出异常
     */
    async execute(capability, params) {
        switch (capability) {
            case 'llm:chat':
                return await this._chat(params.prompt);
            case 'llm:complex_task':
                return await this._complexTask(params.prompt);
            default:
                throw new Error(`Unknown capability: ${capability}`);
        }
    }

    /**
     * @description 普通对话模式，直接将用户提示词发送给 LLM
     * @param {string} prompt - 用户提示词
     * @returns {Promise<string>} LLM 回复文本
     */
    async _chat(prompt) {
        return await this._callWithFallback([
            { role: 'user', content: prompt }
        ]);
    }

    /**
     * @description 复杂任务模式，添加系统提示词引导 LLM 直接给出结果
     * @param {string} prompt - 用户提示词
     * @returns {Promise<string>} LLM 回复文本
     */
    async _complexTask(prompt) {
        return await this._callWithFallback([
            { role: 'system', content: '你是一个高效的任务执行助手。请直接给出结果，不要解释过程。' },
            { role: 'user', content: prompt }
        ]);
    }

    /**
     * @description 带降级链的 LLM 调用，依次尝试降级链中的模型，
     *              主模型失败时自动切换到备用模型并通过服务总线通知降级事件
     * @param {Array<Object>} messages - LLM 消息列表
     * @param {string} messages[].role - 消息角色（system/user/assistant）
     * @param {string} messages[].content - 消息内容
     * @returns {Promise<string>} LLM 回复文本
     * @throws {Error} 所有模型都失败时抛出 'ALL_MODELS_FAILED' 异常
     */
    async _callWithFallback(messages) {
        for (let i = 0; i < MODEL_FALLBACK_CHAIN.length; i++) {
            const model = MODEL_FALLBACK_CHAIN[i];
            // 跳过未配置的模型（缺少 API Key 或 URL）
            if (!model.key || !model.url) continue;

            try {
                const response = await axios.post(
                    model.url,
                    { model: model.model, messages, temperature: LLM_DEFAULT_TEMPERATURE, max_tokens: LLM_DEFAULT_MAX_TOKENS },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${model.key}`
                        },
                        timeout: LLM_REQUEST_TIMEOUT
                    }
                );

                // 记录当前成功的模型索引
                this._currentModelIndex = i;
                return response.data.choices[0].message.content;
            } catch (e) {
                console.warn(`[LLM Plugin] 模型 ${model.model} 失败:`, e.message);
                // 通知服务总线模型降级事件，便于监控和日志记录
                if (i < MODEL_FALLBACK_CHAIN.length - 1) {
                    this.serviceBus.emitModelDegradation(model.model, MODEL_FALLBACK_CHAIN[i + 1].model);
                }
            }
        }

        throw new Error('ALL_MODELS_FAILED');
    }
}

module.exports = LLMPlugin;
