/**
 * @file workbrain_provider.js
 * @description 工作大脑提供者 - 基于火山引擎 Coding Agent 的任务执行 LLM，内置熔断器保护
 * @module llm_service/providers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');
const { buildSystemPrompt, buildUserPrompt, parseLLMResponse } = require('../prompt_builder');

// ============================================================
// 模块名称：熔断器
// 功能说明：当工作大脑连续失败超过阈值时自动熔断，防止雪崩
// ============================================================

/** 熔断器状态 - open=true 表示正常可用，open=false 表示熔断中 */
const CIRCUIT = { open: true, failCount: 0, lastFail: 0, threshold: 3, recoveryTime: 60000 };

/** 工作大脑请求超时时间（毫秒） - 任务执行可能耗时较长 */
const WORKBRAIN_REQUEST_TIMEOUT = 60000;

/** 健康检查超时时间（毫秒） */
const WORKBRAIN_HEALTH_TIMEOUT = 5000;

/** 工作大脑默认生成温度 */
const WORKBRAIN_TEMPERATURE = 0.7;

/** 工作大脑默认最大生成 token 数 */
const WORKBRAIN_MAX_TOKENS = 4000;

class WorkBrainProvider {
    constructor() {
        this.apiKey = process.env.WORKFLOW_API_KEY || '';
        this.apiUrl = process.env.WORKFLOW_API_URL || 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions';
        this.model = process.env.WORKFLOW_MODEL || 'deepseek-v4-pro';
    }

    /**
     * @description 调用工作大脑 - 带熔断器保护的任务执行 LLM
     * @param {string} text - 用户输入文本
     * @param {Object} options - 额外选项（context 等）
     * @param {Object} options.context - 上下文信息
     * @param {boolean} options.disableTools - 是否禁用工具调用（true 时直接返回文本）
     * @returns {Promise<Object>} 回复结果 { success, text, emotion, raw, needsExecution, toolCalls, message, circuitOpen }
     */
    async call(text, options = {}) {
        // 检查熔断器状态，熔断中则直接返回失败
        if (!this.isCircuitOpen()) {
            return { success: false, message: '工作大脑暂时不可用', circuitOpen: true };
        }

        if (!this.apiKey) {
            return { success: false, message: '工作大脑 API 未配置' };
        }

        const disableTools = options.disableTools === true;

        try {
            const systemPrompt = this._buildSystemPrompt();
            const userPrompt = buildUserPrompt(text, options.context);

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            // 禁用工具时直接返回文本，不发送 tools 参数
            const requestBody = {
                model: this.model,
                messages,
                temperature: 0.7,
                max_tokens: 4000
            };

            if (!disableTools) {
                requestBody.tools = this._getTools();
            }

            const response = await axios.post(this.apiUrl, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: disableTools ? 120000 : 60000,
                proxy: false
            });

            // 调用成功，重置熔断器计数
            this._circuitSuccess();

            const choice = response.data?.choices?.[0];
            if (!choice) {
                return { success: false, message: '无效的API响应' };
            }

            const message = choice.message;

            // 检查是否有工具调用 - 有则返回工具调用信息供外部执行
            if (message.tool_calls && message.tool_calls.length > 0) {
                return {
                    success: true,
                    needsExecution: true,
                    toolCalls: message.tool_calls,
                    text: message.content || ''
                };
            }

            const parsed = parseLLMResponse(message.content);

            return {
                success: true,
                text: parsed.text,
                emotion: parsed.emotion,
                raw: parsed.raw
            };

        } catch (error) {
            // 调用失败，增加熔断器计数
            this._circuitFail();
            console.error('[WorkBrainProvider] 调用失败:', error.message);

            return {
                success: false,
                message: `工作大脑调用失败: ${error.message}`
            };
        }
    }

    /**
     * @description 构建工作大脑专用的系统提示词
     * @returns {string} 系统提示词文本
     */
    _buildSystemPrompt() {
        return `你是一个任务执行助手，帮助用户完成复杂的工作任务。

核心能力：
1. 文件操作：读取、写入、创建、删除文件
2. 命令执行：运行命令行、脚本
3. 搜索信息：搜索网页、查询资料
4. 代码开发：编写、调试代码
5. 数据处理：分析、整理数据

工作流程：
1. 理解用户任务
2. 分解任务步骤
3. 逐步执行
4. 返回结果

重要原则：
- 优先使用工具完成具体任务
- 保持回复简洁明了
- 遇到问题主动说明`;
    }

    /**
     * @description 获取工作大脑可用的工具定义列表
     * @returns {Array<Object>} 工具定义数组（OpenAI Function Calling 格式）
     */
    _getTools() {
        return [
            {
                type: 'function',
                function: {
                    name: 'file_read',
                    description: '读取文件内容',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: '文件路径' }
                        },
                        required: ['path']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'file_write',
                    description: '写入文件内容',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: '文件路径' },
                            content: { type: 'string', description: '文件内容' }
                        },
                        required: ['path', 'content']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'file_list',
                    description: '列出目录内容',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: '目录路径' }
                        },
                        required: ['path']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'shell_execute',
                    description: '执行命令行',
                    parameters: {
                        type: 'object',
                        properties: {
                            command: { type: 'string', description: '命令行指令' }
                        },
                        required: ['command']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'web_search',
                    description: '搜索网页',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: '搜索关键词' }
                        },
                        required: ['query']
                    }
                }
            }
        ];
    }

    // ============================================================
    // 模块名称：熔断器管理
    // 功能说明：管理熔断器的状态转换，包括失败计数、熔断触发和自动恢复
    // ============================================================

    /**
     * @description 检查熔断器是否处于开放状态（允许请求通过）
     * @returns {boolean} 熔断器是否开放（true=允许请求，false=熔断中）
     */
    isCircuitOpen() {
        if (!CIRCUIT.open) {
            // 超过恢复时间后自动半开，允许重试
            if (Date.now() - CIRCUIT.lastFail > CIRCUIT.recoveryTime) {
                CIRCUIT.open = true;
                CIRCUIT.failCount = 0;
            }
        }
        return CIRCUIT.open;
    }

    /**
     * @description 记录一次失败 - 失败次数达到阈值时触发熔断
     */
    _circuitFail() {
        CIRCUIT.failCount++;
        CIRCUIT.lastFail = Date.now();
        if (CIRCUIT.failCount >= CIRCUIT.threshold) {
            CIRCUIT.open = false;
            console.log('[WorkBrainProvider] 熔断器打开');
        }
    }

    /**
     * @description 记录一次成功 - 重置熔断器计数
     */
    _circuitSuccess() {
        CIRCUIT.failCount = 0;
        CIRCUIT.open = true;
    }

    /**
     * @description 健康检查 - 验证工作大脑 API 可用性
     * @returns {Promise<boolean>} API 是否可用
     */
    async healthCheck() {
        if (!this.apiKey) return false;
        if (this.isCircuitOpen()) return false;

        try {
            const response = await axios.post(this.apiUrl, {
                model: this.model,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 10
            }, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
                timeout: 5000,
                proxy: false
            });
            return response.status === 200;
        } catch (e) {
            this._circuitFail();
            return false;
        }
    }
}

module.exports = new WorkBrainProvider();