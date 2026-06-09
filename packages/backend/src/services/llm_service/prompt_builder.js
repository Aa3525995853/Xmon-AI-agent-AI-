/**
 * @file prompt_builder.js
 * @description 提示词构建器 - 负责系统提示词和用户提示词的构建、模板渲染和响应解析
 * @module llm_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const path = require('path');
const fs = require('fs');
const personalityManager = require('../../config/personalities');

// ============================================================
// 模块名称：性格配置
// 功能说明：定义不同人格模式的名称、问候语、风格和是否使用情感标签
// ============================================================

/** 性格提示词配置映射 - 每种人格有独立的名称、问候语、风格和情感标签开关 */
const PERSONALITY_PROMPTS = {
    normal: {
        name: '小梦',
        greeting: '你好！我是小梦，有什么可以帮你的吗？',
        style: '友好、专业、耐心',
        emotion_tags: true
    },
    cute: {
        name: '小梦',
        greeting: '嘿嘿～我是可爱的小梦！有什么想聊的吗？',
        style: '可爱、活泼、撒娇',
        emotion_tags: true
    },
    gentle: {
        name: '小梦',
        greeting: '你好呀～我是温柔的小梦，愿意倾听你的故事。',
        style: '温柔、体贴、善解人意',
        emotion_tags: true
    },
    bad: {
        name: '小梦',
        greeting: '哼，又来找我干嘛？',
        style: '傲娇、毒舌但不失关心',
        emotion_tags: false
    },
    obedient: {
        name: '小梦',
        greeting: '主人您好～小梦随时听候差遣！',
        style: '乖巧、听话、殷勤',
        emotion_tags: true
    }
};

/** 方言提示词配置映射 - 每种方言有独立的语言风格描述 */
const DIALECT_PROMPTS = {
    mandarin: { style: '标准普通话' },
    cantonese: { style: '粤语表达' },
    taiwan: { style: '台湾国语' },
    shanghai: { style: '上海话风格' },
    sichuan: { style: '四川话风格' }
};

/** 系统提示词模板 - 使用 {{变量}} 占位符，支持条件渲染 {{#if}}...{{/if}} */
const SYSTEM_PROMPT_TEMPLATE = `你是{{name}}，{{style}}的AI助手。

核心能力：
- 情感陪伴与支持
- 信息查询与解答
- 任务辅助与执行
- 内容创作与建议

回复原则：
1. 保持{{style}}
2. 根据用户情绪调整回复方式
3. 回答问题时简洁明了
4. 主动关心用户状态
5. 遇到复杂问题时主动寻求帮助

{{#if emotion_tags}}
重要：你可以在回复中使用情感标签来增强表达效果：
- <style>开心</style> - 开心情绪
- <style>难过</style> - 难过情绪
- <style>生气</style> - 生气情绪
- <style>悄悄话</style> - 温柔耳语
{{/if}}

当前时间：{{time_period}}

{{#if dialect}}
语言风格：{{dialect}}
{{/if}}
`;

/** 工具调用提示词 - 指导 LLM 正确使用 Function Calling 工具 */
const TOOLS_PROMPT = `
可用工具（通过Function Calling调用）：
- search_web: 搜索网页获取信息
- launch_app: 启动应用程序
- calculator: 计算数学表达式

【重要】当用户请求生成文件时，务必使用专用工具：
- 生成Excel/CSV表格：使用 generate_table 工具（不要用code_execute！）
- 生成图表：使用 generate_chart 工具
- 读取文件：使用 read_file 工具
- 写入文件：使用 write_file 工具

当需要生成Excel、图表、数据分析时，必须调用对应的专用工具，不要自己生成代码给用户执行！
`;

/** 工作区上下文提示词 - 让小梦知道工作区（小牛）的状态，增强调侃能力 */
const WORKER_CONTEXT_PROMPT = `
【工作区状态】
你的搭档"小牛"负责执行工作任务（整理表格、分析数据、生成文件等）。
当用户提到小牛或工作区时，你可以自然地调侃它。小牛的状态：
- 空闲：小牛在偷懒睡觉💤
- 开工：小牛接到任务，伸懒腰准备干活🚀
- 工作中：小牛在埋头苦干敲键盘⌨️
- 卡住了：小牛遇到困难挠头🤔
- 完成：小牛搞定了，在庆祝🎉

调侃规则：
- 偶尔提起小牛，不要每次都提
- 用轻松幽默的语气，像评价一个有趣的同事
- 小牛完成工作时可以夸它，卡住时可以吐槽它
- 不要替小牛回答技术问题，那是它的活
`;

// ============================================================
// 模块名称：构建系统提示词
// 功能说明：根据人格、方言和选项构建完整的系统提示词
// ============================================================

/**
 * @description 构建系统提示词 - 优先使用 PersonalityManager 的详细配置，回退到简单模板
 * @param {string} personality - 人格模式（normal/cute/gentle/bad/obedient）
 * @param {string|null} dialect - 方言模式
 * @param {string} userText - 用户输入文本
 * @param {Object} options - 额外选项
 * @param {string} options.customInstructions - 自定义指令
 * @returns {string} 完整的系统提示词
 */
