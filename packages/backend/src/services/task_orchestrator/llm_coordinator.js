/**
 * @file llm_coordinator.js
 * @description LLM协调器 - 负责调度工作区Agent（火山引擎Coding Agent / Mimo）执行复杂任务，
 *              支持工具调用循环、降级策略、工作区日志推送等功能
 * @module task_orchestrator
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const axios = require('axios');
const { logger } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const serviceBus = require('../../core/service-bus');

// ============================================================
// 常量定义：替代魔法数字，集中管理配置阈值
// ============================================================

/** 最大工具调用轮数，让Agent自主决定何时完成，避免过早截断 */
const MAX_TOOL_ROUNDS = 30;

/** LLM生成温度参数，值越低输出越确定，越高越随机；0.7兼顾创意与稳定性 */
const LLM_TEMPERATURE = 0.7;

/** LLM单次响应最大token数，限制输出长度防止响应过长 */
const LLM_MAX_TOKENS = 4000;

/** LLM请求超时时间（毫秒），工具调用场景可能耗时较长，设为2分钟 */
const LLM_REQUEST_TIMEOUT = 120000;

/** 文件读取最大字符数，防止读取过大文件导致内存溢出 */
const FILE_READ_MAX_CHARS = 50000;

/** Shell/代码执行超时时间（毫秒），30秒足够大多数命令完成 */
const SHELL_EXEC_TIMEOUT = 30000;

/** 搜索结果最大返回条数，限制数量避免信息过载 */
const SEARCH_RESULT_LIMIT = 5;

// ============================================================
// 工作区日志推送模块
// 功能说明：向服务总线推送任务执行日志，供前端实时展示任务执行状态
// ============================================================

/**
 * 推送工作区日志事件
 * @param {string} taskId - 任务ID，用于关联同一任务的所有日志
 * @param {string} message - 日志消息内容，会展示在前端执行面板
 * @param {string} [level='info'] - 日志级别（info/success/warn/error）
 * @param {object} [extras={}] - 额外数据，如 category、provider、duration 等
 * @returns {void}
 */
function emitWorkLog(taskId, message, level = 'info', extras = {}) {
    const logEntry = {
        taskId,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        message,
        level,
        category: extras.category || 'info',
        ...extras
    };
    serviceBus.publish('work:log', logEntry);
}

// ============================================================
// LLM协调器核心类
// 功能说明：调度工作区Agent执行复杂任务，支持工具调用循环、
//          多模型降级策略、工作区日志推送
// ============================================================

class LLmCoordinator {
    /**
     * 初始化LLM协调器，加载环境变量配置和工作目录
     * @constructor
     */
    constructor() {
        // 火山引擎Coding Agent配置：优先使用 WORKFLOW_API_KEY
        this.apiKey = process.env.WORKFLOW_API_KEY || '';
        this.apiUrl = process.env.WORKFLOW_API_URL || 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions';
        this.model = process.env.WORKFLOW_MODEL || 'deepseek-v4-pro';

        // Mimo模型配置：作为火山引擎的降级备选方案
        this.mimoApiKey = process.env.MIMO_API_KEY || '';
        this.mimoApiUrl = process.env.MIMO_API_URL || 'https://api.mimoai.chat/v1/chat/completions';
        this.mimoModel = process.env.MIMO_MODEL || 'mimo-pro';

        this.workDir = this._detectWorkDir();
        this.desktopDir = this._detectDesktopDir();
        this.maxToolRounds = MAX_TOOL_ROUNDS;
    }

