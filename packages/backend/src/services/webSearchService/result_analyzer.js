/**
 * @file result_analyzer.js
 * @description 结果分析器 - 过滤不相关结果、评估质量、生成降级提示
 * @module services/webSearchService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

/** 排除的域名列表 - 这些域名的结果通常不实用 */
const EXCLUDED_DOMAINS = [
    'shanghai.gov.cn', 'baike.baidu.com', 'zh.wikipedia.org',
    'en.wikipedia.org', 'wiktionary.org', 'eastday.com',
    'cmp.whlyj.sh.gov.cn', 'gov.cn'
];

/** 有用关键词列表 - 包含这些词的结果更有价值 */
const USEFUL_KEYWORDS = ['价格', '航班', '机票', '酒店', '餐厅', '天气', '教程', '指南', '推荐', '怎么样', '如何', '方法'];

class ResultAnalyzer {
    /**
     * @description 过滤不相关结果 - 排除黑名单域名的搜索结果
     * @param {Array<Object>} results - 搜索结果列表
     * @returns {Array<Object>} 过滤后的结果列表
     */
    filterRelevant(results) {
        return results.filter(r => {
            const url = r.url.toLowerCase();
            for (const domain of EXCLUDED_DOMAINS) {
                if (url.includes(domain)) return false;
            }
            return true;
        });
    }

    /**
     * @description 按用户查询词过滤和排序，避免泛新闻门户冒充具体主题结果。
     * @param {Array<Object>} results - 搜索结果列表
     * @param {string} query - 用户查询词
     * @returns {Array<Object>} 与查询词相关的结果列表
     */
    filterByQuery(results, query) {
        const keywords = String(query || '')
            .toLowerCase()
            .split(/[\s,，、]+/)
            .map(k => k.trim())
            .filter(k => k && !['新闻', '最新', '资讯', '消息'].includes(k));

        if (keywords.length === 0) return results;

        return results
            .map(result => {
                const haystack = `${result.title || ''} ${result.snippet || ''} ${result.url || ''}`.toLowerCase();
                const score = keywords.reduce((total, keyword) => {
                    return total + (haystack.includes(keyword) ? 1 : 0);
                }, 0);
                return { ...result, relevanceScore: score };
            })
            .filter(result => result.relevanceScore > 0)
            .sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * @description 评估结果质量 - 检查是否有足够的有用内容
     * @param {Array<Object>} results - 搜索结果列表
     * @returns {boolean} 质量是否达标
     */
    evaluateQuality(results) {
        if (!results || results.length === 0) return false;

        let usefulCount = 0;
        for (const r of results) {
            const snippet = r.snippet || '';
            const content = r.content || '';

            if (snippet.length > 30 || content.length > 100) {
                const hasUsefulKeyword = USEFUL_KEYWORDS.some(k =>
                    snippet.includes(k) || content.includes(k)
                );
                const isExcluded = EXCLUDED_DOMAINS.some(d => r.url.includes(d));

                if (hasUsefulKeyword && !isExcluded) {
                    usefulCount++;
                }
            }
        }

        return usefulCount >= 2;
    }

    /**
     * @description 生成友好降级提示 - 当搜索质量不达标时，根据查询类型给出建议
     * @param {string} query - 搜索关键词
     * @param {string} type - 搜索类型
     * @param {Array<Object>} results - 原始搜索结果
     * @returns {Object} 降级提示，包含 success:false、message、degraded:true
     */
    generateFallback(query, type, results) {
        const queryLower = query.toLowerCase();

        // 机票相关
        if (queryLower.includes('机票') || queryLower.includes('航班') || queryLower.includes('飞机')) {
            return {
                success: false,
                message: `搜索结果质量不达标，建议您直接去以下平台查询：

• **携程** https://flights.ctrip.com — 国内机票最全
• **飞猪** https://www.fliggy.com — 经常有优惠
• **去哪儿** https://www.qunar.com — 价格对比方便

告诉我您想哪天出发、从哪个机场出发，我可以帮您搜索更具体的信息哦！`,
                results: results.slice(0, 3).map(r => ({ title: r.title, url: r.url, snippet: r.snippet })),
                degraded: true
            };
        }

        // 酒店相关
        if (queryLower.includes('酒店') || queryLower.includes('住宿') || queryLower.includes('民宿')) {
            return {
                success: false,
                message: `搜索结果质量不达标，建议您去以下平台查看：

• **携程酒店** https://hotels.ctrip.com
• **美团酒店** https://hotel.meituan.com
• **去哪儿酒店** https://hotel.qunar.com

告诉我您的目的地和预算，我可以帮您推荐哦！`,
                results: results.slice(0, 3).map(r => ({ title: r.title, url: r.url, snippet: r.snippet })),
                degraded: true
            };
        }

        // 新闻相关
        if (queryLower.includes('新闻') || queryLower.includes('最新')) {
            return {
                success: false,
                message: `搜索结果质量不达标，没有搜到相关新闻。建议您换个关键词试试，比如具体的人名、地名或事件。`,
                results: [],
                degraded: true
            };
        }

        // 默认提示
        return {
            success: false,
            message: `搜索结果质量不达标，没有找到特别有用的信息。建议您换个问法，或者告诉我更多细节，我再帮您查查？`,
            results: results.slice(0, 3).map(r => ({ title: r.title, url: r.url, snippet: r.snippet })),
            degraded: true
        };
    }
}

module.exports = new ResultAnalyzer();