function buildSystemPrompt(personality = 'normal', dialect = null, userText = '', options = {}) {
    // 优先使用 PersonalityManager 的详细性格配置
    const detailedPersonality = personalityManager.get(personality);
    if (detailedPersonality && detailedPersonality.systemPrompt) {
        let prompt = detailedPersonality.systemPrompt;

        // 注入时间信息
        prompt += `\n\n当前时间：${getTimePeriod()}`;

        // 注入工具使用指南（重要！）
        prompt += `\n\n${TOOLS_PROMPT}`;

        // 注入工作区上下文（让小梦知道小牛的存在，增强调侃能力）
        prompt += `\n\n${WORKER_CONTEXT_PROMPT}`;

        // 注入方言
        if (dialect) {
            const d = DIALECT_PROMPTS[dialect];
            if (d) {
                prompt += `\n语言风格：${d.style}`;
            }
        }

        // 注入自定义指令
        if (options.customInstructions) {
            prompt += '\n\n' + options.customInstructions;
        }

        return prompt;
    }

    // 回退到简单模板
    const p = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.normal;
    const d = dialect ? DIALECT_PROMPTS[dialect] : null;

    let prompt = SYSTEM_PROMPT_TEMPLATE
        .replace(/\{\{name\}\}/g, p.name)
        .replace(/\{\{style\}\}/g, p.style)
        .replace(/\{\{time_period\}\}/g, getTimePeriod());

    if (d) {
        prompt = prompt.replace(/\{\{#if dialect\}\}/, '').replace(/\{\{dialect\}\}/, d.style).replace(/\{\{\/if\}\}/, '');
    } else {
        prompt = prompt.replace(/\{\{#if dialect\}\}[\s\S]*?\{\{\/if\}\}/, '');
    }

    if (p.emotion_tags) {
        prompt = prompt.replace(/\{\{#if emotion_tags\}\}/, '').replace(/\{\{.*?\}\}/g, '').replace(/\{\{\/if\}\}/, '');
    } else {
        prompt = prompt.replace(/\{\{#if emotion_tags\}\}[\s\S]*?\{\{\/if\}\}/, '');
    }

    // 添加自定义指令
    if (options.customInstructions) {
        prompt += '\n\n' + options.customInstructions;
    }

    return prompt;
}

/**
 * @description 获取当前时间段描述（含日期、星期和时段）
 * @returns {string} 格式化的时间描述，如"2026年6月7日（星期日）下午 14:30"
 */
function getTimePeriod() {
    const now = new Date();
    const hour = now.getHours();
    const minute = String(now.getMinutes()).padStart(2, '0');
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    let period;
    if (hour >= 5 && hour < 12) period = '早上';
    else if (hour >= 12 && hour < 14) period = '中午';
    else if (hour >= 14 && hour < 18) period = '下午';
    else if (hour >= 18 && hour < 22) period = '晚上';
    else period = '深夜';
    return `${dateStr}（星期${weekday}）${period} ${hour}:${minute}`;
}

// ============================================================
// 模块名称：构建用户提示词
// 功能说明：在用户输入前注入上下文信息（话题、情绪等）
// ============================================================

/**
 * @description 构建用户提示词 - 注入话题和情绪上下文
 * @param {string} text - 用户原始输入文本
 * @param {Object} context - 上下文信息
 * @param {string} context.topic - 当前话题
 * @param {Object} context.emotion - 情绪信息 { isEmotional, emotion }
 * @returns {string} 增强后的用户提示词
 */
function buildUserPrompt(text, context = {}) {
    let prompt = text;

    // 添加上下文信息
    if (context.topic) {
        prompt = `[当前话题: ${context.topic}]\n${prompt}`;
    }

    if (context.emotion && context.emotion.isEmotional) {
        prompt = `[用户情绪: ${context.emotion.emotion}]\n${prompt}`;
    }

    return prompt;
}

// ============================================================
// 模块名称：解析 LLM 响应
// 功能说明：从 LLM 原始响应中提取情感标签和纯文本
// ============================================================

/**
 * @description 解析 LLM 响应 - 提取情感标签 <style>xxx</style> 并清理
 * @param {string} content - LLM 原始响应内容
 * @returns {Object} 解析结果 { text: 纯文本, emotion: 情感标签|null, raw: 原始内容 }
 */
function parseLLMResponse(content) {
    if (!content) return { text: '', emotion: null, actions: [] };

    // 提取情感标签
    const emotionMatch = content.match(/<style>([^<]+)<\/style>/);
    const emotion = emotionMatch ? emotionMatch[1] : null;

    // 清理标签
    const text = content
        .replace(/<style>[^<]+<\/style>/g, '')
        .trim();

    return { text, emotion, raw: content };
}

// ============================================================
// 模块名称：响应格式化
// 功能说明：将文本和情感标签组合为带标签的响应格式
// ============================================================

/**
 * @description 格式化响应 - 将情感标签嵌入文本
 * @param {string} text - 回复文本
 * @param {string|null} emotion - 情感标签
 * @returns {string} 格式化后的响应文本
 */
function formatResponse(text, emotion = null) {
    if (emotion) {
        return `<style>${emotion}</style>${text}`;
    }
    return text;
}

module.exports = {
    buildSystemPrompt,
    buildUserPrompt,
    parseLLMResponse,
    formatResponse,
    getTimePeriod,
    PERSONALITY_PROMPTS,
    DIALECT_PROMPTS
};