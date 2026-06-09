/**
 * @file main.js
 * @description LLM 服务主入口 - 双脑异步架构，实现三层路由策略（闲聊→Mimo、工作指令→工作大脑、降级兜底→Mimo）
 * @module llm_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');

// ============================================================
// 模块名称：延迟加载子模块
// 功能说明：使用延迟加载避免循环依赖，按需初始化各子模块
// ============================================================

/** @type {Object|null} 上下文管理器实例 */
let _contextManager = null;
/** @type {Object|null} 提示词构建器实例 */
let _promptBuilder = null;
/** @type {Object|null} MiMo 提供者实例 */
let _mimoProvider = null;
/** @type {Object|null} Kimi 提供者实例 */
let _kimiProvider = null;
/** @type {Object|null} 工作大脑提供者实例 */
let _workBrainProvider = null;

// ============================================================
// 模块名称：任务状态管理
// 功能说明：管理异步任务的创建、状态追踪和取消
// ============================================================

/** @type {Map<string, Object>} 运行中的任务映射表 */
const tasks = new Map();

/** @type {Array} 任务等待队列 */
const TASK_QUEUE = [];

/** 工作大脑熔断器状态 - open=true 表示正常可用，open=false 表示熔断中 */
const WORK_BRAIN_CIRCUIT = { open: true, failCount: 0, lastFail: 0 };

// ============================================================
// 模块名称：延迟加载子模块
// 功能说明：按需加载子模块，避免循环依赖问题
// ============================================================

/**
 * @description 获取上下文管理器单例（延迟加载）
 * @returns {Object} 上下文管理器实例
 */
function getContextManager() {
    if (!_contextManager) _contextManager = require('./context_manager');
    return _contextManager;
}

/**
 * @description 获取提示词构建器单例（延迟加载）
 * @returns {Object} 提示词构建器实例
 */
function getPromptBuilder() {
    if (!_promptBuilder) _promptBuilder = require('./prompt_builder');
    return _promptBuilder;
}

/**
 * @description 获取 MiMo 提供者单例（延迟加载）
 * @returns {Object} MiMo 提供者实例
 */
function getMimoProvider() {
    if (!_mimoProvider) _mimoProvider = require('./providers/mimo_provider');
    return _mimoProvider;
}

/**
 * @description 获取 Kimi 提供者单例（延迟加载）
 * @returns {Object} Kimi 提供者实例
 */
function getKimiProvider() {
    if (!_kimiProvider) _kimiProvider = require('./providers/kimi_provider');
    return _kimiProvider;
}

/**
 * @description 获取工作大脑提供者单例（延迟加载）
 * @returns {Object} 工作大脑提供者实例
 */
function getWorkBrainProvider() {
    if (!_workBrainProvider) _workBrainProvider = require('./providers/workbrain_provider');
    return _workBrainProvider;
}

/**
 * @description 直接调用 MiMo 模型，绕过人格系统和工具定义，用于纯文本生成场景
 * @param {string} prompt - 用户输入文本
 * @param {string} userText - 用户原始文本（用于上下文）
 * @returns {Promise<{content: string, success: boolean}>} 模型响应
 */
async function callMimoDirect(prompt, userText = '') {
    try {
        const result = await getMimoProvider().call(prompt, userText, null, 'normal', null, { skipWorkflow: true });
        const content = result?.text || result?.content || result?.message || '';
        return { content, success: true };
    } catch (e) {
        return { content: '', success: false, error: e.message };
    }
}

// ============================================================
// 模块名称：意图检测
// 功能说明：根据用户输入文本判断意图类型，决定路由到哪个大脑
// ============================================================

/**
 * @description 检测用户输入的意图类型（work/quick/chat）
 * @param {string} text - 用户输入文本
 * @returns {string} 意图类型：'work'（工作指令）、'quick'（快速回复）、'chat'（闲聊）
 */
