/**
 * @file index.js
 * @description WebSearchService 主入口 - 静默搜索服务，搜索→抓取→总结一站式完成
 * @module services/webSearchService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 工作流：
 * 1. 搜索引擎获取结果列表
 * 2. 提取 Top N 结果的标题、摘要、链接
 * 3. 对关键结果抓取正文
 * 4. 交给 LLM 总结，返回摘要 + 来源链接
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块 - 避免循环依赖
// ============================================================
let _searchEngines = null;
let _pageFetch = null;
let _resultAnalyzer = null;
let _summarizer = null;

function getSearchEngines() {
    if (!_searchEngines) _searchEngines = require('./search_engines');
    return _searchEngines;
}

function getPageFetch() {
    if (!_pageFetch) _pageFetch = require('./page_fetch');
    return _pageFetch;
}

function getResultAnalyzer() {
    if (!_resultAnalyzer) _resultAnalyzer = require('./result_analyzer');
    return _resultAnalyzer;
}

function getSummarizer() {
    if (!_summarizer) _summarizer = require('./summarizer');
    return _summarizer;
}

class WebSearchService {
    constructor() {
        this.searchEngines = getSearchEngines();
        this.pageFetch = getPageFetch();
        this.resultAnalyzer = getResultAnalyzer();
        this.summarizer = getSummarizer();

        logger.info('[WebSearch] 静默搜索服务初始化完成');
    }

    /**
     * @description 搜索并总结 - 完整的搜索流程：搜索→过滤→抓取→评估→总结
     * @param {string} query - 搜索关键词
     * @param {string} type - 搜索类型（web/news）
     * @returns {Promise<Object>} 搜索结果，包含 success、message、results
     */
    async searchAndSummarize(query, type = 'web') {
        logger.info(`[静默搜索] 开始搜索: "${query}" (类型: ${type})`);

        let searchResults = await this.searchEngines.search(query, type);

        if (!searchResults || searchResults.length === 0) {
            return {
                success: false,
                message: `没搜到关于"${query}"的内容呢~你可以换个方式问我试试~`,
                results: []
            };
        }

        // 过滤不相关结果
        searchResults = this.resultAnalyzer.filterRelevant(searchResults);
        searchResults = this.resultAnalyzer.filterByQuery(searchResults, query);
        if (searchResults.length < 2) {
            return {
                success: false,
                message: `没搜到关于"${query}"的内容呢~你可以换个方式问我试试~`,
                results: []
            };
        }

        // 抓取正文
        const enrichedResults = await this.pageFetch.enrichResults(searchResults);

        // 评估结果质量
        const hasUsefulContent = this.resultAnalyzer.evaluateQuality(enrichedResults);
        if (!hasUsefulContent) {
            return this.resultAnalyzer.generateFallback(query, type, searchResults);
        }

        // LLM 总结
        const summary = await this.summarizer.summarize(query, enrichedResults, type);

        return {
            success: true,
            message: summary,
            results: enrichedResults.slice(0, 5).map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet
            }))
        };
    }
}

const instance = new WebSearchService();
module.exports = instance;