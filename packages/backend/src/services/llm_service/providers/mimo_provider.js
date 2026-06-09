/**
 * @file mimo_provider.js
 * @description MiMo LLM 提供者 - 主对话 LLM 服务，支持 Function Calling 工具调用循环和多种内置工具执行
 * @module llm_service/providers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');
const { buildSystemPrompt, buildUserPrompt, parseLLMResponse } = require('../prompt_builder');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/** 工具调用最大循环轮数 - 防止无限循环 */
const MAX_TOOL_ROUNDS = 8;

/** 简单调用请求超时时间（毫秒） */
const SIMPLE_CALL_TIMEOUT = 30000;

/** 工具调用请求超时时间（毫秒） - 工具执行可能耗时较长 */
const TOOL_CALL_TIMEOUT = 120000;

/** 健康检查超时时间（毫秒） */
const HEALTH_CHECK_TIMEOUT = 5000;

/** 文件读取最大字符数 - 防止读取超大文件导致内存溢出 */
const MAX_FILE_READ_CHARS = 50000;

/** 直接调用最大生成 token 数 */
const DIRECT_CALL_MAX_TOKENS = 1500;

/** 网页搜索结果最大返回条数 */
const MAX_SEARCH_RESULTS = 5;

class MimoProvider {
    constructor() {
        this.apiKey = process.env.MIMO_API_KEY || '';
        this.apiUrl = process.env.MIMO_API_URL || 'https://api.mimoai.chat/v1/chat/completions';
        this.model = process.env.MIMO_MODEL || 'mimo-pro';
        this.maxToolRounds = MAX_TOOL_ROUNDS;
    }

    /**
     * @description 主调用方法 - 根据是否传入工具决定走简单调用还是工具调用循环
     * @param {string} text - 用户输入文本
     * @param {string} userText - 原始用户文本
     * @param {Array|null} tools - 可用工具列表（Function Calling）
     * @param {string} personality - 人格模式
     * @param {string|null} dialect - 方言模式
     * @param {Object} options - 额外选项
     * @returns {Promise<Object>} 回复结果 { success, text, emotion, raw, finishReason, message }
     */
    async call(text, userText = '', tools = null, personality = 'normal', dialect = null, options = {}) {
        if (!this.apiKey) {
            return { success: false, message: 'MiMo API 未配置' };
        }

        try {
            const systemPrompt = buildSystemPrompt(personality, dialect, text, options);
            const userPrompt = buildUserPrompt(text);

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            if (!tools) {
                // 无工具时走简单调用路径，降低延迟
                return await this._simpleCall(messages);
            }

            // 有工具时走工具调用循环路径
            return await this._toolCallingLoop(messages, tools, personality);

        } catch (error) {
            console.error('[MimoProvider] 调用失败:', error.message);
            return {
                success: false,
                message: `MiMo调用失败: ${error.message}`
            };
        }
    }

    /**
     * @description 简单调用 - 不使用工具的直接 LLM 调用
     * @param {Array<Object>} messages - 消息列表
     * @returns {Promise<Object>} 回复结果 { success, text, emotion, raw, finishReason, message }
     */
    async _simpleCall(messages) {
        const requestBody = {
            model: this.model,
            messages,
            temperature: 0.8,
            max_tokens: 2000
        };

        const response = await axios.post(this.apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            timeout: 30000,
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
            raw: parsed.raw,
            finishReason: choice.finish_reason
        };
    }

