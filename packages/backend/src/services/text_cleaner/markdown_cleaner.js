/**
 * @file markdown_cleaner.js
 * @description Markdown清理器 - 移除Markdown格式、转换为HTML、清理显示文本
 * @module services/text_cleaner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class MarkdownCleaner {
    /**
     * @description 构造函数，初始化HTML标签分类集合
     */
    constructor() {
        // 行内标签：不会换行的HTML标签，转换时直接保留内容
        this.inlineTags = new Set(['b', 'i', 'em', 'strong', 'a', 'code', 'span', 'del']);
        // 块级标签：会换行的HTML标签，转换时需要包裹段落
        this.blockTags = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'blockquote', 'pre']);
    }

    /**
     * @description 移除Markdown格式语法，只保留纯文本内容
     * @param {string} text - 包含Markdown格式的文本
     * @returns {string} 移除Markdown语法后的纯文本
     */
    stripMarkdown(text) {
        if (!text) return text;

        let cleaned = text;

        // 标题
        cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

        // 粗体、斜体
        cleaned = cleaned.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
        cleaned = cleaned.replace(/_{1,2}([^_]+)_{1,2}/g, '$1');
        cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');

        // 链接
        cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

        // 图片
        cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

        // 行内代码
        cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

        // 水平线
        cleaned = cleaned.replace(/^[-*_]{3,}$/gm, '');

        // 引用标记
        cleaned = cleaned.replace(/^>\s*/gm, '');

        // 列表标记
        cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '');
        cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '');

        return cleaned;
    }

    /**
     * @description 将Markdown文本转换为HTML格式，支持表格、列表、标题、引用、代码块
     * @param {string} text - Markdown格式文本
     * @returns {string} 转换后的HTML字符串
     */
    markdownToHtml(text) {
        if (!text) return '';

        let result = '';
        let inTable = false;
        let tableRows = [];
        let inList = false;
        let listType = null;
        let listItems = [];

        const lines = text.split('\n');

        for (const line of lines) {
            const { element, inTable: nTable, tableRows: nRows, inList: nList, listType: nType, listItems: nItems } =
                this._closeBlocks(line, inTable, tableRows, inList, listType, listItems);

            result += element;
            inTable = nTable;
            tableRows = nRows;
            inList = nList;
            listType = nType;
            listItems = nItems;
        }

        // 关闭未完成的块
        if (inTable) {
            result += this._buildTable(tableRows);
        }
        if (inList) {
            result += this._buildList(listItems, listType);
        }

        return result;
    }

    /**
     * @description 行内Markdown转换，处理粗体、斜体、代码、链接
     * @param {string} text - 包含行内Markdown的文本
     * @returns {string} 转换后的HTML片段
     * @private
     */
    _inlineMd(text) {
        // 行内Markdown转换
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
    }

    /**
     * @description 构建HTML表格，第一行作为表头
     * @param {string[]} rows - 由'|'分隔的表格行数据
     * @returns {string} HTML表格字符串
     * @private
     */
    _buildTable(rows) {
        if (!rows || rows.length === 0) return '';

        let html = '<table class="md-table">\n';

        for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].split('|').filter(c => c.trim());
            const tag = i === 0 ? 'th' : 'td';
            html += '<tr>\n' + cells.map(c => `  <${tag}>${c.trim()}</${tag}>`).join('\n') + '\n</tr>\n';
        }

        html += '</table>\n';
        return html;
    }

    /**
     * @description 构建HTML列表（有序或无序）
     * @param {string[]} items - 列表项内容数组
     * @param {string} type - 列表类型，'ol'为有序列表，'ul'为无序列表
     * @returns {string} HTML列表字符串
     * @private
     */
    _buildList(items, type) {
        if (!items || items.length === 0) return '';

        const tag = type === 'ol' ? 'ol' : 'ul';
        return `<${tag}>\n${items.map(i => `  <li>${i}</li>`).join('\n')}\n</${tag}>\n`;
    }

    /**
     * @description 逐行处理Markdown，管理表格/列表/标题等块级元素的状态转换
     * @param {string} line - 当前处理的行
     * @param {boolean} inTable - 是否在表格块中
     * @param {string[]} tableRows - 已收集的表格行
     * @param {boolean} inList - 是否在列表块中
     * @param {string|null} listType - 列表类型（'ol'或'ul'）
     * @param {string[]} listItems - 已收集的列表项
     * @returns {{element: string, inTable: boolean, tableRows: string[], inList: boolean, listType: string|null, listItems: string[]}} 处理结果和更新后的状态
     * @private
     */
    _closeBlocks(line, inTable, tableRows, inList, listType, listItems) {
        let result = '';
        const trimmed = line.trim();

        // 表格处理
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            tableRows.push(trimmed);
            return { element: '', inTable, tableRows, inList, listType, listItems };
        } else if (inTable) {
            result += this._buildTable(tableRows);
            inTable = false;
            tableRows = [];
        }

        // 列表处理
        const listMatch = trimmed.match(/^([*-]|\d+\.)\s+(.+)/);
        if (listMatch) {
            const type = /^\d/.test(listMatch[1]) ? 'ol' : 'ul';
            if (!inList) {
                inList = true;
                listType = type;
                listItems = [];
            } else if (listType !== type) {
                result += this._buildList(listItems, listType);
                listType = type;
                listItems = [];
            }
            listItems.push(listMatch[2]);
            return { element: '', inTable, tableRows, inList, listType, listItems };
        } else if (inList) {
            result += this._buildList(listItems, listType);
            inList = false;
            listItems = [];
        }

        // 标题
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            result += `<h${level}>${this._inlineMd(headingMatch[2])}</h${level}>\n`;
            return { element: result, inTable, tableRows, inList, listType, listItems };
        }

        // 引用
        if (trimmed.startsWith('>')) {
            result += `<blockquote>${this._inlineMd(trimmed.substring(1).trim())}</blockquote>\n`;
            return { element: result, inTable, tableRows, inList, listType, listItems };
        }

        // 代码块
        if (trimmed.startsWith('```')) {
            return { element: trimmed.startsWith('```') && !trimmed.endsWith('```') ? '<pre><code>\n' : '</code></pre>\n', inTable, tableRows, inList, listType, listItems };
        }

        // 段落
        if (trimmed) {
            result += `<p>${this._inlineMd(trimmed)}</p>\n`;
        } else {
            result += '\n';
        }

        return { element: result, inTable, tableRows, inList, listType, listItems };
    }

    /**
     * @description 清理用于前端显示的文本，保留HTML链接但移除脚本和事件处理器
     * @param {string} text - 原始文本
     * @returns {string} 安全的显示文本
     */
    cleanForDisplay(text) {
        if (!text) return '';

        let cleaned = text;

        // 移除敏感信息（手机号）
        cleaned = cleaned.replace(/\d{3}[-.]?\d{3}[-.]?\d{4}/g, '***');

        // 将 Markdown 链接转换为 HTML 链接（保留 target="_blank" 在新窗口打开）
        cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_self">$1</a>');

        // 移除脚本和样式（安全防护）
        cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

        // 移除事件处理器（安全防护）
        cleaned = cleaned.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
        cleaned = cleaned.replace(/\son\w+\s*=\s*[^\s>]*/gi, '');

        // 清理残留的 Markdown 语法（如 **bold**）
        cleaned = this.stripMarkdown(cleaned);

        return cleaned;
    }

    /**
     * @description 主清洗函数，移除所有HTML标签和Markdown格式，返回纯文本
     * @param {string} text - 原始文本
     * @returns {string} 清洗后的纯文本
     */
    clean(text) {
        if (!text) return '';

        let cleaned = text;

        // 移除HTML标签
        cleaned = cleaned.replace(/<[^>]+>/g, '');

        // 移除Markdown
        cleaned = this.stripMarkdown(cleaned);

        // 移除HTML实体
        cleaned = cleaned.replace(/&[a-z]+;/gi, '');

        return cleaned.trim();
    }
}

module.exports = new MarkdownCleaner();