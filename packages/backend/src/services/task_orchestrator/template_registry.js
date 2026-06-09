/**
 * @file template_registry.js
 * @description 模板注册表 - 任务模板匹配与执行，支持正则匹配和优先级排序
 * @module services/task_orchestrator
 * @author xiaomeng
 * @version 1.0.1
 * @date 2026-06-07
 */

/**
 * @description 统计描述中的子任务数量，用于复杂度评估
 * @param {string} description - 任务描述
 * @returns {number} 估计的子任务数量
 */
function _countSubTasks(description) {
    if (!description) return 1;

    let count = 0;
    const text = String(description);
    const lineBreaks = text.split('\n').filter(line => line.trim().length > 0).length;
    const numberedItems = text.match(/^\s*\d+[.)、]\s+/gm);
    const bulletItems = text.match(/^\s*[-*•]\s+/gm);
    const taskVerbs = text.match(/搜索|分析|整理|生成|制作|创建|开发|计算|起草|发送|导出|保存/g);

    if (numberedItems) count = Math.max(count, numberedItems.length);
    if (bulletItems) count = Math.max(count, bulletItems.length);
    if (taskVerbs) count = Math.max(count, taskVerbs.length);
    if (lineBreaks > 1) count = Math.max(count, lineBreaks);

    return Math.max(count, 1);
}

class TemplateRegistry {
    constructor() {
        this.templates = {};
        this._initTemplateRegistry();
    }