function detectIntent(text) {
    /** 触发工作区的任务类型（复杂/大任务） */
    const workBrainKeywords = [
        '帮我', '请帮我', '替我', '帮我做', '帮我查', '帮我找', '帮我整理',
        '搜索', '分析', '整理', '创建', '生成', '制作', '下载', '上传',
        '打开', '关闭', '删除', '移动', '复制', '发送', '设置',
        '代码', '开发', '编程', '写程序', '创建一个',
        // 文件操作类
        'Excel', 'Word', 'PPT', '表格', '文档', '幻灯片',
        '桌面', '文件夹', '文件', '我的电脑', '此电脑',
        // 复杂任务指示
        '多个', '批量', '全部', '整个', '所有', '统计', '汇总'
    ];

    /** 触发快速回复的关键词列表 - 简单问答类 */
    const quickReplyKeywords = [
        '今天天气', '现在几点了', '你是谁', '你好', 'hi', 'hello',
        '在吗', '在不在', '干嘛', '什么'
    ];

    /** 翻译/头脑风暴类 - 闲聊区可处理 */
    const chatZoneKeywords = [
        '翻译', '翻成', '什么意思', '是什么', '为什么',
        '帮我想想', '有什么建议', '对比', '比较',
        '怎么', '如何'
    ];

    const textLower = text.toLowerCase();

    // 1. 工作区关键词 → work
    for (const kw of workBrainKeywords) {
        if (text.includes(kw)) return 'work';
    }

    // 2. 快速回复关键词 → quick
    for (const kw of quickReplyKeywords) {
        if (textLower.includes(kw)) return 'quick';
    }

    // 3. 闲聊区关键词 → chat
    for (const kw of chatZoneKeywords) {
        if (text.includes(kw)) return 'chat';
    }

    // 默认闲聊区
    return 'chat';
}

/**
 * @description 判断是否为复杂任务（需要多步操作或批量处理）
 * @param {string} text - 用户输入文本
 * @returns {boolean} 是否为复杂任务
 */
function isComplexTask(text) {
    /** 复杂任务指示词 - 包含批量、分析、对比等需要深度处理的词汇 */
    const indicators = [
        '多', '批量', '多个', '全部', '整个', '所有',
        '分析', '整理', '对比', '统计', '汇总',
        '生成报告', '转换', '处理', '规划'
    ];
    return indicators.some(kw => text.includes(kw));
}

// ============================================================
// 模块名称：主回复函数
// 功能说明：双区分流 - 根据 intentRouter 判断路由到闲聊区(小梦)或工作区(牛马)
// ============================================================

/** 延迟加载 intentRouter 避免循环依赖 */
let _intentRouter = null;

function getIntentRouter() {
    if (!_intentRouter) {
        _intentRouter = require('../intentRouter');
    }
    return _intentRouter;
}

/**
 * @description 主回复生成函数 - 双区分流
 * @param {string} text - 用户输入文本
 * @param {string} userText - 原始用户文本（保留用于上下文）
 * @param {Array|null} tools - 可用工具列表（Function Calling）
 * @param {string} personality - 人格模式（normal/cute/gentle/bad/obedient）
 * @param {string|null} dialect - 方言模式
 * @param {Object} options - 额外选项（sessionId、skipWorkflow 等）
 * @param {string} options.sessionId - 会话ID
 * @param {boolean} options.skipWorkflow - 是否跳过工作区
 * @returns {Promise<Object>} 回复结果 { success, text, emotion, raw, zone, taskType }
 */
async function generateReply(text, userText = '', tools = null, personality = 'normal', dialect = null, options = {}) {
    // 测试模式下直接返回模拟回复
    if (process.env.NODE_ENV === 'test') {
        return {
            success: true,
            text: `测试回复: ${String(text || '').substring(0, 80)}`,
            emotion: 'neutral',
            raw: String(text || ''),
            zone: 'chat',
            taskType: null
        };
    }

    // 使用 intentRouter 进行双区分流
    const router = getIntentRouter();
    const routeResult = router.route(text, options);

    // 构建上下文信息
    const ctx = getContextManager();
    const context = await ctx.buildContext(text, options.sessionId || 'default');

    // 根据分区路由
    switch (routeResult.zone) {
        case 'system':
            // 系统快捷操作 → 返回系统操作指令
            return {
                success: true,
                text: `收到指令：${routeResult.taskType}，正在执行...`,
                emotion: 'neutral',
                raw: text,
                zone: 'system',
                taskType: routeResult.taskType
            };

        case 'work':
            // 工作区任务 → 使用工作大脑
            if (!options.skipWorkflow && WORK_BRAIN_CIRCUIT.open) {
                try {
                    const result = await getWorkBrainProvider().call(text, { ...options, context });
                    if (result.success) {
                        return {
                            ...result,
                            zone: 'work',
                            taskType: routeResult.taskType,
                            taskDescription: routeResult.taskDescription
                        };
                    }
                } catch (e) {
                    console.log('[LLM] 工作区执行失败，降级到小梦');
                }
            }
            // 降级到小梦处理
            return await getMimoProvider().call(text, userText, tools, personality, dialect, {
                ...options,
                zone: 'work',
                taskType: routeResult.taskType
            });

        case 'chat':
        default:
            // 闲聊区任务 → 使用小梦
            return await getMimoProvider().call(text, userText, tools, personality, dialect, {
                ...options,
                zone: 'chat',
                taskType: routeResult.taskType,
                taskDescription: routeResult.taskDescription
            });
    }
}

