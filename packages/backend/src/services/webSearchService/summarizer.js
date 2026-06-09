/**
 * @file summarizer.js
 * @description LLM 总结器 - 使用 LLM 对搜索结果进行总结，支持降级回退
 * @module services/webSearchService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { generateReply } = require('../llm_service');
const { logger } = require('../../utils/logger');

class Summarizer {
    /**
     * @description 使用 LLM 总结搜索结果
     * @param {string} query - 搜索关键词
     * @param {Array<Object>} results - 搜索结果列表
     * @param {string} type - 搜索类型（web/news）
     * @returns {Promise<string>} 总结文本
     */
    async summarize(query, results, type) {
        const contextParts = results.slice(0, 5).map((r, i) => {
            let part = `【来源${i + 1}】${r.title}\n链接: ${r.url}`;
            if (r.snippet) part += `\n摘要: ${r.snippet}`;
            if (r.content && r.content.length > 50) part += `\n正文: ${r.content}`;
            return part;
        }).join('\n\n');

        const typeInstruction = type === 'news'
            ? '这是新闻搜索结果，请按重要性整理新闻要点，每条新闻标注来源。'
            : '请整理搜索结果，提取关键信息，标注来源。';

        const prompt = `用户想了解："${query}"

${typeInstruction}

搜索结果：
${contextParts}

请用简洁自然的口语化风格总结以上内容，要求：
1. 提取最关键的信息，不要重复
2. 每个要点后面用括号标注来源编号，如(来源1)
3. 最后列出参考链接
4. 用小梦的语气说话，温柔但专业
5. 总字数控制在200字以内`;

        try {
            const response = await generateReply(prompt, prompt, null, 'normal', null, { skipWorkflow: true });
            const content = typeof response === 'object'
                ? (response.content || response.text || response.message || '')
                : String(response || '');
            return content || this.fallbackSummary(query, results);
        } catch (e) {
            logger.error('[Summarizer] LLM总结失败', { error: e.message });
            return this.fallbackSummary(query, results);
        }
    }

    /**
     * @description 降级总结 - LLM 不可用时直接拼接摘要
     * @param {string} query - 搜索关键词
     * @param {Array<Object>} results - 搜索结果列表
     * @returns {string} 降级总结文本
     */
    fallbackSummary(query, results) {
        const snippets = results.slice(0, 3).map((r, i) =>
            `${i + 1}. ${r.title}${r.snippet ? ' - ' + r.snippet.substring(0, 80) : ''}`
        ).join('\n');

        return `关于"${query}"，我搜到了这些：\n${snippets}\n\n详细内容可以点开链接看看~`;
    }
}

module.exports = new Summarizer();