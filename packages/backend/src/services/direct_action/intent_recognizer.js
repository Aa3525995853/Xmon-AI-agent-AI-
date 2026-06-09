/**
 * @file intent_recognizer.js
 * @description 意图识别器 - 通过关键词匹配和 LLM 两种方式识别用户输入的意图，
 *              支持工具意图、搜索意图和未知意图的分类
 * @module services/direct_action
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 意图关键词映射
// ============================================================

/** 意图关键词映射表，每个意图包含关键词列表和对应动作 */
const INTENT_PATTERNS = {
    weather: {
        keywords: ['天气', '气温', '温度', '下雨', '晴天', '冷', '热'],
        action: 'weather'
    },
    alarm: {
        keywords: ['闹钟', '定闹钟', '设闹钟', '提醒我', '叫醒'],
        action: 'alarm'
    },
    schedule: {
        keywords: ['日程', '日程表', '会议', '预约', '安排'],
        action: 'schedule'
    },
    reminder: {
        keywords: ['提醒', '别忘了', '记得', '记着'],
        action: 'reminder'
    },
    translate: {
        keywords: ['翻译', '英文', '中文', '什么意思'],
        action: 'translate'
    },
    note: {
        keywords: ['笔记', '记一下', '记录', '写下来'],
        action: 'note'
    },
    calculator: {
        keywords: ['计算', '算一下', '等于', '加', '减', '乘', '除'],
        action: 'calculator'
    },
    email: {
        keywords: ['邮件', '发邮件', '写信', 'email'],
        action: 'email'
    }
};

class IntentRecognizer {
    /**
     * @description 构造函数，初始化意图模式映射
     */
    constructor() {
        /** 意图关键词模式映射 */
        this.patterns = INTENT_PATTERNS;
    }

    /**
     * @description 识别用户输入的意图，先尝试关键词匹配，失败则使用 LLM 识别
     * @param {string} text - 用户输入文本
     * @param {Object} llmService - LLM 服务实例（可选）
     * @returns {Promise<{type: string, action?: string, searchType?: string, query?: string, params?: Object}>} 意图识别结果
     */
    async recognize(text, llmService) {
        // 1. 简单关键词匹配，速度快且无 API 开销
        const simple = this.simpleMatch(text);
        if (simple) return simple;

        // 2. LLM 识别（可选），处理关键词无法覆盖的复杂表达
        if (llmService) {
            try {
                return await this.llmRecognize(text, llmService);
            } catch (e) {
                logger.warn('[意图识别] LLM识别失败:', e.message);
            }
        }

        return { type: 'unknown', action: 'unknown' };
    }

    /**
     * @description 基于关键词的简单意图匹配，优先匹配工具意图，其次匹配搜索意图
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果，未匹配到返回 null
     */
    simpleMatch(text) {
        const lower = text.toLowerCase();

        // 匹配工具意图
        for (const [key, pattern] of Object.entries(this.patterns)) {
            if (pattern.keywords.some(kw => lower.includes(kw))) {
                return {
                    type: 'intent',
                    action: pattern.action,
                    params: this._extractParams(text, pattern.action)
                };
            }
        }

        // 匹配搜索意图
        const searchPatterns = [
            { keywords: ['搜', '找', '查'], type: 'search' },
            { keywords: ['图片', '图'], type: 'image' },
            { keywords: ['视频', '看'], type: 'video' },
            { keywords: ['新闻'], type: 'news' },
            { keywords: ['音乐', '歌'], type: 'music' }
        ];

        for (const p of searchPatterns) {
            if (p.keywords.some(kw => lower.includes(kw))) {
                return {
                    type: 'search',
                    searchType: p.type,
                    query: text
                };
            }
        }

        return null;
    }

    /**
     * @description 根据动作类型从文本中提取结构化参数
     * @param {string} text - 原始文本
     * @param {string} action - 动作类型
     * @returns {Object} 提取的参数对象
     */
    _extractParams(text, action) {
        const params = { text };

        switch (action) {
            case 'calculator':
                // 提取纯数学表达式
                const expr = text.replace(/[^0-9+\-*/().]/g, '');
                if (expr) params.expression = expr;
                break;

            case 'translate':
                // 根据关键词推断翻译方向
                if (text.includes('英')) params.from = '中文', params.to = '英文';
                if (text.includes('中')) params.from = '英文', params.to = '中文';
                break;

            case 'email':
                // 简单邮箱地址提取
                const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (emailMatch) params.to = emailMatch[0];
                break;
        }

        return params;
    }

    /**
     * @description 使用 LLM 识别用户意图，适用于关键词无法覆盖的复杂表达
     * @param {string} text - 用户输入文本
     * @param {Object} llmService - LLM 服务实例
     * @returns {Promise<{type: string, action?: string, params?: Object, confidence?: number}>} LLM 识别结果
     */
    async llmRecognize(text, llmService) {
        const prompt = `分析用户输入，识别意图：

输入: "${text}"

可能的意图类型:
- weather: 查天气
- alarm: 设闹钟
- schedule: 创建日程
- reminder: 设置提醒
- translate: 翻译
- note: 记笔记
- calculator: 计算
- email: 发邮件
- search: 搜索
- unknown: 未知

请返回JSON格式：
{
  "type": "intent|search|unknown",
  "action": "具体动作",
  "params": { 相关参数 },
  "confidence": 0.0-1.0
}`;

        const response = await llmService.generateReply(prompt, '');
        const parsed = this._parseIntentResponse(response);

        return parsed;
    }

    /**
     * @description 解析 LLM 返回的意图识别结果，提取 JSON 部分
     * @param {Object} response - LLM 响应对象
     * @param {string} response.text - LLM 返回的文本
     * @returns {{type: string, action?: string, params?: Object, confidence?: number}} 解析后的意图
     */
    _parseIntentResponse(response) {
        try {
            // 从 LLM 响应中提取 JSON 部分
            const jsonMatch = response.text?.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            logger.warn('[意图识别] 解析失败');
        }

        return { type: 'unknown', action: 'unknown' };
    }
}

module.exports = new IntentRecognizer();