/**
 * @description 执行异步任务 - 创建任务并追踪状态
 * @param {string} text - 任务描述文本
 * @param {string} personality - 人格模式
 * @param {string|null} dialect - 方言模式
 * @returns {Promise<Object>} 任务结果 { taskId, result }
 */
async function executeTask(text, personality = 'normal', dialect = null) {
    const taskId = 'task_' + Date.now();
    tasks.set(taskId, { id: taskId, text, status: 'running', startTime: Date.now() });

    try {
        const result = await generateReply(text, '', null, personality, dialect);
        tasks.get(taskId).status = 'completed';
        return { taskId, result };
    } catch (e) {
        tasks.get(taskId).status = 'failed';
        throw e;
    }
}

/**
 * @description 获取所有任务的状态列表
 * @returns {Array<Object>} 任务状态数组
 */
function getTaskStatus() {
    return Array.from(tasks.values());
}

/**
 * @description 提升指定任务的优先级
 * @param {string} taskId - 任务ID
 */
function prioritizeTask(taskId) {
    const task = tasks.get(taskId);
    if (task) {
        task.priority = (task.priority || 0) + 1;
    }
}

/**
 * @description 取消并删除指定任务
 * @param {string} taskId - 任务ID
 */
function cancelTask(taskId) {
    tasks.delete(taskId);
}

// ============================================================
// 模块名称：风格回复
// 功能说明：支持不同风格的回复生成
// ============================================================

/**
 * @description 带风格参数的回复生成（当前与 generateReply 行为一致，预留扩展）
 * @param {string} text - 用户输入文本
 * @param {string} intent - 意图类型
 * @param {Array|null} tools - 可用工具列表
 * @param {string} personality - 人格模式
 * @param {string|null} dialect - 方言模式
 * @returns {Promise<Object>} 回复结果
 */
async function generateReplyWithStyle(text, intent, tools = null, personality = 'normal', dialect = null) {
    return await generateReply(text, '', tools, personality, dialect);
}

// ============================================================
// 模块名称：健康检查
// 功能说明：检测各 LLM 提供者的可用性状态
// ============================================================

/**
 * @description 检查所有 LLM 提供者的健康状态
 * @returns {Promise<Object>} 各提供者健康状态 { mimo, kimi, workBrain }
 */
async function checkHealth() {
    const checkProvider = async (provider) => {
        const startTime = Date.now();
        const available = await provider.healthCheck().catch(() => false);
        return {
            available,
            latency: Date.now() - startTime
        };
    };

    const mimo = await checkProvider(getMimoProvider());
    const kimi = await checkProvider(getKimiProvider());
    const workbrain = await checkProvider(getWorkBrainProvider());

    return {
        mimo,
        kimi,
        workbrain: {
            ...workbrain,
            circuitBreaker: { ...WORK_BRAIN_CIRCUIT }
        },
        workBrain: {
            ...workbrain,
            circuitBreaker: { ...WORK_BRAIN_CIRCUIT }
        }
    };
}

// ============ 导出 ============
module.exports = {
    // 核心功能
    generateReply,
    executeTask,
    getTaskStatus,
    prioritizeTask,
    cancelTask,
    checkHealth,
    callMimoDirect,

    // 路由相关（兼容旧接口）
    detectIntent,
    isComplexTask,

    // 新增：双区路由（使用 intentRouter）
    route: (text, options) => {
        const router = require('../intentRouter');
        return router.route(text, options);
    },

    // 供其他模块使用
    getContextManager,
    getPromptBuilder
};