    /**
     * @description 工具调用循环 - 持续调用 LLM 直到不再产生工具调用或达到最大轮数
     * @param {Array<Object>} messages - 消息列表（会被修改）
     * @param {Array} tools - 可用工具定义列表
     * @param {string} personality - 人格模式
     * @returns {Promise<Object>} 回复结果 { success, text, emotion, raw, finishReason }
     */
    async _toolCallingLoop(messages, tools, personality) {
        let round = 0;
        let lastText = '';

        while (round < this.maxToolRounds) {
            round++;
            console.log(`[MimoProvider] 工具调用第 ${round} 轮`);

            const requestBody = {
                model: this.model,
                messages,
                tools,
                tool_choice: 'auto',
                temperature: 0.7,
                max_tokens: 4000
            };

            const response = await axios.post(this.apiUrl, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: 120000,
                proxy: false
            });

            const choice = response.data?.choices?.[0];
            if (!choice) {
                return { success: false, message: '无效的API响应' };
            }

            const assistantMessage = choice.message;
            messages.push(assistantMessage);

            // LLM 不再发起工具调用时，表示任务完成，直接返回解析后的文本
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                const parsed = parseLLMResponse(assistantMessage.content);
                lastText = parsed.text;
                return {
                    success: true,
                    text: parsed.text,
                    emotion: parsed.emotion,
                    raw: parsed.raw,
                    finishReason: choice.finish_reason
                };
            }

