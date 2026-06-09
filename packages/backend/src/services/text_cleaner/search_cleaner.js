/**
 * @file search_cleaner.js
 * @description 搜索结果清理器 - 检测和清理原始搜索结果中的垃圾内容
 * @module services/text_cleaner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

class SearchCleaner {
    /**
     * @description 检测文本是否为原始搜索结果（包含搜索结果标记）
     * @param {string} text - 待检测文本
     * @returns {boolean} 是否为搜索结果
     */
    isSearchResult(text) {
        if (!text) return false;

        return text.includes('<p>') && (
            text.includes('个结果自适应缩放') ||
            text.includes('个结果') ||
            /约?\s*\d+[,，]?\d*\s*个结果/.test(text) ||
            (text.includes('baidu') && /<p>[^<]*<\/p>/.test(text))
        );
    }

    /**
     * @description 从搜索结果中提取有意义的内容，移除搜索结果标记和HTML标签
     * @param {string} text - 搜索结果文本
     * @returns {string} 提取出的有意义内容
     */
    extractContent(text) {
        if (!text) return '';

        // 分割搜索结果
        const parts = text.split(/约?\s*\d+[,，]?\d*\s*个结果自适应缩放/);
        const beforeSearch = parts[0];

        // 清理并提取有用文本
        const cleaned = beforeSearch
            .replace(/<[^>]+>/g, '')
            .replace(/&[a-z]+;/gi, '')
            .trim();

        if (cleaned.length > 10) {
            return cleaned;
        }

        // 备用：从整个文本中提取
        return this._extractSearchResultContent(text);
    }

    /**
     * @description 从搜索结果段落中提取有用内容，过滤垃圾段落
     * @param {string} text - 搜索结果HTML文本
     * @returns {string} 提取出的有用内容
     * @private
     */
    _extractSearchResultContent(text) {
        // 尝试提取段落内容
        const paragraphs = text.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];

        const useful = paragraphs
            .map(p => p.replace(/<[^>]+>/g, '').trim())
            .filter(t => t.length > 20 && !this._isGarbage(t));

        if (useful.length > 0) {
            return useful.join('\n\n');
        }

        // 最后手段：返回清理后的文本
        return text
            .replace(/<[^>]+>/g, '')
            .replace(/&[a-z]+;/gi, '')
            .trim();
    }

    /**
     * @description 判断文本是否为垃圾内容（过短、广告、搜索引擎标识等）
     * @param {string} text - 待判断文本
     * @returns {boolean} 是否为垃圾内容
     * @private
     */
    _isGarbage(text) {
        const garbagePatterns = [
            /^[网站公司]+$/,
            /^[广告]+$/,
            /^.{0,5}$/,
            /^(百度|必应|谷歌).*搜索/i
        ];

        return garbagePatterns.some(p => p.test(text));
    }

    /**
     * @description 检测是否为纯垃圾搜索结果（内容过短或只有噪音词）
     * @param {string} text - 待检测文本
     * @returns {boolean} 是否为纯垃圾搜索结果
     */
    isOnlySearchGarbage(text) {
        if (!text) return true;

        const cleaned = text.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, '').trim();

        // 太短
        if (cleaned.length < 50) return true;

        // 只有噪音词
        const noiseWords = ['个结果', '自适应', '缩放', 'baidu', 'search'];
        const hasNoise = noiseWords.every(w => !text.includes(w));
        if (hasNoise && cleaned.length < 200) return true;

        return false;
    }
}

module.exports = new SearchCleaner();