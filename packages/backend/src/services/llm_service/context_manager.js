/**
 * @file context_manager.js
 * @description 上下文管理器 - 智能上下文窗口管理、情绪检测、话题追踪和跨会话上下文注入
 * @module llm_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { legacyMemoryService } = require('../memory_service');

// ============================================================
// 模块名称：上下文配置
// 功能说明：定义上下文窗口大小、情感保留策略和深度话题关键词
// ============================================================

/** 上下文管理配置常量 */
const CONTEXT_CONFIG = {
    /** 话题深度阈值 - 超过此次数认为话题进入深度讨论 */
    TOPIC_DEPTH_THRESHOLD: 3,
    /** 情感对话保留倍数 - 情感对话保留更多历史消息 */
    EMOTION_RETENTION_BONUS: 1.5,
    /** 话题历史保留条数 */
    TOPIC_HISTORY_KEEP: 6,
    /** 情感历史保留条数 */
    EMOTION_HISTORY_KEEP: 8,
    /** 普通历史保留条数 */
    NORMAL_HISTORY_KEEP: 10,
    /** 触发摘要的历史条数阈值 - 超过则启用智能窗口裁剪 */
    SUMMARY_THRESHOLD: 15,
    /** 跨会话注入的最近话题数量 */
    CROSS_SESSION_INJECTION: 3,
    /** 深度话题关键词 - 涉及这些词的对话需要保留更多上下文 */
    DEEP_TOPIC_KEYWORDS: [
        '工作', '事业', '梦想', '目标', '人生', '意义', '价值',
        '感情', '恋爱', '分手', '家庭', '父母', '孩子',
        '压力', '焦虑', '迷茫', '孤独', '难过', '伤心',
        '健康', '身体', '心理', '情感'
    ]
};

/** 情绪关键词列表 - 用于检测用户消息中的情感倾向 */
const EMOTION_KEYWORDS = [
    '难过', '伤心', '哭', '开心', '高兴', '焦虑', '孤独', '迷茫', '感动', '累', '烦', '生气',
    '崩溃', '委屈', '害怕', '紧张', '寂寞', '压力', '想哭', '心痛', '难受', '低落', '快乐',
    '幸福', '温暖', '心疼', '担心', '思念', '想念', '爱', '喜欢', '讨厌', '愤怒', '绝望',
    '无助', '失落', '沮丧', '抑郁', '烦躁', '不安', 'emo', '失眠', '失恋', '撑不住', '煎熬',
    '倒霉', '挫折', '打击', '压抑', '空虚', '麻木', '颓废', '无聊', '发呆', '摸鱼', '躺平',
    '摆烂', '社恐', '困惑', '激动', '兴奋', '期待', '表扬', '夸我', '获奖', '赢了', '搞定',
    '完美', '顺利', '恭喜', '庆祝', '上岸', '脱单', '升职', '加薪', '好运', '幸运', '甜蜜',
    '满足', '骄傲', '自豪', '欣慰', '喜悦', '治愈', '感恩', '破防', '泪目'
];

// ============================================================
// 模块名称：缓存
// 功能说明：缓存对话摘要和系统提示词，避免重复计算
// ============================================================

/** 对话摘要缓存 */
let conversationSummary = null;
/** 摘要生成时间戳 */
let summaryGeneratedAt = 0;
/** 摘要缓存有效期（毫秒） - 5分钟 */
const SUMMARY_CACHE_TTL = 5 * 60 * 1000;

/** 系统提示词缓存 */
let systemPromptCache = { key: '', prompt: '', ts: 0 };
/** 系统提示词缓存有效期（毫秒） - 1分钟 */
const SYSTEM_PROMPT_CACHE_TTL = 60 * 1000;

// ============================================================
// 模块名称：情绪检测
// 功能说明：检测用户消息和对话历史中的情感倾向
// ============================================================

/**
 * @description 判断单条消息是否包含情感关键词
 * @param {string} text - 消息文本
 * @returns {boolean} 是否为情感消息
 */
