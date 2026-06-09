/**
 * @file html_parser.js
 * @description HTML 解析器 - 从 HTML 文件或字符串中提取纯文本内容，
 *              优先使用 cheerio 解析，不可用时回退到正则清理
 * @module services/document_pipeline/parsers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../../utils/logger');

// ============================================================
// 延迟加载 cheerio，避免未安装时报错
// ============================================================

/** cheerio 懒加载实例 */
let cheerio = null;

/**
 * @description 获取 cheerio 实例，未安装时返回 null
 * @returns {Function|null} cheerio 加载函数
 */
function getCheerio() {
    if (!cheerio) {
        try {
            cheerio = require('cheerio');
        } catch (e) {
            logger.warn('[HTML解析] cheerio 未安装');
        }
    }
    return cheerio;
}

class HtmlParser {
    /**
     * @description 解析 HTML 文件，提取纯文本内容
     * @param {string} filepath - HTML 文件路径
     * @returns {Promise<{content: string, metadata: {type: string, name: string, size: number, error?: string}}>} 解析结果
     */
    async parse(filepath) {
        try {
            const html = fs.readFileSync(filepath, 'utf-8');
            const text = this._extractText(html);

            return {
                content: text,
                metadata: {
                    type: 'html',
                    name: path.basename(filepath),
                    size: html.length
                }
            };

        } catch (error) {
            logger.error('[HTML解析] 失败:', error);
            return { content: '', metadata: { error: error.message } };
        }
    }

    /**
     * @description 解析 HTML 字符串，提取纯文本内容
     * @param {string} html - HTML 字符串
     * @returns {{content: string, metadata: {type: string, size: number}}} 解析结果
     */
    async parseString(html) {
        return {
            content: this._extractText(html),
            metadata: {
                type: 'html',
                size: html.length
            }
        };
    }

    /**
     * @description 从 HTML 中提取纯文本，优先使用 cheerio，不可用时回退到正则清理
     * @param {string} html - HTML 内容
     * @returns {string} 提取的纯文本
     */
    _extractText(html) {
        if (!html) return '';

        // 使用 cheerio 解析（更精确）
        const $ = getCheerio();
        if ($) {
            const doc = $(html);
            return doc.text().replace(/\s+/g, ' ').trim();
        }

        // 备用：正则清理，移除脚本/样式/标签
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

module.exports = new HtmlParser();