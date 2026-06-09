/**
 * @file result_processor.js
 * @description 搜索结果处理器 - 对搜索结果进行去重、排序、格式化和摘要生成，
 *              使用 Jaccard 和余弦相似度算法进行去重和相关性评分
 * @module services/enhancedSearch
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：相似度阈值与评分权重
// ============================================================

/** 去重相似度阈值，超过此值视为重复结果 */
const DEDUP_THRESHOLD = 0.8;

/** 基础相关性得分 */
const BASE_SCORE = 0.5;

/** 标题包含关键词时的加分 */
const TITLE_MATCH_BONUS = 0.2;

/** 摘要包含关键词时的加分 */
const SNIPPET_MATCH_BONUS = 0.1;

/** 标题与查询词余弦相似度的权重 */
const COSINE_WEIGHT = 0.2;

/** 摘要生成时取前 N 条结果 */
const SUMMARY_TOP_N = 5;

/** URL 截断显示长度 */
const URL_DISPLAY_LENGTH = 30;

// ============================================================
// 相似度计算函数
// ============================================================

/**
 * @description 计算两个字符串的余弦相似度，基于词集合的交集比例
 * @param {string} str1 - 第一个字符串
 * @param {string} str2 - 第二个字符串
 * @returns {number} 相似度值 [0, 1]
 */
function cosineSimilarity(str1, str2) {
    const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 1));
    const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 1));

    const intersection = [...words1].filter(w => words2.has(w));
    if (words1.size === 0 || words2.size === 0) return 0;
    return intersection.length / Math.sqrt(words1.size * words2.size);
}

/**
 * @description 计算两个字符串的 Jaccard 相似度，交集与并集的比例
 * @param {string} str1 - 第一个字符串
 * @param {string} str2 - 第二个字符串
 * @returns {number} 相似度值 [0, 1]
 */
function jaccardSimilarity(str1, str2) {
    const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 1));
    const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 1));

    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);
    if (union.size === 0) return 0;
    return intersection.length / union.size;
}

// ============================================================
// ResultProcessor 类：搜索结果处理核心逻辑
// ============================================================

class ResultProcessor {
    constructor() {
        this.dedupThreshold = DEDUP_THRESHOLD;
    }

    /**
     * @description 处理搜索结果，依次执行去重→排序→格式化
     * @param {Object} results - 原始搜索结果
     * @param {string} query - 搜索关键词
     * @returns {Object} 处理后的搜索结果
     */
    process(results, query) {
        if (!results.success) return results;

        // 去重
        const deduped = this._deduplicate(results.results || []);

        // 排序
        const ranked = this._rank(deduped, query);

        // 格式化
        const formatted = this._format(ranked);

        return {
            success: true,
            query: results.query,
            results: formatted,
            total: formatted.length,
            engine: results.engine
        };
    }

    /**
     * @description 基于 Jaccard 相似度对搜索结果去重，标题或摘要超过阈值视为重复
     * @param {Array<Object>} results - 搜索结果数组
     * @returns {Array<Object>} 去重后的结果数组
     */
    _deduplicate(results) {
        const unique = [];

        for (const result of results) {
            const isDuplicate = unique.some(existing =>
                jaccardSimilarity(existing.title, result.title) > this.dedupThreshold ||
                jaccardSimilarity(existing.snippet, result.snippet) > this.dedupThreshold
            );

            if (!isDuplicate) {
                unique.push(result);
            }
        }

        return unique;
    }

    /**
     * @description 根据与查询词的相关性对结果排序
     * @param {Array<Object>} results - 搜索结果数组
     * @param {string} query - 搜索关键词
     * @returns {Array<Object>} 按得分降序排列的结果
     */
    _rank(results, query) {
        return results.map(r => ({
            ...r,
            score: this._calculateScore(r, query)
        })).sort((a, b) => b.score - a.score);
    }

    /**
     * @description 计算单条结果与查询词的相关性得分，综合标题匹配、摘要匹配和余弦相似度
     * @param {Object} result - 单条搜索结果
     * @param {string} query - 搜索关键词
     * @returns {number} 相关性得分 [0, 1]
     */
    _calculateScore(result, query) {
        let score = BASE_SCORE;

        // 标题包含关键词
        if (result.title.includes(query)) score += TITLE_MATCH_BONUS;

        // 摘要包含关键词
        if (result.snippet.includes(query)) score += SNIPPET_MATCH_BONUS;

        // 标题与查询词的余弦相似度
        score += cosineSimilarity(result.title, query) * COSINE_WEIGHT;

        return Math.min(score, 1);
    }

    /**
     * @description 格式化搜索结果，添加序号和域名显示
     * @param {Array<Object>} results - 排序后的搜索结果
     * @returns {Array<Object>} 格式化后的结果
     */
    _format(results) {
        return results.map((r, i) => ({
            ...r,
            index: i + 1,
            domain: this._extractDomain(r.url),
            displayUrl: this._extractDomain(r.url)
        }));
    }

    /**
     * @description 从 URL 中提取域名，解析失败时截断显示
     * @param {string} url - 完整 URL
     * @returns {string} 域名或截断后的 URL
     */
    _extractDomain(url) {
        try {
            const u = new URL(url);
            return u.hostname.replace('www.', '');
        } catch {
            return url.substring(0, URL_DISPLAY_LENGTH);
        }
    }

    /**
     * @description 使用 LLM 为搜索结果生成摘要，取前 N 条结果作为上下文
     * @param {Object} results - 搜索结果对象
     * @param {string} query - 搜索关键词
     * @param {Object|null} llmService - LLM 服务实例
     * @returns {Promise<Object>} 包含摘要的搜索结果
     */
    async generateSummary(results, query, llmService) {
        if (!llmService || !llmService.generateReply) {
            return results;
        }

        try {
            const content = results.results?.slice(0, SUMMARY_TOP_N)
                .map(r => `标题: ${r.title}\n内容: ${r.snippet}`)
                .join('\n\n');

            const prompt = `基于以下搜索结果，生成一个简洁的摘要：

搜索词: ${query}

搜索结果:
${content}

请用2-3句话总结这些搜索结果的主要内容。`;

            const response = await llmService.generateReply(prompt, '');

            return {
                ...results,
                summary: response.text || response
            };

        } catch (error) {
            logger.error('[结果处理] 生成摘要失败:', error);
            return results;
        }
    }
}

module.exports = new ResultProcessor();