    /**
     * 检测用户工作目录，优先使用桌面路径
     * @returns {string} 工作目录的绝对路径
     * @private
     */
    _detectWorkDir() {
        const home = os.homedir();
        // 优先级：OneDrive桌面 > 普通桌面 > 用户主目录
        // OneDrive桌面在Windows企业环境中更常见
        const candidates = [
            path.join(home, 'OneDrive', 'Desktop'),
            path.join(home, 'Desktop'),
            home
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return home;
    }

    /**
     * 检测用户桌面目录路径，优先OneDrive桌面
     * @returns {string} 桌面目录的绝对路径
     * @private
     */
    _detectDesktopDir() {
        const home = os.homedir();
        const onedriveDesktop = path.join(home, 'OneDrive', 'Desktop');
        if (fs.existsSync(onedriveDesktop)) return onedriveDesktop;
        const normalDesktop = path.join(home, 'Desktop');
        if (fs.existsSync(normalDesktop)) return normalDesktop;
        return this.workDir;
    }

    // ============================================================
    // 任务执行模块
    // 功能说明：接收复杂任务，通过工具调用循环执行，
    //          失败时自动降级到Mimo模型重试
    // ============================================================

    /**
     * 执行复杂任务（公开入口方法）
     * @description 接收任务描述，通过工具调用循环执行；若主Agent失败则降级到Mimo重试
     * @param {string} taskId - 任务唯一标识
     * @param {string} description - 任务的自然语言描述
     * @param {object} [options={}] - 可选参数（预留扩展）
     * @returns {Promise<{taskId: string, status: string, response: string}>} 任务执行结果
     * @throws {Error} 当主Agent和降级Agent均失败时，返回failed状态而非抛出异常
     * @example
     * const result = await coordinator.executeComplexTask('task-1', '帮我搜索今日新闻并保存到桌面');
     * // result: { taskId: 'task-1', status: 'completed', response: '...' }
     */
    async executeComplexTask(taskId, description, options = {}) {
        logger.info(`[LLmCoordinator] 执行复杂任务: ${taskId}, 描述: ${description.substring(0, 80)}`);

        // 推送任务开始日志
        emitWorkLog(taskId, `📋 收到任务: ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`, 'info', { category: 'intent' });
        emitWorkLog(taskId, '🔍 正在理解意图...', 'info', { category: 'intent' });

        try {
            const result = await this._executeWithTools(taskId, description);
            return result;
        } catch (error) {
            logger.error(`[LLmCoordinator] 任务失败: ${error.message}`);
            emitWorkLog(taskId, `❌ 任务执行失败: ${error.message}`, 'error', { category: 'error' });
            try {
                return await this._callMimoFallback(taskId, description);
            } catch (fallbackErr) {
                return { taskId, status: 'failed', engine: 'workflow', response: `任务执行失败: ${error.message}` };
            }
        }
    }

    // ============================================================
    // 工具调用循环模块
    // 功能说明：核心执行循环 - 反复调用LLM并执行工具，
    //          直到LLM不再请求工具或达到最大轮数
    // ============================================================

    /**
     * 带工具调用的任务执行循环
     * @description 反复调用LLM，若LLM返回工具调用则执行工具并将结果反馈给LLM，
     *              直到LLM返回纯文本响应或达到最大轮数后请求总结
     * @param {string} taskId - 任务唯一标识
     * @param {string} description - 任务的自然语言描述
     * @returns {Promise<{taskId: string, status: string, response: string}>} 任务执行结果
     * @private
     */
    async _executeWithTools(taskId, description) {
        const messages = [
            { role: 'system', content: this._getSystemPrompt() },
            { role: 'user', content: description }
        ];

        let round = 0;
        let lastResponse = '';

        while (round < this.maxToolRounds) {
            round++;
            logger.info(`[LLmCoordinator] 第 ${round} 轮调用`);

            // 推送 LLM 调用开始日志
            // 判断实际使用的Agent：优先火山引擎Coding Agent，降级时用Mimo
            const useVolcano = !!this.apiKey;
            const provider = useVolcano ? 'volcano' : 'mimo';
            const model = useVolcano ? this.model : this.mimoModel;
            emitWorkLog(taskId, `🤖 LLM调用开始 (第${round}轮): ${provider}/${model}`, 'info', { category: 'llm', provider, model, round });

            const llmStartTime = Date.now();
            const llmResult = await this._callLLM(messages);
            const llmDuration = Date.now() - llmStartTime;

            if (!llmResult.choices || !llmResult.choices[0]) {
                // LLM返回了异常结构（无choices），尝试提取内容，否则返回默认文本
                const text = llmResult.choices?.[0]?.message?.content || '任务执行完成，但未获得有效响应';
                emitWorkLog(taskId, `✅ LLM调用完成 (第${round}轮), 耗时${llmDuration}ms`, 'success', { category: 'llm', provider, duration: llmDuration });
                return { taskId, status: 'completed', engine: 'workflow', response: text };
            }

            const choice = llmResult.choices[0];
            const assistantMessage = choice.message;

            messages.push(assistantMessage);

            // LLM未请求工具调用，说明已生成最终文本响应，退出循环
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                lastResponse = assistantMessage.content || '';
                emitWorkLog(taskId, `✅ LLM调用完成 (第${round}轮), 耗时${llmDuration}ms, 直接返回文本`, 'success', { category: 'llm', provider, duration: llmDuration });
                break;
            }

            // 推送步骤开始日志
            emitWorkLog(taskId, `📥 步骤开始: 执行 ${assistantMessage.tool_calls.length} 个工具调用`, 'info', { category: 'tool', toolCount: assistantMessage.tool_calls.length });

            for (const toolCall of assistantMessage.tool_calls) {
                const toolName = toolCall.function.name;
                let toolArgs;
                try {
                    toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                } catch (e) {
                    // LLM有时返回非法JSON参数，降级为空对象避免整个任务失败
                    toolArgs = {};
                }

                logger.info(`[LLmCoordinator] 执行工具: ${toolName}, 参数: ${JSON.stringify(toolArgs).substring(0, 200)}`);

                // 推送工具执行开始日志
                emitWorkLog(taskId, `🔧 工具执行: ${toolName}`, 'info', { category: 'tool', toolName, action: 'start' });

                const toolStartTime = Date.now();
                const toolResult = await this._executeTool(toolName, toolArgs);
                const toolDuration = Date.now() - toolStartTime;

                // 推送工具执行完成日志
                // 通过检查error属性或返回文本中包含"失败"来判断工具是否执行出错
                const isError = toolResult.error || (typeof toolResult === 'string' && toolResult.includes('失败'));
                emitWorkLog(taskId, isError ? `❌ 工具失败: ${toolName} (${toolDuration}ms) - ${toolResult.error || toolResult}` : `✅ 工具完成: ${toolName} (${toolDuration}ms)`, isError ? 'error' : 'success', { category: 'tool', toolName, duration: toolDuration, success: !isError });

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
                });
            }

