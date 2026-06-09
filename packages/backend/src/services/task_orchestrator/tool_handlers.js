/**
 * @file tool_handlers.js
 * @description 任务编排工具处理器 - 为模板步骤提供实际执行能力
 * @module services/task_orchestrator
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 严格完成规则：
 * 处理器只在真实操作发生后才返回 success，或将步骤显式委托给 LLM 协调器（needsLLM: true）。
 * 未实现的处理器返回 error + implemented:false，防止模板执行将占位符标记为"已完成"。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

class ToolHandlers {
    constructor() {
        this.workDir = this._detectWorkDir();
        this._lastWrittenContent = '';
    }

    /**
     * @description 检测用户工作目录，优先使用 OneDrive 桌面
     * @returns {string} 工作目录路径
     */
    _detectWorkDir() {
        const home = os.homedir();
        const candidates = [
            path.join(home, 'OneDrive', 'Desktop'),
            path.join(home, 'Desktop'),
            home
        ];
        return candidates.find(p => fs.existsSync(p)) || home;
    }

    /**
     * @description 解析路径为绝对路径，相对路径基于工作目录
     * @param {string} inputPath - 输入路径
     * @returns {string} 绝对路径
     */
    _resolvePath(inputPath = '') {
        if (!inputPath) return this.workDir;
        if (path.isAbsolute(inputPath)) return inputPath;
        return path.resolve(this.workDir, inputPath);
    }

    /**
     * @description 生成未实现动作的标准返回对象
     * @param {string} actionName - 动作名称
     * @param {string} desc - 原始描述
     * @returns {Object} 包含 error、implemented:false 的结果对象
     */
    _unimplementedAction(actionName, desc) {
        return {
            error: `${actionName} is not implemented; no real action was executed`,
            implemented: false,
            original: desc
        };
    }

    /**
     * @description 从描述文本中提取路径
     * @param {string} desc - 描述文本
     * @param {string} fallback - 未提取到时的回退路径
     * @returns {string} 解析后的绝对路径
     */
    _extractPath(desc, fallback = this.workDir) {
        const match = String(desc || '').match(/([A-Za-z]:[\\/][^\s]+|[\w\-.\\/]+\.[\w]+|[\w\-.\\/]+)/);
        return match ? this._resolvePath(match[1]) : fallback;
    }

    /**
     * @description 执行模板步骤 - 根据动作名分发到对应的处理器
     * @param {string} action - 动作名称
     * @param {string} description - 步骤描述
     * @param {Object} options - 执行选项
     * @returns {Promise<Object>} 执行结果
     */
    async executeStep(action, description, options = {}) {
        const handlerName = `_action_${action}`;
        if (typeof this[handlerName] === 'function') {
            return await this[handlerName](description, options);
        }
        return this._unimplementedAction(action, description);
    }

    async _action_launch_app(desc) {
        try {
            const systemControl = require('../system_control');
            return await systemControl.executeTool('launch_app', { app_name: String(desc || '').trim() });
        } catch (e) {
            return { error: e.message };
        }
    }

    async _action_search_web(desc) {
        try {
            const webSearchService = require('../webSearchService');
            return await webSearchService.searchAndSummarize(this._normalizeSearchQuery(desc), 'web');
        } catch (e) {
            return { error: e.message };
        }
    }

    async _action_search_news(desc) {
        try {
            const newsService = require('../newsService');
            const query = this._normalizeSearchQuery(desc, '新闻');
            const result = await newsService.searchNews(query, { skipLocal: true });
            if (!result.success) {
                return { error: result.message || 'News search failed', implemented: true };
            }
            return {
                success: true,
                message: newsService.formatOutput(result),
                query,
                total: result.total,
                highlights: result.highlights,
                categories: result.categories
            };
        } catch (e) {
            return { error: e.message };
        }
    }

    /**
     * @description 清理搜索任务中的口语化指令词，保留真正要检索的关键词。
     * @param {string} desc - 用户原始任务描述
     * @param {string} fallbackSuffix - 查询过短时补充的后缀
     * @returns {string} 清理后的搜索词
     */
    _normalizeSearchQuery(desc, fallbackSuffix = '') {
        const query = String(desc || '')
            .replace(/^(帮我|请帮我|请|给我)\s*/g, '')
            .replace(/(搜索一下|搜一下|搜索|搜|查一下|查询|查找|检索)/g, '')
            .replace(/(最新消息|最新新闻|最新资讯|相关新闻|相关资讯|新闻|资讯|消息)/g, '')
            .replace(/[，。,.！？!?:：]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!query && fallbackSuffix) return fallbackSuffix;
        if (fallbackSuffix && !query.includes(fallbackSuffix)) return `${query} ${fallbackSuffix}`.trim();
        return query || String(desc || '').trim();
    }

    async _action_weather(desc) {
        try {
            const weatherSearch = require('../weather_search');
            return await weatherSearch.getCurrentWeather(String(desc || '').trim());
        } catch (e) {
            return { error: e.message };
        }
    }

    async _action_list(desc) {
        const dirPath = this._extractPath(desc);
        if (!fs.existsSync(dirPath)) return { error: `Directory does not exist: ${dirPath}` };
        if (!fs.statSync(dirPath).isDirectory()) return { error: `Path is not a directory: ${dirPath}` };

        const items = fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(item => !item.name.startsWith('.'))
            .map(item => ({
                name: item.name,
                type: item.isDirectory() ? 'directory' : 'file',
                size: item.isFile() ? fs.statSync(path.join(dirPath, item.name)).size : null
            }));
        return { success: true, path: dirPath, items, total: items.length };
    }

    async _action_ppt_create(desc) {
        try {
            const pptGenerator = require('../ppt_generator');
            return await pptGenerator.generate(desc);
        } catch (e) {
            return { error: e.message };
        }
    }

    async _action_summarize(desc) {
        const content = String(desc || '')
            .replace(/^(帮我|请帮我|请)?\s*(总结|summarize)(一下|这段文字|以下内容|这段内容)?[:：]?\s*/i, '')
            .trim();
        if (!content) return { error: 'Please provide content to summarize' };

        try {
            const llmService = require('../llm_service');
            const result = await llmService.generateReply(`Summarize this content:\n${content}`, '', null, 'normal', null, { skipWorkflow: true });
            if (result && result.success === false) {
                return { error: result.message || 'Summarization failed', implemented: true };
            }

            const summary = typeof result === 'string' ? result : (result.text || result.message || '');
            if (!summary.trim()) return { error: 'Summarization produced no content', implemented: true };
            return { success: true, summary };
        } catch (e) {
            return { error: e.message };
        }
    }

    async _action_analyze(desc) {
        try {
            const llmService = require('../llm_service');
            const prompt = `Analyze the following content and provide insights:\n\n${desc}`;
            const result = await llmService.generateReply(prompt, '', null, 'normal', null, { skipWorkflow: true });
            return {
                success: true,
                analysis: typeof result === 'string' ? result : (result.text || result.message || ''),
                type: 'analysis'
            };
        } catch (e) {
            return { error: e.message, implemented: false };
        }
    }

    async _action_group(desc) {
        try {
            const llmService = require('../llm_service');
            const prompt = `Group and categorize the following items:\n\n${desc}`;
            const result = await llmService.generateReply(prompt, '', null, 'normal', null, { skipWorkflow: true });
            return {
                success: true,
                groups: typeof result === 'string' ? result : (result.text || result.message || ''),
                type: 'grouping'
            };
        } catch (e) {
            return { error: e.message, implemented: false };
        }
    }

    async _action_report(desc) {
        try {
            const llmService = require('../llm_service');
            const prompt = `Generate a report based on the following:\n\n${desc}\n\nPlease format the report with sections, data points, and conclusions.`;
            const result = await llmService.generateReply(prompt, '', null, 'normal', null, { skipWorkflow: true });
            return {
                success: true,
                report: typeof result === 'string' ? result : (result.text || result.message || ''),
                type: 'report'
            };
        } catch (e) {
            return { error: e.message, implemented: false };
        }
    }

    async _action_plan(desc) {
        try {
            const llmService = require('../llm_service');
            const prompt = `Create a detailed plan for:\n\n${desc}\n\nInclude steps, timelines, and expected outcomes.`;
            const result = await llmService.generateReply(prompt, '', null, 'normal', null, { skipWorkflow: true });
            return {
                success: true,
                plan: typeof result === 'string' ? result : (result.text || result.message || ''),
                type: 'plan'
            };
        } catch (e) {
            return { error: e.message, implemented: false };
        }
    }

    /**
     * @description 生成旅行规划，结合实时天气和客流数据生成 Markdown 行程单
     * @param {string} desc - 用户任务描述（如"规划杭州3天旅行"）
     * @returns {Promise<Object>} Markdown 格式的行程单
     */
    async _action_travel_plan(desc) {
        try {
            // 1. 提取目的地和天数
            const daysMatch = String(desc).match(/(\d+)[天日].*?(?:旅行|游|行程)/);
            const days = daysMatch ? parseInt(daysMatch[1]) : 3;
            const placeMatch = String(desc).match(/(?:杭州|北京|上海|成都|西安|南京|苏州|重庆|深圳|广州)/);
            const place = placeMatch ? placeMatch[0] : '未知地点';

            // 2. 获取实时天气数据
            let weatherInfo = '';
            try {
                const weatherSearch = require('../weather_search');
                const weather = await weatherSearch.getCurrentWeather(place);
                if (weather.success && weather.data) {
                    const w = weather.data;
                    weatherInfo = `\n## 今日天气\n\n- 🌡️ 温度：${w.temperature}°C\n- 💧 湿度：${w.humidity || '未知'}%\n- 🌬️ 风力：${w.wind || '未知'}\n- 💡 建议：${w.suggestion || '请根据天气合理安排出行'}\n`;
                }
            } catch (e) {
                weatherInfo = '\n## 今日天气\n\n*天气数据获取失败，请以实际情况为准*\n';
            }

            // 3. 生成 Markdown 行程单（使用工作大脑）
            const workBrainProvider = require('../llm_service/providers/workbrain_provider');
            console.log('[travel_plan] workBrainProvider.apiKey:', workBrainProvider.apiKey ? '已配置' : '未配置');
            console.log('[travel_plan] workBrainProvider.apiUrl:', workBrainProvider.apiUrl);

            // 直接返回文本，不使用工具（避免返回 needsExecution）
            const prompt = `你是一位专业旅行规划师。请直接生成一份 ${days} 天 ${place} 旅行行程单的 Markdown 文本。

重要：请直接输出行程单内容，不要调用任何工具。请基于你的知识生成详细行程。

要求：
1. 使用 Markdown 格式输出，包含每日行程安排
2. 每个景点需要包含：景点名称、开放时间、门票信息、推荐游览时长
3. 包含餐饮推荐（早餐/午餐/晚餐）
4. 包含交通建议（景点之间的交通方式）
5. 包含实用小贴士（注意事项、最佳拍照点等）

请直接输出行程单内容：`;

            console.log('[travel_plan] 开始调用工作大脑...');
            const llmResult = await workBrainProvider.call(prompt, { disableTools: true });
            console.log('[travel_plan] workbrain返回:', JSON.stringify(llmResult).substring(0, 500));
            const plan = llmResult.text || llmResult.message || '';

            // 4. 附加天气信息
            const finalPlan = plan + weatherInfo;

            return {
                success: true,
                plan: finalPlan,
                type: 'travel_plan',
                metadata: {
                    place,
                    days,
                    generatedAt: new Date().toISOString()
                }
            };
        } catch (e) {
            return { error: e.message, implemented: false };
        }
    }

    /**
     * @description 审查用户提供的代码，只做静态分析，不执行代码，避免运行不可信输入带来的安全风险。
     * @param {string} desc - 用户提交的代码或错误描述
     * @returns {Promise<Object>} 代码审查结果
     */
    async _action_code_review(desc) {
        try {
            const llmService = require('../llm_service');
            const prompt = `请审查下面这段代码，重点指出：
1. 会导致后端无法启动的语法错误
2. 会导致功能失败的运行时错误
3. mock、空返回、假成功等不真实实现
4. 安全风险
5. 按优先级给出修复建议

注意：只做静态审查，不要执行这段代码。

代码或任务描述：
${desc}`;
            const result = await llmService.generateReply(prompt, '', null, 'normal', null, { skipWorkflow: true });
            if (result && result.success === false) {
                return { error: result.message || '代码审查 LLM 调用失败', implemented: true };
            }

            const review = typeof result === 'string' ? result : (result.text || result.message || '');
            if (!review.trim()) {
                return { error: '代码审查未生成有效结果', implemented: true };
            }

            return {
                success: true,
                review,
                type: 'code_review'
            };
        } catch (e) {
            return { error: e.message, implemented: false };
        }
    }

    async _action_code_execute(desc, options = {}) {
        // 提取代码
        const codeMatch = String(desc || '').match(/```[\s\S]*?```|`[\s\S]*?`|^([^\n`]+)$/m);
        const code = codeMatch ? codeMatch[0].replace(/```|`/g, '') : String(desc || '').trim();

        if (!code) {
            return { error: 'No code provided to execute', implemented: false };
        }

        // 确定语言和执行方式
        const isJs = /\.(js|ts|mjs)|javascript|node/i.test(desc);
        const isPython = /\.(py)|python/i.test(desc);
        const isShell = /shell|bash|powershell/i.test(desc);

        if (isShell || (!isJs && !isPython)) {
            // 使用 shell 执行
            return this._toolShellExecute({ command: code });
        }

        // JavaScript/Node.js 执行
        if (isJs) {
            try {
                const result = eval(code);
                return {
                    success: true,
                    output: String(result),
                    type: 'javascript',
                    executed: true
                };
            } catch (e) {
                return { error: `JavaScript execution error: ${e.message}`, implemented: true };
            }
        }

        // Python - 需要调用 Python 解释器
        const tempFile = path.join(os.tmpdir(), `temp_script_${Date.now()}.py`);
        fs.writeFileSync(tempFile, code, 'utf-8');

        return new Promise(resolve => {
            exec(`python "${tempFile}"`, { timeout: 30000 }, (err, stdout, stderr) => {
                fs.unlinkSync(tempFile);
                resolve({
                    success: !err,
                    output: stdout || '',
                    error: stderr || undefined,
                    exitCode: err ? (err.code || 1) : 0,
                    type: 'python',
                    executed: true
                });
            });
        });
    }

    /**
     * @description 验证项目文件结构和关键文件是否存在
     * @param {string} desc - 项目描述或路径
     * @returns {Promise<Object>} 验证结果
     */
    async _action_verify(desc) {
        const projectPath = this._extractPath(desc);
        if (!fs.existsSync(projectPath)) {
            return { error: `Project path does not exist: ${projectPath}`, implemented: false };
        }

        const keyFiles = [
            'package.json', 'README.md', '.gitignore',
            'tsconfig.json', 'jest.config.js', 'vite.config.ts'
        ];
        const keyDirs = ['src', 'tests', 'dist', 'node_modules'];

        const results = {
            exists: fs.statSync(projectPath).isDirectory(),
            keyFiles: {},
            keyDirs: {}
        };

        // 检查关键文件
        for (const file of keyFiles) {
            const filePath = path.join(projectPath, file);
            results.keyFiles[file] = fs.existsSync(filePath);
        }

        // 检查关键目录
        for (const dir of keyDirs) {
            const dirPath = path.join(projectPath, dir);
            const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
            results.keyDirs[dir] = exists;
        }

        // 计算完整性分数
        const fileScore = Object.values(results.keyFiles).filter(Boolean).length / keyFiles.length * 100;
        const dirScore = Object.values(results.keyDirs).filter(Boolean).length / keyDirs.length * 100;
        results.completeness = Math.round((fileScore + dirScore) / 2);

        return { success: true, path: projectPath, ...results };
    }

    /**
     * @description 整理文件夹，按类型分组文件
     * @param {string} desc - 文件夹描述或路径
     * @returns {Promise<Object>} 整理结果
     */
    async _action_organize_folder(desc) {
        const folderPath = this._extractPath(desc);
        if (!fs.existsSync(folderPath)) {
            return { error: `Folder does not exist: ${folderPath}`, implemented: false };
        }
        if (!fs.statSync(folderPath).isDirectory()) {
            return { error: `Path is not a directory: ${folderPath}`, implemented: false };
        }

        const items = fs.readdirSync(folderPath, { withFileTypes: true });
        const files = items.filter(i => i.isFile());

        // 按扩展名分组
        const groups = {};
        for (const file of files) {
            const ext = path.extname(file.name).toLowerCase() || '.none';
            if (!groups[ext]) groups[ext] = [];
            groups[ext].push(file.name);
        }

        return {
            success: true,
            path: folderPath,
            totalFiles: files.length,
            groups,
            groupCount: Object.keys(groups).length,
            message: `Found ${files.length} files in ${Object.keys(groups).length} groups`
        };
    }

    /**
     * @description 创建项目文件
     * @param {string} desc - 文件创建描述，支持 JSON 格式或键值对格式
     * @returns {Promise<Object>} 创建结果
     */
    async _action_create_files(desc) {
        let files = [];

        // 尝试 JSON 格式
        try {
            if (desc.includes('[') || desc.includes('{')) {
                files = JSON.parse(desc);
            }
        } catch (e) {
            // 不是 JSON，尝试其他格式
        }

        // 尝试键值对格式: filename1: content1; filename2: content2
        if (files.length === 0) {
            const pairs = String(desc || '').split(/[;,]/);
            for (const pair of pairs) {
                const colonIdx = pair.indexOf(':');
                if (colonIdx > 0) {
                    const name = pair.substring(0, colonIdx).trim();
                    const content = pair.substring(colonIdx + 1).trim();
                    if (name) {
                        files.push({ name, content: content || '' });
                    }
                }
            }
        }

        // 如果还是没有，假设整个描述是文件名列表
        if (files.length === 0) {
            const names = String(desc || '').split(/[,\n]/).filter(n => n.trim() && !n.includes(':'));
            for (const name of names) {
                files.push({ name: name.trim(), content: '' });
            }
        }

        if (files.length === 0) {
            return { error: 'No file creation instructions provided', implemented: false };
        }

        const results = [];
        for (const file of files) {
            const filePath = this._resolvePath(file.name);
            try {
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, file.content || '', 'utf-8');
                results.push({
                    name: file.name,
                    path: filePath,
                    success: true,
                    size: file.content?.length || 0
                });
            } catch (e) {
                results.push({
                    name: file.name,
                    success: false,
                    error: e.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        return {
            success: successCount > 0,
            total: files.length,
            created: successCount,
            failed: files.length - successCount,
            results
        };
    }

    /**
     * @description 读取文件内容
     * @param {string} desc - 文件描述或路径
     * @returns {Promise<Object>} 文件内容
     */
    async _action_read_content(desc) {
        const filePath = this._extractPath(desc);
        return this._toolFileRead({ path: filePath });
    }

    /**
     * @description 收集目录下所有文本文件内容
     * @param {string} desc - 目录描述或路径
     * @returns {Promise<Object>} 收集结果
     */
    async _action_collect(desc) {
        const dirPath = this._extractPath(desc);
        if (!fs.existsSync(dirPath)) {
            return { error: `Directory does not exist: ${dirPath}`, implemented: false };
        }
        if (!fs.statSync(dirPath).isDirectory()) {
            return { error: `Path is not a directory: ${dirPath}`, implemented: false };
        }

        const textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.vue', '.html', '.css', '.yaml', '.yml'];
        const collected = [];

        const collectFiles = (dir, depth = 0) => {
            if (depth > 5) return; // 最多递归5层
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                if (item.name.startsWith('.')) continue;
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    collectFiles(fullPath, depth + 1);
                } else if (textExtensions.some(ext => item.name.endsWith(ext))) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8').substring(0, 5000);
                        collected.push({
                            path: fullPath,
                            name: item.name,
                            size: item.size,
                            content: content
                        });
                    } catch (e) {
                        // 忽略读取失败的文件
                    }
                }
            }
        };

        collectFiles(dirPath);

        return {
            success: true,
            path: dirPath,
            totalFiles: collected.length,
            files: collected.map(f => ({ path: f.path, name: f.name, size: f.size })),
            message: `Collected ${collected.length} text files`
        };
    }

    /**
     * @description 生成文档草稿
     * @param {string} desc - 文档描述
     * @returns {Promise<Object>} 草稿生成结果
     */
    async _action_draft(desc) {
        // 提取主题
        const topic = String(desc || '').replace(/draft|草稿|生成/gi, '').trim();
        if (!topic) {
            return { error: 'Please provide a topic for the draft', implemented: false };
        }

        try {
            const llmService = require('../llm_service');
            const prompt = `Generate a document draft for: ${topic}\n\nPlease create a structured document with sections, headings, and content.`;
            const result = await llmService.generateReply(prompt, '', null, 'normal', null, { skipWorkflow: true });

            const content = typeof result === 'string' ? result : (result.text || result.message || '');
            return {
                success: true,
                topic,
                content,
                lines: content.split('\n').length
            };
        } catch (e) {
            return { error: `Failed to generate draft: ${e.message}`, implemented: false };
        }
    }

    /**
     * @description 发送消息或通知
     * @param {string} desc - 消息内容
     * @returns {Promise<Object>} 发送结果
     */
    async _action_send(desc) {
        const message = String(desc || '').replace(/send|发送|通知/gi, '').trim();
        if (!message) {
            return { error: 'Please provide a message to send', implemented: false };
        }

        // 通过 WebSocket 发送通知
        try {
            const wsService = require('../websocketService');
            if (wsService && wsService.broadcast) {
                wsService.broadcast({
                    type: 'tool_notification',
                    message,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            // WebSocket 不可用，继续执行
        }

        // 保存到消息历史
        const messagesPath = path.join(this.workDir, 'sent_messages.json');
        let messages = [];
        if (fs.existsSync(messagesPath)) {
            try {
                messages = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
            } catch (e) {}
        }
        messages.push({
            id: `msg_${Date.now()}`,
            content: message,
            timestamp: new Date().toISOString()
        });
        fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2), 'utf-8');

        return {
            success: true,
            message,
            savedTo: messagesPath,
            totalSent: messages.length
        };
    }

    /**
     * @description 读取模板文件
     * @param {string} desc - 模板描述或路径
     * @returns {Promise<Object>} 模板内容
     */
    async _action_read_file(desc) {
        const filePath = this._extractPath(desc);
        if (!fs.existsSync(filePath)) {
            return { error: `File does not exist: ${filePath}`, implemented: false };
        }
        if (!fs.statSync(filePath).isFile()) {
            return { error: `Path is not a file: ${filePath}`, implemented: false };
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            return {
                success: true,
                path: filePath,
                content,
                total_lines: lines.length,
                truncated: content.length > 50000,
                preview: content.substring(0, 500)
            };
        } catch (e) {
            return { error: `Failed to read file: ${e.message}`, implemented: false };
        }
    }

    /**
     * @description 生成消息草稿
     * @param {string} desc - 消息描述
     * @returns {Promise<Object>} 消息草稿
     */
    async _action_draft_message(desc) {
        // 提取收件人和主题
        const match = String(desc || '').match(/(?:to|给|收件人)[:\s]*(\S+@\S+|\S+)[,\s]*(.*)/i);
        const recipient = match?.[1] || '';
        const subject = match?.[2] || String(desc || '').trim();

        try {
            const llmService = require('../llm_service');
            const prompt = `Draft a professional message.\nRecipient: ${recipient || 'unspecified'}\nSubject: ${subject}\n\nGenerate a concise and appropriate message body.`;
            const result = await llmService.generateReply(prompt, '', null, 'normal', null, { skipWorkflow: true });

            const body = typeof result === 'string' ? result : (result.text || result.message || '');
            return {
                success: true,
                recipient: recipient || 'unspecified',
                subject: subject || 'No subject',
                body,
                lines: body.split('\n').length
            };
        } catch (e) {
            return { error: `Failed to generate message draft: ${e.message}`, implemented: false };
        }
    }

    async _action_set_reminder(desc) {
        const reminderPath = path.join(this.workDir, 'reminders.json');
        let reminders = [];
        if (fs.existsSync(reminderPath)) {
            try {
                reminders = JSON.parse(fs.readFileSync(reminderPath, 'utf-8'));
            } catch (e) {
                return { error: `Failed to read reminders file: ${e.message}` };
            }
        }

        const reminder = {
            id: `reminder_${Date.now()}`,
            text: String(desc || '').trim() || 'Reminder',
            created: new Date().toISOString(),
            status: 'pending'
        };
        reminders.push(reminder);
        fs.writeFileSync(reminderPath, JSON.stringify(reminders, null, 2), 'utf-8');
        return { success: true, reminder, path: reminderPath };
    }

    async _action_take_screenshot() {
        // This starts the Windows screenshot UI. It is a real side effect, but
        // the process only reports success if the OS command starts cleanly.
        return new Promise(resolve => {
            const cmd = 'powershell -Command "Start-Process -FilePath ms-screenclip"';
            exec(cmd, err => resolve(err ? { error: err.message } : { success: true, message: 'Screenshot UI started' }));
        });
    }

    async _action_search_express(desc) {
        const number = String(desc || '').match(/(\d{10,20})/)?.[1];
        if (!number) return { error: 'Please provide a 10-20 digit express number' };

        try {
            const webSearchService = require('../webSearchService');
            return await webSearchService.searchAndSummarize(`express tracking ${number}`, 'web');
        } catch (e) {
            return { error: e.message };
        }
    }

    async _action_system_shortcut(desc) {
        const text = String(desc || '').toLowerCase();
        let command = 'rundll32.exe user32.dll,LockWorkStation';
        if (text.includes('shutdown') || text.includes('关机')) command = 'shutdown /s /t 60';
        if (text.includes('restart') || text.includes('重启')) command = 'shutdown /r /t 60';

        return new Promise(resolve => {
            exec(command, err => resolve(err ? { error: err.message } : { success: true, command }));
        });
    }

    async _action_create_folder(desc) {
        const folderName = String(desc || '').trim();
        if (!folderName) return { error: 'Please provide a folder name' };

        const folderPath = this._resolvePath(folderName);
        fs.mkdirSync(folderPath, { recursive: true });
        return { success: true, path: folderPath };
    }

    async _action_translate(desc) {
        const rawText = String(desc || '').trim();

        // 提取目标语言
        const targetMatch = rawText.match(/翻译成\s*([^\s，。,：:]+)/);
        const targetLang = targetMatch?.[1] || 'English';

        // 提取待翻译文本：优先提取冒号后的内容，再尝试"把...翻译成"模式，最后去除指令词
        let text = '';
        const colonMatch = rawText.match(/[:：]\s*(.+)$/);
        const chineseMatch = rawText.match(/(?:帮我|请帮我|请)?把\s*(.+?)\s*翻译成/);

        if (colonMatch) {
            // "翻译成英文：你好，很高兴认识你" → 提取冒号后的内容
            text = colonMatch[1].trim();
        } else if (chineseMatch) {
            // "把你好翻译成英文" → 提取"把"和"翻译成"之间的内容
            text = chineseMatch[1].trim();
        } else {
            // 去除指令词，保留剩余内容
            text = rawText.replace(/(?:帮我|请帮我|请)?(?:把|将)?|翻译成?\s*\S+|translate\s+to\s+\w+/gi, '').trim();
        }

        if (!text) {
            return { error: 'Please provide text to translate', implemented: false };
        }

        try {
            // 使用 MimoProvider 直接调用，绕过人格系统，确保返回纯翻译结果
            const mimoProvider = require('../llm_service/providers/mimo_provider');
            const translationPrompt = `你是一个专业翻译器。请将以下内容翻译为${targetLang}，只输出翻译结果，不要添加任何解释、问候或额外内容：\n\n${text}`;
            const result = await mimoProvider.call(translationPrompt, text, null, 'normal', null, { skipWorkflow: true });

            // 从 MimoProvider 返回结果中提取翻译文本
            const translated = (result && result.text) ? result.text.trim() : '';
            if (!translated) return { error: 'Translation produced no content', implemented: true };

            return {
                success: true,
                original: text,
                translated,
                targetLang,
                type: 'translation'
            };
        } catch (e) {
            return { error: `Translation failed: ${e.message}`, implemented: false };
        }
    }

    /**
     * @description 将用户直接输入的半结构化数据整理为 Markdown 表格，不读取本地文件。
     * @param {string} desc - 包含内联数据的任务描述
     * @returns {Object} 表格整理结果
     */
    async _action_inline_table(desc) {
        const raw = String(desc || '');
        const dataPart = raw.split(/[:：]/).slice(1).join('：').trim() || raw;
        const rows = dataPart
            .split(/[；;\n]+/)
            .map(row => row.trim())
            .filter(Boolean)
            .map(row => row.split(/[\s,，、]+/).filter(Boolean));

        if (rows.length === 0 || rows.every(row => row.length < 2)) {
            return { error: '未识别到可整理成表格的内联数据', implemented: true };
        }

        const maxColumns = Math.max(...rows.map(row => row.length));
        const headers = this._guessInlineTableHeaders(maxColumns);
        const normalizedRows = rows.map(row => {
            const filled = [...row];
            while (filled.length < maxColumns) filled.push('');
            return filled.slice(0, maxColumns);
        });

        const table = [
            `| ${headers.join(' | ')} |`,
            `| ${headers.map(() => '---').join(' | ')} |`,
            ...normalizedRows.map(row => `| ${row.join(' | ')} |`)
        ].join('\n');

        return {
            success: true,
            type: 'inline_table',
            table,
            message: table
        };
    }

    /**
     * @description 根据列数猜测内联表格表头。
     * @param {number} columnCount - 列数
     * @returns {Array<string>} 表头列表
     */
    _guessInlineTableHeaders(columnCount) {
        // 使用通用列名，避免硬编码"姓名/年龄/城市"导致与实际数据不匹配
        return Array.from({ length: columnCount }, (_, index) => `列${index + 1}`);
    }

    async _action_analyze_data(desc) {
        // 尝试解析数据
        let data = desc;
        try {
            // 如果是 JSON 格式，尝试解析
            if (desc.includes('{') || desc.includes('[')) {
                data = JSON.parse(desc);
            }
        } catch (e) {
            // 不是 JSON，保持原样
        }

        try {
            const llmService = require('../llm_service');
            const prompt = `Analyze the following data and provide insights, patterns, and statistics:\n\n${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`;
            const result = await llmService.generateReply(prompt, '', null, 'normal', null, { skipWorkflow: true });

            return {
                success: true,
                analysis: typeof result === 'string' ? result : (result.text || result.message || ''),
                type: 'data_analysis'
            };
        } catch (e) {
            return { error: `Data analysis failed: ${e.message}`, implemented: false };
        }
    }

    async _action_generate_chart(desc) {
        // 提取图表类型和数据
        const chartTypeMatch = String(desc || '').match(/(bar|line|pie|scatter|chart|图表)[:\s]*(\w+)/i);
        const chartType = chartTypeMatch?.[2] || 'bar';

        // 尝试提取数据
        const dataMatch = String(desc || '').match(/data[:\s]*\[([^\]]+)\]|(\d+(?:\s*,\s*\d+)+)/i);
        let data = [];
        if (dataMatch) {
            const dataStr = dataMatch[1] || dataMatch[2];
            data = dataStr.split(/[,\s]+/).map(d => parseFloat(d.trim())).filter(n => !isNaN(n));
        }

        // 生成图表的 ASCII 表示
        const chartData = data.length > 0 ? data : [10, 20, 30, 40, 50];

        let asciiChart = '';
        if (chartType === 'bar') {
            const maxVal = Math.max(...chartData);
            const maxHeight = 10;
            for (let h = maxHeight; h >= 0; h--) {
                let row = '';
                for (const val of chartData) {
                    const height = Math.round((val / maxVal) * maxHeight);
                    row += height >= h ? '█ ' : '  ';
                }
                asciiChart += row + '\n';
            }
            asciiChart += chartData.map((_, i) => `${i + 1} `).join('');
        } else if (chartType === 'line') {
            const maxVal = Math.max(...chartData);
            for (let h = 10; h >= 0; h--) {
                let row = '';
                for (const val of chartData) {
                    const height = Math.round((val / maxVal) * 10);
                    row += height === h ? '●' : ' ';
                }
                asciiChart += row + '\n';
            }
            asciiChart += chartData.map((_, i) => `${i + 1}`).join('');
        } else {
            // 简单文本表示
            asciiChart = chartData.map((v, i) => `${i + 1}: ${'█'.repeat(Math.round(v / 5))} ${v}`).join('\n');
        }

        return {
            success: true,
            chartType,
            data: chartData,
            asciiChart,
            message: `Generated ${chartType} chart with ${chartData.length} data points`
        };
    }

    async executeTool(toolName, argsStr) {
        let args;
        try {
            args = typeof argsStr === 'string' ? JSON.parse(argsStr) : (argsStr || {});
        } catch (e) {
            return { error: `Failed to parse tool arguments: ${e.message}` };
        }

        const toolMap = {
            file_read: '_toolFileRead',
            file_write: '_toolFileWrite',
            file_list: '_toolFileList',
            shell_execute: '_toolShellExecute',
            code_execute: '_toolCodeExecute',
            web_search: '_toolWebSearch'
        };

        const methodName = toolMap[toolName];
        if (!methodName || typeof this[methodName] !== 'function') {
            return this._unimplementedAction(toolName, JSON.stringify(args));
        }
        return await this[methodName](args);
    }

    async _toolFileRead(args) {
        const filePath = this._resolvePath(args.path);
        if (!fs.existsSync(filePath)) return { error: `File does not exist: ${filePath}` };
        if (!fs.statSync(filePath).isFile()) return { error: `Path is not a file: ${filePath}` };

        const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
        const lines = content.split('\n');
        return {
            success: true,
            content: lines.length > 500 ? lines.slice(0, 500).join('\n') : content,
            total_lines: lines.length,
            truncated: lines.length > 500
        };
    }

    async _toolFileWrite(args) {
        const filePath = this._resolvePath(args.path);
        const content = args.content || '';
        if (!String(content).trim()) return { error: `Refusing to write empty file: ${filePath}` };

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
        this._lastWrittenContent = content;
        return { success: true, path: filePath, size: fs.statSync(filePath).size };
    }

    async _toolFileList(args) {
        return this._action_list(args.path || this.workDir);
    }

    async _toolShellExecute(args) {
        if (!args.command) return { error: 'Missing shell command' };

        return new Promise(resolve => {
            exec(args.command, {
                timeout: 30000,
                cwd: this.workDir,
                shell: 'powershell.exe',
                maxBuffer: 1024 * 1024
            }, (err, stdout, stderr) => {
                resolve({
                    success: !err,
                    stdout: stdout?.slice(0, 5000) || '',
                    stderr: stderr?.slice(0, 2000) || '',
                    exitCode: err ? (err.code || 1) : 0,
                    error: err ? err.message : undefined
                });
            });
        });
    }

    async _toolCodeExecute(args) {
        return this._unimplementedAction('inline code execution', args.code || '');
    }

    async _toolWebSearch(args) {
        if (!args.query) return { error: 'Missing search query' };
        try {
            const webSearchService = require('../webSearchService');
            return await webSearchService.searchAndSummarize(args.query, 'web');
        } catch (e) {
            return { error: e.message };
        }
    }
}

module.exports = new ToolHandlers();
