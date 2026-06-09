/**
 * @file llm_structurer.js
 * @description LLM 结构化器 - 使用 LLM 对新闻条目进行分类和热点提取，
 *              当 LLM 不可用时回退到简单的统计模式
 * @module services/newsService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const axios = require('axios');

// ============================================================
// 常量定义
// ============================================================

/** Kimi API 密钥 */
const KIMI_API_KEY = process.env.KIMI_API_KEY;

/** Kimi API 地址 */
const KIMI_API_URL = process.env.KIMI_API_URL || 'https://api.moonshot.cn/v1';

/** Kimi 模型名称 */
const KIMI_MODEL = process.env.KIMI_MODEL || 'deepseek-v4-pro';

/** LLM 请求超时时间（毫秒），10秒 */
const LLM_TIMEOUT = 10000;

/** 简单模式提取的高亮标题数量 */
const HIGHLIGHT_COUNT = 5;

class LlmStructurer {
    /**
     * @description 简单模式结构化 - 按来源分类统计并提取前5条高亮标题
     * @param {Array<Object>} items - 新闻条目列表
     * @param {string} query - 用户查询关键词
     * @returns {{categories: Array<{name: string, count: number}>, highlights: Array<string>}} 结构化结果
     */
    async structure(items, query) {
        if (items.length === 0) {
            return { categories: [], highlights: [] };
        }

        // 按来源分类统计
        const categoryCount = {};
        items.forEach(item => {
            const source = item.source || '其他';
            const cat = source.split('·')[1] || '其他';
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        });

        const categories = Object.entries(categoryCount).map(([name, count]) => ({ name, count }));

        // 提取高亮标题
        const highlights = items.slice(0, HIGHLIGHT_COUNT).map(item => item.title);

        return { categories, highlights };
    }

    /**
     * @description 使用 LLM 对新闻进行智能分类和热点提取，LLM 不可用时回退到简单模式
     * @param {Array<Object>} items - 新闻条目列表
     * @param {string} query - 用户查询关键词
     * @returns {Promise<{categories: Array, highlights: Array}>} 结构化结果
     */
    async structureWithLLM(items, query) {
        if (!KIMI_API_KEY) {
            return this.structure(items, query);
        }

        try {
            await axios.post(`${KIMI_API_URL}/chat/completions`, {
                model: KIMI_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个新闻分析助手。根据用户查询，将新闻分类并提取最重要的3条热点新闻。'
                    },
                    {
                        role: 'user',
                        content: `用户查询: "${query}"\n\n新闻列表:\n${items.map((i, idx) => `${idx + 1}. ${i.title}`).join('\n')}`
                    }
                ],
                temperature: 0.3
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${KIMI_API_KEY}`
                },
                timeout: LLM_TIMEOUT,
                proxy: false
            });

            // 当前版本仍使用简单模式的结果，LLM 结果暂未集成
            return this.structure(items, query);
        } catch (error) {
            console.warn('[NewsService] LLM结构化失败，使用简单模式:', error.message);
            return this.structure(items, query);
        }
    }
}

module.exports = new LlmStructurer();