function isEmotionalMessage(text) {
    if (!text || typeof text !== 'string') return false;
    return EMOTION_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * @description 判断对话历史是否为情感对话（最近6条中至少2条包含情感关键词）
 * @param {Array<Object>} history - 对话历史消息数组
 * @returns {boolean} 是否为情感对话
 */
function isEmotionalConversation(history) {
    if (!history || history.length === 0) return false;
    const recentHistory = history.slice(-6);
    let emotionCount = 0;
    for (const msg of recentHistory) {
        if (isEmotionalMessage(msg.content || '')) {
            emotionCount++;
        }
    }
    return emotionCount >= 2;
}

/**
 * @description 检测用户消息的主导情绪和强度
 * @param {string} text - 用户消息文本
 * @returns {Object} 情绪检测结果 { emotion, intensity, isEmotional }
 */
function detectUserEmotion(text) {
    if (!text || typeof text !== 'string') return { emotion: 'neutral', intensity: 0 };

    const emotionMap = {
        '开心': ['开心', '高兴', '快乐', '愉快', '兴奋', '棒', '完美', '顺利'],
        '难过': ['难过', '伤心', '哭', '心痛', '难受', '难受'],
        '生气': ['生气', '愤怒', '气', '烦', '讨厌'],
        '焦虑': ['焦虑', '担心', '害怕', '紧张', '不安'],
        '孤独': ['孤独', '寂寞', '没人', '一个人', '孤单']
    };

    let maxCount = 0;
    let dominantEmotion = 'neutral';

    for (const [emotion, keywords] of Object.entries(emotionMap)) {
        const count = keywords.filter(kw => text.includes(kw)).length;
        if (count > maxCount) {
            maxCount = count;
            dominantEmotion = emotion;
        }
    }

    return {
        emotion: dominantEmotion,
        intensity: Math.min(maxCount / 2, 1),
        isEmotional: maxCount > 0
    };
}

// ============================================================
// 模块名称：话题追踪
// 功能说明：从用户消息中提取当前话题，判断是否为深度话题
// ============================================================

/**
 * @description 从用户消息中提取话题 - 通过正则模式和关键词匹配
 * @param {string} text - 用户消息文本
 * @returns {string|null} 提取出的话题，无法识别则返回 null
 */
function extractTopic(text) {
    if (!text || typeof text !== 'string') return null;

    const topicPatterns = [
        /关于(.+?)的/,
        /在谈(.+?)$/,
        /说(.+?)的/,
        /聊(.+?)$/,
        /(工作|学习|生活|感情|健康|家庭)方面/
    ];

    for (const pattern of topicPatterns) {
        const match = text.match(pattern);
        if (match) return match[1];
    }

    // 关键词话题
    const topicKeywords = {
        '工作': ['工作', '上班', '加班', '辞职', '面试', '老板', '同事'],
        '学习': ['学习', '考试', '考研', '读书', '课程', '作业'],
        '感情': ['恋爱', '分手', '喜欢', '约会', '男/女朋友'],
        '健康': ['健康', '身体', '生病', '医院', '锻炼', '减肥'],
        '家庭': ['家庭', '父母', '孩子', '家人', '回家']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some(kw => text.includes(kw))) return topic;
    }

    return null;
}

/**
 * @description 判断文本是否涉及深度话题（工作、感情、健康等需要更多上下文的话题）
 * @param {string} text - 文本内容
 * @returns {boolean} 是否为深度话题
 */
function isDeepTopic(text) {
    if (!text) return false;
    return CONTEXT_CONFIG.DEEP_TOPIC_KEYWORDS.some(kw => text.includes(kw));
}

// ============================================================
// 模块名称：智能上下文窗口
// 功能说明：根据情感状态和话题深度动态调整保留的历史消息数量
// ============================================================

/**
 * @description 获取智能上下文窗口 - 根据情感和话题深度决定保留多少历史消息
 * @param {Array<Object>} history - 完整的对话历史
 * @returns {Object} 上下文窗口 { keepAll, messages, reason }
 */
function getSmartContextWindow(history) {
    const totalHistory = history || [];

    if (totalHistory.length <= CONTEXT_CONFIG.SUMMARY_THRESHOLD) {
        return { keepAll: true, messages: totalHistory };
    }

    const isEmotion = isEmotionalConversation(totalHistory);
    const recentText = totalHistory.slice(-4).map(m => m.content || '').join('');
    const isDeep = isDeepTopic(recentText);

    let keepCount;
    if (isEmotion) {
        keepCount = Math.min(
            Math.ceil(CONTEXT_CONFIG.NORMAL_HISTORY_KEEP * CONTEXT_CONFIG.EMOTION_RETENTION_BONUS),
            totalHistory.length
        );
    } else if (isDeep) {
        keepCount = Math.min(
            CONTEXT_CONFIG.NORMAL_HISTORY_KEEP + 4,
            totalHistory.length
        );
    } else {
        keepCount = CONTEXT_CONFIG.NORMAL_HISTORY_KEEP;
    }

    const recent = totalHistory.slice(-keepCount);
    return { keepAll: false, messages: recent, reason: isEmotion ? 'emotional' : isDeep ? 'deep' : 'normal' };
}

// ============================================================
// 模块名称：历史清理
// 功能说明：验证和清理对话历史中的无效消息
// ============================================================

/**
 * @description 验证历史消息是否有效（非空、非超长、有内容）
 * @param {Object} msg - 消息对象
 * @returns {boolean} 消息是否有效
 */
function isValidHistoryMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (typeof msg.content !== 'string') return false;
    if (!msg.content.trim()) return false;
    if (msg.content.length > 10000) return false;
    return true;
}

/**
 * @description 清理历史消息内容中的 HTML 标签和情感标签
 * @param {string} content - 消息内容
 * @returns {string} 清理后的纯文本
 */
function cleanHistoryContent(content) {
    if (typeof content !== 'string') return '';
    return content
        .replace(/<style>.*?<\/style>/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

// ============================================================
// 模块名称：跨会话上下文
// 功能说明：获取跨会话的最近话题，为当前对话提供上下文连续性
// ============================================================

/**
 * @description 获取跨会话上下文 - 从记忆服务中获取最近的话题
 * @returns {Promise<Array>} 跨会话话题数组
 */
async function getCrossSessionContext() {
    if (!legacyMemoryService || !legacyMemoryService.getRecentTopics) {
        return [];
    }

    try {
        const topics = await legacyMemoryService.getRecentTopics(CONTEXT_CONFIG.CROSS_SESSION_INJECTION);
        return topics || [];
    } catch (e) {
        return [];
    }
}

/**
 * @description 生成对话摘要（带缓存）- 使用 LLM 从对话历史中生成摘要
 * @param {Array<Object>} [history] - 可选的对话历史，如果未提供则从 memory_service 获取
 * @returns {Promise<string>} 对话摘要文本
 */
async function generateConversationSummary(history) {
    const now = Date.now();

    // 检查缓存
    if (conversationSummary && (now - summaryGeneratedAt) < SUMMARY_CACHE_TTL) {
        return conversationSummary;
    }

    // 获取对话历史
    let conversationHistory = history;
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
        try {
            conversationHistory = legacyMemoryService.getConversationHistory(50);
        } catch (e) {
            conversationHistory = [];
        }
    }

    // 如果没有对话历史，无法生成摘要
    if (!conversationHistory || conversationHistory.length === 0) {
        // 【修复】返回null而非空字符串，明确表示"无法生成"而非"摘要为空"
        return null;
    }

    try {
        // 构建摘要提示词
        const historyText = conversationHistory
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');

        const prompt = `请对以下对话内容生成一个简洁的摘要，概括主要话题和关键信息。

对话内容：
${historyText}

摘要（50字以内）：`;

        // 调用 LLM 生成摘要
        let llmService;
        try {
            llmService = require('./main');
        } catch (e) {
            // 【修复】LLM服务不可用时返回null，而非空字符串伪装成摘要
            return null;
        }

        const result = await llmService.generateReply(prompt, '');
        const summary = typeof result === 'string' ? result : (result.text || result.message || '');

        // 缓存结果（仅缓存有效摘要）
        if (summary && summary.trim()) {
            conversationSummary = summary.trim();
            summaryGeneratedAt = now;
        }

        // 【修复】返回缓存的摘要或null，不用空字符串伪装摘要
        return conversationSummary || null;
    } catch (e) {
        console.error('[ContextManager] 生成摘要失败:', e.message);
        // 【修复】错误时返回缓存的摘要或null，不用空字符串
        return conversationSummary || null;
    }
}

// ============================================================
// 模块名称：构建上下文
// 功能说明：整合情绪检测、话题提取和跨会话信息，构建完整上下文对象
// ============================================================

/**
 * @description 构建上下文 - 整合情绪、话题和跨会话信息
 * @param {string} text - 用户输入文本
 * @param {string} sessionId - 会话ID
 * @returns {Promise<Object>} 上下文对象 { sessionId, text, timestamp, emotion, topic, isDeepTopic, crossSession }
 */
async function buildContext(text, sessionId = 'default') {
    const context = {
        sessionId,
        text,
        timestamp: Date.now(),
        emotion: detectUserEmotion(text),
        topic: extractTopic(text),
        isDeepTopic: isDeepTopic(text)
    };

    // 获取跨会话上下文
    try {
        context.crossSession = await getCrossSessionContext();
    } catch (e) {
        context.crossSession = [];
    }

    return context;
}

/**
 * @description 获取当前时间段名称
 * @returns {string} 时间段名称（早上/中午/下午/晚上/深夜）
 */
function getTimePeriod() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return '早上';
    if (hour >= 12 && hour < 14) return '中午';
    if (hour >= 14 && hour < 18) return '下午';
    if (hour >= 18 && hour < 22) return '晚上';
    return '深夜';
}

module.exports = {
    isEmotionalMessage,
    isEmotionalConversation,
    detectUserEmotion,
    extractTopic,
    isDeepTopic,
    getSmartContextWindow,
    isValidHistoryMessage,
    cleanHistoryContent,
    getCrossSessionContext,
    generateConversationSummary,
    buildContext,
    getTimePeriod,
    CONTEXT_CONFIG
};