            for (const toolCall of assistantMessage.tool_calls) {
                const toolName = toolCall.function.name;
                let toolArgs;
                try {
                    toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                } catch (e) {
                    toolArgs = {};
                }

                console.log(`[MimoProvider] 执行工具: ${toolName}, 参数: ${JSON.stringify(toolArgs).substring(0, 200)}`);
                const toolResult = await this._executeTool(toolName, toolArgs);

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
                });
            }
        }

        if (!lastText) {
            messages.push({
                role: 'user',
                content: `请根据以上工具执行结果，给出完整的回复。

【重要 - 必须照做】
当 generate_table 工具执行成功后：
1. 工具会返回一个JSON，格式如下：
   {"success":true,"filename":"文件名.xlsx","previewUrl":"http://localhost:3000/online-table.html?file=文件名.xlsx",...}
2. 你必须提取 JSON 中的 filename 字段，然后生成以下格式的回复（直接复制下面的格式，只替换"文件名.xlsx"）：
📊 Excel表格已生成：[在线查看和编辑](http://localhost:3000/online-table.html?file=文件名.xlsx)
💾 也可以直接下载：[下载Excel](http://localhost:3000/uploads/generated/文件名.xlsx)

【注意】不要省略链接！这是用户查看结果的主要方式。

当 generate_chart 工具执行成功后，格式：
📈 图表已生成：[查看图表](http://localhost:3000/uploads/charts/图表文件名.png)

【数据分析回复包含以下4项】
1. Markdown表格 — 数据概览（| 列1 | 列2 | ...）
2. **加粗**关键数据 — 如 **xxx最高**、**增长xx%**
3. 分析结论 — 有序列表的趋势分析
4. 图表（如需要）— generate_chart 生成`
            });
            try {
                const finalResult = await this._simpleCall(messages);
                lastText = finalResult.text || '任务已完成';
            } catch (e) {
                lastText = '任务执行完成，但无法生成总结。';
            }
        }

        return {
            success: true,
            text: lastText,
            emotion: null,
            raw: lastText,
            finishReason: 'tool_rounds_exceeded'
        };
    }

    /**
     * @description 执行指定工具 - 根据工具名路由到对应的执行逻辑
     * @param {string} toolName - 工具名称
     * @param {Object} args - 工具参数
     * @returns {Promise<string>} 工具执行结果（字符串形式）
     */
    async _executeTool(toolName, args) {
        try {
            switch (toolName) {
                case 'search_web':
                case 'web_search': {
                    return await this._webSearch(args.query || args.keyword || args.q || '');
                }

                case 'file_write':
                case 'write_file': {
                    const filePath = this._resolvePath(args.path || args.filepath || args.filename || args.file_path);
                    const dir = path.dirname(filePath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(filePath, args.content || '', 'utf-8');
                    console.log(`[MimoProvider] 文件已写入: ${filePath}`);
                    return `文件已成功保存到: ${filePath}`;
                }

                case 'file_read':
                case 'read_file': {
                    const filePath = this._resolvePath(args.path || args.filepath || args.filename || args.file_path);
                    if (!fs.existsSync(filePath)) return `文件不存在: ${filePath}`;
                    const content = fs.readFileSync(filePath, 'utf-8');
                    return content.substring(0, 50000);
                }

                case 'list_directory': {
                    const dirPath = this._resolvePath(args.path || args.dirpath || args.dir_path || '.');
                    if (!fs.existsSync(dirPath)) return `目录不存在: ${dirPath}`;
                    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                    return entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
                }

                case 'launch_app': {
                    const { stdout, stderr } = await execAsync(args.command || args.path || 'echo ok', {
                        timeout: 10000
                    });
                    return (stdout || '') + (stderr ? `\nSTDERR: ${stderr}` : '');
                }

                case 'calculator': {
                    try {
                        const result = eval(args.expression || args.expr || '0');
                        return String(result);
                    } catch (e) {
                        return `计算错误: ${e.message}`;
                    }
                }

                case 'code_execute': {
                    const systemControl = require('../../system_control/main');
                    const result = await systemControl._executeCode(args.code, args.language || 'python');
                    return result.message || result.output || JSON.stringify(result);
                }

                case 'generate_chart': {
                    const systemControl = require('../../system_control/main');
                    const result = await systemControl._generateChart(args);
                    if (result.success && result.chartUrl) {
                        return `图表已生成！访问地址: http://localhost:3000${result.chartUrl}\n文件名: ${result.filename}`;
                    }
                    return result.message || '图表生成失败';
                }

                case 'generate_table': {
                    // 使用 content_generation 服务生成 Excel/CSV 表格
                    const ContentGenerationClass = require('../../content_generation');
                    const ContentGeneration = new ContentGenerationClass();
                    try {
                        // 解析数据 - 支持多种格式
                        let tableData = {};

                        if (args.data) {
                            tableData = { data: args.data };
                        } else {
                            // 直接传入 headers 和 rows
                            tableData = {
                                data: {
                                    headers: args.headers || [],
                                    rows: args.rows || []
                                }
                            };
                        }

                        // 文件名
                        if (args.filename) {
                            tableData.filename = args.filename;
                        }

                        // 格式：xlsx, csv, json, markdown
                        tableData.format = args.format || 'xlsx';

                        const result = await ContentGeneration.generateTable(tableData);
                        if (result.success) {
                            // 提取文件名用于构建预览URL
                            const filename = result.filepath ? result.filepath.split(/[/\\]/).pop() : '';
                            // 返回下载链接和预览信息
                            return JSON.stringify({
                                success: true,
                                message: '表格文件已生成！',
                                filename: filename,
                                url: result.url,
                                downloadUrl: `http://localhost:3000${result.url}`,
                                previewUrl: `http://localhost:3000/online-table.html?file=${encodeURIComponent(filename)}`,
                                onlineEditUrl: `http://localhost:3000/online-table.html?file=${encodeURIComponent(filename)}`,
                                rows: result.rows || 0,
                                format: result.format
                            });
                        }
                        return '表格生成失败: ' + (result.message || '未知错误');
                    } catch (e) {
                        return '表格生成失败: ' + e.message;
                    }
                }

                default: {
                    try {
                        const mcpClientManager = require('../../mcpClientManager');
                        if (mcpClientManager && typeof mcpClientManager.callTool === 'function') {
                            const mcpResult = await mcpClientManager.callTool(toolName, args);
                            if (mcpResult) return mcpResult;
                        }
                    } catch (e) {}

                    return `未知工具: ${toolName}`;
                }
            }
        } catch (error) {
            console.error(`[MimoProvider] 工具执行失败 ${toolName}: ${error.message}`);
            return `工具执行失败: ${error.message}`;
        }
    }

    /**
     * @description 解析文件路径 - 支持绝对路径、相对路径、~ 路径和"桌面"中文路径
     * @param {string} inputPath - 输入路径字符串
     * @returns {string} 解析后的绝对路径
     */
    _resolvePath(inputPath) {
        if (!inputPath) return process.cwd();
        if (path.isAbsolute(inputPath)) return inputPath;
        if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
            return path.join(os.homedir(), inputPath.substring(2));
        }
        const home = os.homedir();
        const desktopDirs = [
            path.join(home, 'OneDrive', 'Desktop'),
            path.join(home, 'Desktop')
        ];
        if (inputPath.includes('桌面') || inputPath.toLowerCase().includes('desktop')) {
            const filename = inputPath.replace(/.*[\/\\]/, '').replace(/^桌面[\/\\]?/, '');
            for (const d of desktopDirs) {
                if (fs.existsSync(d)) return path.join(d, filename || inputPath);
            }
        }
        return path.resolve(process.cwd(), inputPath);
    }

    /**
     * @description 网页搜索 - 依次尝试搜索服务、搜索引擎、Bing 网页抓取三种方式
     * @param {string} query - 搜索关键词
     * @returns {Promise<string>} 搜索结果文本
     */
    async _webSearch(query) {
        if (!query) return '搜索关键词为空';

        try {
            const webSearchService = require('../../webSearchService');
            if (webSearchService && typeof webSearchService.searchAndSummarize === 'function') {
                const result = await webSearchService.searchAndSummarize(query);
                if (result && (result.summary || result.message)) {
                    return result.summary || result.message;
                }
                if (result && result.results && result.results.length > 0) {
                    return result.results.slice(0, 5).map((r, i) =>
                        `${i + 1}. ${r.title || '无标题'}\n   ${r.snippet || r.description || ''}\n   ${r.url || r.link || ''}`
                    ).join('\n\n');
                }
            }
        } catch (e) {
            console.log(`[MimoProvider] 搜索服务失败: ${e.message}`);
        }

        try {
            const SearchEngines = require('../../webSearchService/search_engines').SearchEngines || require('../../webSearchService/search_engines');
            if (SearchEngines && typeof SearchEngines.search === 'function') {
                const results = await SearchEngines.search(query);
                if (results && results.length > 0) {
                    return results.slice(0, 5).map((r, i) =>
                        `${i + 1}. ${r.title || '无标题'}\n   ${r.snippet || r.description || ''}\n   ${r.url || r.link || ''}`
                    ).join('\n\n');
                }
            }
        } catch (e) {
            console.log(`[MimoProvider] 搜索引擎失败: ${e.message}`);
        }

        try {
            const encodedQuery = encodeURIComponent(query);
            const response = await axios.get(`https://www.bing.com/search?q=${encodedQuery}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000,
                proxy: false
            });
            const html = response.data;
            const titles = [];
            const regex = /<li class="b_algo"[^>]*>[\s\S]*?<h2[^>]*><a[^>]*>([\s\S]*?)<\/a>/g;
            let match;
            while ((match = regex.exec(html)) !== null && titles.length < 5) {
                titles.push(match[1].replace(/<[^>]+>/g, '').trim());
            }
            if (titles.length > 0) {
                return titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
            }
        } catch (e) {
            console.log(`[MimoProvider] Bing搜索失败: ${e.message}`);
        }

        return `搜索"${query}"暂无结果。建议直接访问搜索引擎查询。`;
    }

    /**
     * @description 直接调用 - 不构建系统提示词，直接发送 prompt 给 LLM
     * @param {string} prompt - 直接发送的提示词
     * @param {string} userText - 用户文本（当前未使用）
     * @returns {Promise<Object>} 回复结果 { success, text, message }
     */
    async callDirect(prompt, userText = '') {
        if (!this.apiKey) {
            return { success: false, message: 'MiMo API 未配置' };
        }

        try {
            const messages = [
                { role: 'user', content: prompt }
            ];

            const response = await axios.post(this.apiUrl, {
                model: this.model,
                messages,
                temperature: 0.7,
                max_tokens: 1500
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: 30000,
                proxy: false
            });

            const content = response.data?.choices?.[0]?.message?.content || '';
            return { success: true, text: content };

        } catch (error) {
            console.error('[MimoProvider] 直接调用失败:', error.message);
            return { success: false, message: error.message };
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
                timeout: 5000,
                proxy: false
            });
            return response.status === 200;
        } catch (e) {
            return false;
        }
    }
}

module.exports = new MimoProvider();