            // 推送步骤完成日志
            emitWorkLog(taskId, `📤 步骤完成: ${assistantMessage.tool_calls.length} 个工具调用执行完毕`, 'success', { category: 'tool', toolCount: assistantMessage.tool_calls.length });
        }

        if (!lastResponse) {
            // 达到最大轮数但LLM仍在请求工具调用，主动请求最终总结以获取结果
            logger.info(`[LLmCoordinator] 达到最大轮数，请求最终总结`);
            emitWorkLog(taskId, `📝 达到最大轮数(${this.maxToolRounds})，请求最终总结`, 'info', { category: 'info' });
            messages.push({
                role: 'user',
                content: '请根据以上工具执行结果，给出最终总结。如果已经完成了文件保存等操作，请确认结果。'
            });
            try {
                const finalStartTime = Date.now();
                const finalResult = await this._callLLM(messages);
                const finalDuration = Date.now() - finalStartTime;
                lastResponse = finalResult.choices?.[0]?.message?.content || '';
                emitWorkLog(taskId, `✅ 最终总结完成 (${finalDuration}ms)`, 'success', { category: 'llm', duration: finalDuration });
            } catch (e) {
                // 最终总结LLM调用也失败时，回退到取最后一条工具执行结果作为响应
                const lastMsg = messages[messages.length - 1];
                if (lastMsg.role === 'tool') {
                    lastResponse = lastMsg.content;
                }
            }
        }

        return { taskId, status: 'completed', engine: 'workflow', response: lastResponse || '任务已完成' };
    }

    // ============================================================
    // LLM调用与降级模块
    // 功能说明：优先使用火山引擎Coding Agent调用LLM，
    //          失败时自动降级到Mimo模型
    // ============================================================

    /**
     * 调用LLM（含降级策略）
     * @description 优先使用火山引擎Coding Agent（工具调用优化），
     *              调用失败时自动降级到Mimo；若两者均未配置则抛出异常
     * @param {Array<{role: string, content: string}>} messages - 对话消息列表
     * @returns {Promise<object>} LLM响应数据，包含choices等字段
     * @throws {Error} 当火山引擎和Mimo均未配置或均调用失败时抛出
     * @private
     */
    async _callLLM(messages) {
        // 工作区Agent：优先使用火山引擎Coding Agent，不可用时降级到Mimo
        // 火山引擎Agent专为工具调用优化，是工作区的首选Agent
        // 判断条件：apiKey存在且不等于KIMI_API_KEY，说明WORKFLOW_API_KEY被单独配置了
        if (this.apiKey && this.apiKey !== process.env.KIMI_API_KEY) {
            try {
                const response = await axios.post(this.apiUrl, {
                    model: this.model,
                    messages,
                    tools: this._getTools(),
                    temperature: LLM_TEMPERATURE,
                    max_tokens: LLM_MAX_TOKENS
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: LLM_REQUEST_TIMEOUT,
                    proxy: false
                });
                return response.data;
            } catch (error) {
                logger.warn(`[LLmCoordinator] 火山引擎Agent调用失败: ${error.message}，降级到Mimo`);
                // 火山引擎失败，降级到Mimo
                if (this.mimoApiKey) {
                    return await this._callMimoLLM(messages);
                }
                throw error;
            }
        }

        // 火山引擎未配置，使用Mimo作为工作Agent
        if (this.mimoApiKey) {
            return await this._callMimoLLM(messages);
        }

        throw new Error('工作Agent不可用：火山引擎和Mimo均未配置');
    }

    /**
     * 调用Mimo LLM
     * @description 直接调用Mimo API，作为火山引擎的降级备选方案
     * @param {Array<{role: string, content: string}>} messages - 对话消息列表
     * @returns {Promise<object>} Mimo LLM响应数据
     * @throws {Error} 当Mimo API调用失败时抛出
     * @private
     */
    async _callMimoLLM(messages) {
        try {
            const response = await axios.post(this.mimoApiUrl, {
                model: this.mimoModel,
                messages,
                tools: this._getTools(),
                temperature: LLM_TEMPERATURE,
                max_tokens: LLM_MAX_TOKENS
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.mimoApiKey}`
                },
                timeout: LLM_REQUEST_TIMEOUT,
                proxy: false
            });
            return response.data;
        } catch (error) {
            logger.error(`[LLmCoordinator] Mimo LLM 调用失败: ${error.message}`);
            throw error;
        }
    }

    // ============================================================
    // 工具执行模块
    // 功能说明：根据工具名称分发执行，支持文件读写、目录列表、
    //          Shell命令执行、代码执行、网页搜索等6种工具
    // ============================================================

    /**
     * 执行指定工具并返回结果
     * @description 根据工具名称分发到对应的处理逻辑，支持file_read/file_write/file_list/
     *              shell_execute/code_execute/web_search六种工具
     * @param {string} toolName - 工具名称
     * @param {object} args - 工具参数对象，不同工具参数不同
     * @returns {Promise<string>} 工具执行结果（字符串形式，供LLM消费）
     * @private
     */
    async _executeTool(toolName, args) {
        try {
            switch (toolName) {
                case 'file_read': {
                    const filePath = this._resolvePath(args.path);
                    if (!fs.existsSync(filePath)) return `文件不存在: ${filePath}`;
                    const content = fs.readFileSync(filePath, 'utf-8');
                    return content.substring(0, FILE_READ_MAX_CHARS);
                }

                case 'file_write': {
                    const filePath = this._resolvePath(args.path);
                    const dir = path.dirname(filePath);
                    // 自动创建不存在的父目录，允许LLM写入新路径而无需先创建目录
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(filePath, args.content || '', 'utf-8');
                    logger.info(`[LLmCoordinator] 文件已写入: ${filePath}`);
                    return `文件已成功保存到: ${filePath}`;
                }

                case 'file_list': {
                    const dirPath = this._resolvePath(args.path);
                    if (!fs.existsSync(dirPath)) return `目录不存在: ${dirPath}`;
                    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                    return entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
                }

                case 'shell_execute': {
                    const { stdout, stderr } = await execAsync(args.command, {
                        timeout: SHELL_EXEC_TIMEOUT,
                        cwd: this.workDir
                    });
                    return (stdout || '') + (stderr ? `\nSTDERR: ${stderr}` : '');
                }

                case 'code_execute': {
                    // 将代码写入临时文件执行，避免shell注入风险
                    // 文件名包含时间戳防止并发冲突
                    const tmpFile = path.join(os.tmpdir(), `xiaomeng_exec_${Date.now()}.${args.language === 'python' ? 'py' : 'js'}`);
                    fs.writeFileSync(tmpFile, args.code || '', 'utf-8');
                    try {
                        const cmd = args.language === 'python' ? `python "${tmpFile}"` : `node "${tmpFile}"`;
                        const { stdout, stderr } = await execAsync(cmd, { timeout: SHELL_EXEC_TIMEOUT });
                        return (stdout || '') + (stderr ? `\nSTDERR: ${stderr}` : '');
                    } finally {
                        // 无论执行成功或失败，都清理临时文件避免磁盘泄漏
                        try { fs.unlinkSync(tmpFile); } catch (e) {}
                    }
                }

                case 'web_search': {
                    return await this._webSearch(args.query);
                }

                default:
                    return `未知工具: ${toolName}`;
            }
        } catch (error) {
            logger.error(`[LLmCoordinator] 工具执行失败 ${toolName}: ${error.message}`);
            return `工具执行失败: ${error.message}`;
        }
    }

    // ============================================================
    // 路径解析模块
    // 功能说明：将用户输入的路径解析为绝对路径，
    //          支持桌面路径、家目录缩写、相对路径等
    // ============================================================

    /**
     * 解析文件路径为绝对路径
     * @description 支持多种路径格式：绝对路径直接返回、~开头解析到家目录、
     *              包含"桌面"/"desktop"的路径解析到桌面目录、其余相对路径基于工作目录解析
     * @param {string} inputPath - 用户输入的路径字符串
     * @returns {string} 解析后的绝对路径
     * @private
     */
    _resolvePath(inputPath) {
        if (!inputPath) return this.workDir;
        if (path.isAbsolute(inputPath)) return inputPath;
        if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
            return path.join(os.homedir(), inputPath.substring(2));
        }
        // 用户说"桌面"或"desktop"时，提取文件名并拼接到桌面目录
        // 例如"桌面/报告.xlsx" → C:\Users\xxx\Desktop\报告.xlsx
        if (inputPath.includes('桌面') || inputPath.toLowerCase().includes('desktop')) {
            const filename = inputPath.replace(/.*[\/\\]/, '').replace(/^桌面[\/\\]?/, '');
            return path.join(this.desktopDir, filename || inputPath);
        }
        return path.resolve(this.workDir, inputPath);
    }

    // ============================================================
    // 网页搜索模块
    // 功能说明：依次尝试三种搜索服务（webSearchService → SearchEngines → newsService），
    //          均失败时返回Bing搜索链接作为兜底
    // ============================================================

    /**
     * 执行网页搜索
     * @description 依次尝试三种搜索服务获取结果，优先使用searchAndSummarize（含摘要），
     *              其次使用SearchEngines（原始结果），最后尝试newsService（新闻搜索），
     *              全部失败时返回Bing搜索链接作为兜底
     * @param {string} query - 搜索关键词
     * @returns {Promise<string>} 搜索结果文本，格式为编号列表或兜底链接
     * @private
     */
    async _webSearch(query) {
        try {
            // 第一优先级：webSearchService.searchAndSummarize（返回带摘要的搜索结果）
            try {
                const webSearchService = require('../webSearchService');
                if (webSearchService && typeof webSearchService.searchAndSummarize === 'function') {
                    const result = await webSearchService.searchAndSummarize(query);
                    if (result && (result.summary || result.message)) return result.summary || result.message;
                    if (result && result.results && result.results.length > 0) {
                        return result.results.slice(0, SEARCH_RESULT_LIMIT).map((r, i) =>
                            `${i + 1}. ${r.title || '无标题'}\n   ${r.snippet || r.description || ''}\n   ${r.url || r.link || ''}`
                        ).join('\n\n');
                    }
                }
            } catch (e) {}

            // 第二优先级：SearchEngines.search（返回原始搜索结果列表）
            try {
                const SearchEngines = require('../webSearchService/search_engines').SearchEngines || require('../webSearchService/search_engines');
                if (SearchEngines && typeof SearchEngines.search === 'function') {
                    const results = await SearchEngines.search(query);
                    if (results && results.length > 0) {
                        return results.slice(0, SEARCH_RESULT_LIMIT).map((r, i) =>
                            `${i + 1}. ${r.title || '无标题'}\n   ${r.snippet || r.description || ''}\n   ${r.url || r.link || ''}`
                        ).join('\n\n');
                    }
                }
            } catch (e) {}

            // 第三优先级：newsService.searchNews（新闻搜索，适合时效性强的查询）
            try {
                const newsService = require('../newsService');
                if (newsService && typeof newsService.searchNews === 'function') {
                    const news = await newsService.searchNews(query);
                    if (news && news.length > 0) {
                        return news.slice(0, SEARCH_RESULT_LIMIT).map((item, i) =>
                            `${i + 1}. ${item.title || item.name}\n   ${item.description || item.summary || ''}\n   ${item.url || item.link || ''}`
                        ).join('\n\n');
                    }
                }
            } catch (e) {}

            // 所有搜索服务均不可用，返回Bing搜索链接作为兜底方案
            const encodedQuery = encodeURIComponent(query);
            return `搜索"${query}"暂无结果。建议直接访问搜索引擎查询: https://www.bing.com/search?q=${encodedQuery}`;
        } catch (error) {
            return `搜索失败: ${error.message}`;
        }
    }

    // ============================================================
    // 降级回退模块
    // 功能说明：主Agent执行失败时，降级到Mimo模型重新处理任务
    // ============================================================

    /**
     * 降级到Mimo模型处理任务
     * @description 当主Agent（火山引擎Coding Agent）执行失败时，
     *              使用Mimo模型作为降级方案重新处理任务
     * @param {string} taskId - 任务唯一标识
     * @param {string} description - 任务的自然语言描述
     * @returns {Promise<{taskId: string, status: string, response: string}>} 降级处理结果
     * @throws {Error} 当Mimo API调用失败时抛出
     * @private
     */
    async _callMimoFallback(taskId, description) {
        logger.info(`[LLmCoordinator] 降级到Mimo处理任务`);
        emitWorkLog(taskId, '⚠️ 主力模型降级，使用Mimo重试', 'warn', { category: 'llm', provider: 'mimo-fallback' });
        const messages = [
            { role: 'system', content: this._getSystemPrompt() },
            { role: 'user', content: description }
        ];

        const result = await this._callMimoLLM(messages);
        const text = result.choices?.[0]?.message?.content || '任务降级处理完成';
        emitWorkLog(taskId, '✅ 降级处理完成', 'success', { category: 'llm', provider: 'mimo-fallback' });
        return { taskId, status: 'completed', engine: 'workflow/mimo-fallback', response: text };
    }
    // ============================================================
    // 提示词与工具定义模块
    // 功能说明：生成系统提示词和工具定义，供LLM调用时使用
    // ============================================================

    /**
     * 生成系统提示词
     * @description 构建包含当前日期、可用工具说明和执行规则的任务执行系统提示词，
     *              引导LLM正确使用工具并遵守执行规则
     * @returns {string} 系统提示词文本
     * @private
     */
    _getSystemPrompt() {
        const now = new Date();
        const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
        const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

        return `你是一个强大的任务执行助手。当前日期: ${dateStr}（星期${weekday}）

你可以使用以下工具：
- web_search: 搜索网页获取最新信息
- file_write: 写入文件，参数: path(文件路径), content(文件内容)
- file_read: 读取文件内容，参数: path(文件路径)
- file_list: 列出目录内容，参数: path(目录路径)

执行规则（必须严格遵守）：
1. 搜索类任务：最多搜索2次，然后根据搜索结果直接生成内容，不要再搜索
2. 文件保存任务：搜索完成后，立即调用 file_write 保存文件，不要拖延
3. 保存到桌面时，路径使用: ${this.desktopDir.replace(/\\/g, '/')}
4. 搜索时使用当前日期 ${dateStr} 作为时间参考
5. 完成所有操作后，简要总结执行结果，不要重复文件内容
6. 文件路径使用正斜杠 /

重要格式规则：
- 表格数据必须保存为 .csv 格式（易于 Excel 打开），不要用 .md 表格
- 报告/文档保存为 .txt 格式（通用可读），内容使用清晰的分段结构
- 搜索结果整理用 .csv 或 .json 格式，便于后续处理
- 除非用户明确要求，否则不要生成 .md 文件`;
    }

    /**
     * 获取LLM可用的工具定义列表
     * @description 返回符合OpenAI Function Calling格式的工具定义数组，
     *              包含file_read/file_write/file_list/shell_execute/code_execute/web_search六种工具
     * @returns {Array<{type: string, function: object}>} 工具定义数组
     * @private
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
                    description: '写入文件内容，可以创建新文件',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: '文件路径（保存到桌面请用: ' + this.desktopDir.replace(/\\/g, '/') + '/文件名）' },
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
                    description: '执行命令行命令',
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
                    name: 'code_execute',
                    description: '执行代码并返回结果',
                    parameters: {
                        type: 'object',
                        properties: {
                            language: { type: 'string', enum: ['python', 'js'], description: '编程语言' },
                            code: { type: 'string', description: '代码内容' }
                        },
                        required: ['language', 'code']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'web_search',
                    description: '搜索网页获取信息',
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
}

module.exports = new LLmCoordinator();