    /**
     * @description 初始化内置模板。所有正则都保持简单、可读，避免用户长文本中的代码片段触发坏正则。
     * @returns {void}
     */
    _initTemplateRegistry() {
        this.templates = {
            '代码审查': {
                trigger: ['代码有什么问题', '看看这个代码', '检查代码', '审查代码', '代码报错', '无法运行', 'require(', 'function ', 'const ', 'async '],
                regex: /(代码有什么问题|看看这个代码|检查代码|审查代码|代码报错|无法运行|require\(|function\s+|const\s+|async\s+)/i,
                priority: 30,
                steps: [{ action: 'code_review', desc: '审查代码并指出问题' }]
            },
            '代码开发': {
                trigger: ['开发', '编程', '写代码', '写程序', 'Web应用', '实现功能'],
                regex: /(开发|编程|写代码|写程序|创建|构建|实现).*(应用|程序|系统|Web|网站|脚本|工具|服务|API|app)/i,
                priority: 20,
                steps: [
                    { action: 'plan', desc: '规划项目结构' },
                    { action: 'create_files', desc: '创建项目文件' },
                    { action: 'verify', desc: '验证项目完整性' }
                ]
            },
            'PPT生成': {
                trigger: ['PPT', '幻灯片', 'pptx', '商业计划书'],
                regex: /(PPT|幻灯片|pptx|商业计划书)/i,
                priority: 18,
                steps: [
                    { action: 'draft', desc: '收集内容' },
                    { action: 'ppt_create', desc: '生成PPT文件' }
                ]
            },
            'AI新闻搜索': {
                trigger: ['AI新闻', '人工智能新闻', '最新AI资讯', 'ChatGPT新闻'],
                regex: /(?:AI|人工智能|大模型|ChatGPT).*(?:新闻|资讯|动态|消息)|今日(?:AI|人工智能|科技)新闻/i,
                priority: 16,
                steps: [{ action: 'search_news', desc: '搜索AI新闻资讯' }]
            },
            '新闻搜索': {
                trigger: ['新闻', '最新资讯', '今日热点'],
                regex: /(?:新闻|资讯|热点).*搜索|搜.*新闻/i,
                priority: 12,
                steps: [{ action: 'search_news', desc: '搜索新闻资讯' }]
            },
            '搜索网页': {
                trigger: ['搜索', '搜一下', '查一下', '检索', '最新消息', '最新资讯'],
                regex: /(搜索|搜一下|查一下|检索|最新消息|最新资讯)\s*(.+)/i,
                priority: 10,
                steps: [{ action: 'search_web', desc: '搜索网页' }]
            },
            '打开应用': {
                trigger: ['打开应用', '启动应用', '运行程序'],
                regex: /^(打开|启动|运行)\s+(.+)/i,
                priority: 10,
                steps: [{ action: 'launch_app', desc: '启动应用' }]
            },
            '查天气': {
                trigger: ['天气', '气温', '温度'],
                regex: /(天气|气温|温度)/i,
                priority: 13,
                steps: [{ action: 'weather', desc: '查询天气' }]
            },
            '整理文件': {
                trigger: ['整理文件', '分类文件', '归纳文件', '整理桌面'],
                regex: /(整理|分类|归纳|排序).*(文件|文件夹|目录|桌面)/i,
                priority: 8,
                steps: [
                    { action: 'list', desc: '扫描文件夹' },
                    { action: 'analyze', desc: '分析文件类型' },
                    { action: 'group', desc: '分组整理' },
                    { action: 'report', desc: '生成报告' }
                ]
            },
            '数据分析图表': {
                trigger: ['图表', '可视化', '画图', '生成图', '分析趋势'],
                regex: /(图表|可视化|画图|分析.*数据|分析.*趋势|数据.*分析)/i,
                priority: 8,
                steps: [{ action: 'code_execute', desc: '执行Python代码进行数据分析和图表生成' }]
            },
            '内联表格整理': {
                trigger: ['整理成表格', '做成表格', '转成表格'],
                regex: /(整理成表格|做成表格|转成表格|表格[:：]).*[；;,\n]/i,
                priority: 14,
                steps: [{ action: 'inline_table', desc: '整理内联数据为表格' }]
            },
            '数据整理': {
                trigger: ['整理数据', '统计数据', '汇总数据'],
                regex: /(整理|统计|汇总).*(数据|表格|csv|excel)/i,
                priority: 7,
                steps: [
                    { action: 'read_file', desc: '读取数据源' },
                    { action: 'analyze', desc: '分析数据' },
                    { action: 'report', desc: '生成结果报告' }
                ]
            },
            '写总结': {
                trigger: ['总结', 'summarize'],
                regex: /(总结|summarize)/i,
                priority: 6,
                steps: [{ action: 'summarize', desc: '生成总结' }]
            },
            '翻译': {
                trigger: ['翻译', 'translate'],
                regex: /(翻译|translate)/i,
                priority: 6,
                steps: [{ action: 'translate', desc: '翻译内容' }]
            },
            '设置提醒': {
                trigger: ['提醒', '闹钟', '定时'],
                regex: /(提醒|闹钟|定时)/i,
                priority: 6,
                steps: [{ action: 'set_reminder', desc: '设置提醒' }]
            },
            '截图': {
                trigger: ['截图', '截屏'],
                regex: /(截图|截屏|屏幕截图)/i,
                priority: 6,
                steps: [{ action: 'take_screenshot', desc: '截取屏幕' }]
            },
            '旅行规划': {
                trigger: ['规划旅行', '规划行程', '旅游计划', '旅行计划', '行程安排'],
                regex: /(?:规划|制定|安排).*(?:旅行|旅游|行程)|(?:杭州|北京|上海|成都|西安|南京|苏州|重庆|深圳|广州).*(?:三天|2天|3天|4天|5天).*旅行/i,
                priority: 18,
                steps: [{ action: 'travel_plan', desc: '生成旅行规划方案' }]
            }
        };
    }

    /**
     * @description 匹配用户输入到预设模板，优先匹配高优先级模板
     * @param {string} userInput - 用户输入文本
     * @returns {Object|null} 匹配到的模板对象，未匹配返回 null
     */
    match(userInput) {
        const input = String(userInput || '');
        console.log('[TemplateRegistry.match] 输入:', input.substring(0, 50));

        const hasInlineData = /\d{1,4}[月/号日]\d{0,4}[号日]?/.test(input) ||
            (/\d+/.test(input) && input.length > 40 && /(收入|卖出|销售|金额|价格|成本|利润|退款)/.test(input));
        const isCodeGeneration = /(开发|编程|写代码|写程序|Web应用|写一个(?:应用|程序|系统|网站|脚本)|开发一个)/.test(input);
        const isCodeReview = /(代码有什么问题|看看这个代码|检查代码|审查代码|代码报错|无法运行|require\(|function\s+|const\s+|async\s+)/i.test(input);
        const isDataAnalysis = hasInlineData && /(分析|趋势|图表|画图|可视化|统计|汇总)/.test(input);
        const isKnowledgeQuestion = /^(什么是|是什么|有什么区别|区别是)/.test(input) ||
            /^(量子|相对论|人工智能|机器学习|深度学习)/.test(input) ||
            /(?:区别|差异|不同).*(?:是什么|哪些|什么意思)/.test(input);

        console.log('[TemplateRegistry.match] 标志位:', {hasInlineData, isCodeGeneration, isCodeReview, isDataAnalysis, isKnowledgeQuestion});

        if (isDataAnalysis) {
            console.log('[TemplateRegistry.match] 数据分析模式，返回null');
            return null;
        }

        let bestMatch = null;
        let bestPriority = 0;

        for (const [name, template] of Object.entries(this.templates)) {
            if (hasInlineData && ['数据整理', '整理文件'].includes(name)) continue;
            if (isCodeGeneration && ['整理文件', '数据整理', '写总结'].includes(name)) continue;
            if (isCodeReview && !['代码审查', '代码开发'].includes(name)) continue;
            if (isKnowledgeQuestion && name === '数据整理') continue;

            if (template.regex && template.regex.test(input)) {
                console.log('[TemplateRegistry.match] 正则匹配成功:', name);
                if (!bestMatch || template.priority > bestPriority) {
                    bestMatch = { name, ...template, match: input.match(template.regex), subTaskCount: _countSubTasks(input) };
                    bestPriority = template.priority;
                }
            }

            const matchedTrigger = template.trigger?.some(trigger => input.includes(trigger));
            if (matchedTrigger) {
                console.log('[TemplateRegistry.match] Trigger匹配成功:', name);
                if (!bestMatch || template.priority > bestPriority) {
                    bestMatch = { name, ...template, subTaskCount: _countSubTasks(input) };
                    bestPriority = template.priority;
                }
            }
        }

        console.log('[TemplateRegistry.match] 最终结果:', bestMatch ? bestMatch.name : 'null');
        return bestMatch;
    }

    /**
     * @description 添加自定义模板
     * @param {string} name - 模板名称
     * @param {Object} template - 模板配置
     * @returns {void}
     */
    add(name, template) {
        this.templates[name] = { ...template, custom: true };
    }

    /**
     * @description 执行模板步骤。未实现动作会返回失败，不把空壳步骤伪装成完成。
     * @param {object} template - 模板对象
     * @param {string} description - 任务描述
     * @param {object} options - 执行选项
     * @returns {Promise<object>} 执行结果
     */
    async executeTemplate(template, description, options = {}) {
        const toolHandlers = require('./tool_handlers');
        const results = [];
        const taskId = options.taskId || 'template_' + Date.now();

        console.log(`[TemplateRegistry] 执行模板: ${template.name}, 任务ID: ${taskId}`);

        for (const step of template.steps || []) {
            try {
                const result = await toolHandlers.executeStep(step.action, description, options);
                console.log(`[TemplateRegistry] 步骤 ${step.desc} 返回:`, JSON.stringify(result).substring(0, 200));

                results.push({ step: step.desc, action: step.action, result });

                if (result.needsLLM) {
                    console.log('[TemplateRegistry] 步骤需要 LLM，委托给 LLM 协调器');
                    return await this._delegateToLLMCoordinator(taskId, description, options);
                }

                if (result.error || result.success === false) {
                    const errorMessage = result.error || result.message || '步骤执行失败';
                    console.log(`[TemplateRegistry] 步骤执行失败: ${errorMessage}`);
                    return {
                        status: 'failed',
                        response: `任务执行失败: ${errorMessage}`,
                        steps: results
                    };
                }

                if (step.action === 'ppt_create' && result.success && result.filePath) {
                    const topicMatch = String(description).match(/(?:主题是?|关于)\s*['"“”]?([^'"“”，,\n]+)/);
                    const topic = topicMatch ? topicMatch[1].trim() : '演示文稿';

                    return {
                        status: 'completed',
                        response: `${topic} 的 PPT 已生成完成。文件已保存到：${result.filePath}`,
                        steps: results,
                        filePath: result.filePath,
                        downloadUrl: result.downloadUrl,
                        pptGenerated: true
                    };
                }
            } catch (error) {
                console.log(`[TemplateRegistry] 步骤执行异常: ${error.message}`);
                results.push({ step: step.desc, action: step.action, error: error.message });
                return {
                    status: 'failed',
                    response: `任务执行失败: ${error.message}`,
                    steps: results
                };
            }
        }

        const failedSteps = results.filter(item => item.error || item.result?.error || item.result?.success === false);
        if (failedSteps.length > 0) {
            return {
                status: 'failed',
                response: '部分步骤执行失败',
                steps: results
            };
        }

        const successResults = results.filter(item => {
            return !item.error &&
                item.implemented !== false &&
                (!item.result || (!item.result.error && item.result.implemented !== false));
        });

        if (successResults.length === 0) {
            return {
                status: 'failed',
                response: 'No template step produced a real successful result',
                steps: results
            };
        }

        return {
            status: 'completed',
            response: this._formatTemplateResponse(template.name, successResults),
            steps: results
        };
    }

    /**
     * @description 从成功步骤中提取用户可读结果，避免前端只显示泛化完成文案。
     * @param {string} templateName - 模板名称
     * @param {Array<object>} successResults - 成功步骤列表
     * @returns {string} 用户可读响应
     */
    _formatTemplateResponse(templateName, successResults) {
        const firstResult = successResults.find(item => item.result)?.result || {};
        const readable = firstResult.review ||
            firstResult.report ||
            firstResult.summary ||
            firstResult.analysis ||
            firstResult.plan ||
            firstResult.translated ||
            firstResult.content ||
            firstResult.body ||
            firstResult.groups ||
            firstResult.message ||
            firstResult.response;

        if (readable) return this._cleanReadableText(String(readable));
        return `${templateName} completed with ${successResults.length} real successful step(s)`;
    }

    /**
     * @description 清理模型输出中的思考标签，避免把内部推理展示给用户。
     * @param {string} text - 原始模型输出
     * @returns {string} 可展示文本
     */
    _cleanReadableText(text) {
        return String(text || '')
            .replace(/<start_of_thought>[\s\S]*?<end_of_thought>/gi, '')
            .replace(/<start_of_thought>[\s\S]*?(?=<final_answer>|$)/gi, '')
            .replace(/<\/?final_answer>/gi, '')
            .replace(/<type>[^<]*<\/type>/gi, '')
            .trim();
    }

    /**
     * @description 委托给 LLM 协调器执行复杂任务
     * @param {string} taskId - 任务ID
     * @param {string} description - 任务描述
     * @param {object} options - 执行选项
     * @returns {Promise<object>} 执行结果
     */
    async _delegateToLLMCoordinator(taskId, description, options = {}) {
        console.log(`[TemplateRegistry] 委托给 LLM 协调器执行任务: ${taskId}`);
        const llmCoordinator = require('./llm_coordinator');
        return await llmCoordinator.executeComplexTask(taskId, description, options);
    }
}

module.exports = new TemplateRegistry();
