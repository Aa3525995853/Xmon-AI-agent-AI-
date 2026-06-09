/**
 * @file tag_cleaner.js
 * @description 标签清理器 - 清理HTML标签、动作标签、代码块、敏感信息等
 * @module services/text_cleaner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义：风格标签白名单
// 说明：只有这些风格标签会被保留，供TTS引擎识别情感语调
// ============================================================
const ALLOWED_STYLES = [
    '开心', '悲伤', '生气', '惊讶',
    '调皮', '温柔', '俏皮', '撒娇',
    '悄悄话', '夹子音', '台湾腔',
    '东北话', '四川话', '河南话', '粤语',
    '唱歌', '变快', '变慢', '平静'
];

// ============================================================
// 常量定义：需要删除的动作标签
// 说明：这些动作标签会被TTS引擎朗读出来，必须移除
// ============================================================
const ACTION_TAGS_TO_REMOVE = [
    '轻笑', '大笑', '微笑',
    '叹气', '深呼吸', '喘气',
    '小声', '大声', '提高音量',
    '思考', '停顿', '沉默片刻',
    '紧张', '放松', '疲惫',
    '咳嗽', '清嗓子',
    '难过', '温柔地', '轻声', '有气无力',
    '语速加快', '语速变慢'
];

// ============================================================
// 常量定义：情绪/语气标签列表
// 说明：这些情绪词在括号内出现时需要移除，防止TTS朗读
// ============================================================
const EMOTION_TAGS_TO_REMOVE = [
    '平静', '温柔', '轻声', '轻声地', '温柔地', '慵懒', '懒洋洋',
    '开心', '悲伤', '生气', '惊讶', '调皮', '俏皮', '撒娇',
    '悄悄话', '夹子音', '台湾腔', '东北话', '四川话', '河南话', '粤语',
    '唱歌', '变快', '变慢', '难过', '有气无力',
    '语速加快', '语速变慢', '提高音量', '小声', '大声',
    '轻笑', '大笑', '微笑', '叹气', '深呼吸', '喘气',
    '思考', '停顿', '沉默片刻', '紧张', '放松', '疲惫',
    '咳嗽', '清嗓子'
];

class TagCleaner {
    /**
     * @description 检测并删除游离的情绪词（不在<style>标签内的情绪词）
     * @param {string} text - 待处理文本
     * @returns {string} 移除游离情绪词后的文本
     */
    detectAndMoveEmotionWord(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        let cleaned = text;

        for (const emotion of ALLOWED_STYLES) {
            const beginPattern = new RegExp(`^${emotion}[\\s，。！？、]*`, 'i');
            cleaned = cleaned.replace(beginPattern, '');
        }

        // 规范化空白
        cleaned = cleaned.replace(/[^\S\n]+/g, ' ').trim();

        return cleaned;
    }

    /**
     * @description 移除<style>xxx</style>风格标签
     * @param {string} text - 待处理文本
     * @returns {string} 移除风格标签后的文本
     */
    removeStyleTags(text) {
        if (!text) return '';

        // 移除 <style>xxx</style>
        return text.replace(/<style>.*?<\/style>/gi, '').trim();
    }

    /**
     * @description 移除CSS相关代码，包括<style>块、class和style属性
     * @param {string} text - 待处理文本
     * @returns {string} 移除CSS后的文本
     */
    removeCssCode(text) {
        if (!text) return '';

        let cleaned = text;

        // 移除 <style>...</style>
        cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

        // 移除 class="..."
        cleaned = cleaned.replace(/class="[^"]*"/gi, '');

        // 移除 style="..."
        cleaned = cleaned.replace(/style="[^"]*"/gi, '');

        return cleaned;
    }

    /**
     * @description 移除成对的大括号及其内容（用于清理CSS/JSON代码块）
     * @param {string} text - 待处理文本
     * @param {string} [openPattern='{'] - 左括号字符
     * @returns {string} 移除大括号内容后的文本
     */
    removeBalancedBraces(text, openPattern = '{') {
        if (!text) return '';

        let result = '';
        let depth = 0;

        for (const char of text) {
            if (char === openPattern) {
                depth++;
            } else if (char === '}') {
                if (depth > 0) depth--;
            } else if (depth === 0) {
                result += char;
            }
        }

        return result;
    }

    /**
     * @description 移除所有HTML标签
     * @param {string} text - 待处理文本
     * @returns {string} 移除HTML标签后的纯文本
     */
    removeHtmlTags(text) {
        if (!text) return '';
        return text.replace(/<[^>]*>/g, '').trim();
    }

    /**
     * @description 移除HTML标签但保留<style>标签（TTS需要风格标签）
     * @param {string} text - 待处理文本
     * @returns {string} 保留风格标签的文本
     */
    removeHtmlTagsExceptStyle(text) {
        if (!text) return '';

        // 先移除 <style>...</style> 并保存
        const styles = [];
        let cleaned = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (match) => {
            styles.push(match);
            return `__STYLE_PLACEHOLDER_${styles.length - 1}__`;
        });

        // 移除其他HTML标签
        cleaned = cleaned.replace(/<[^>]+>/g, '');

        // 恢复 style 标签
        styles.forEach((style, i) => {
            cleaned = cleaned.replace(`__STYLE_PLACEHOLDER_${i}__`, style);
        });

        return cleaned.trim();
    }

    /**
     * @description 移除代码块（三反引号和单反引号包裹的内容）
     * @param {string} text - 待处理文本
     * @returns {string} 移除代码块后的文本
     */
    removeCodeBlocks(text) {
        if (!text) return '';

        // 移除 ```...```
        let cleaned = text.replace(/```[\s\S]*?```/g, '');

        // 移除 `...`
        cleaned = cleaned.replace(/`[^`]+`/g, '');

        return cleaned;
    }

    /**
     * @description 格式化代码块为HTML，支持语法高亮标记
     * @param {string} text - 包含Markdown代码块的文本
     * @returns {string} 格式化后的HTML文本
     */
    formatCodeBlocks(text) {
        if (!text) return '';

        const codeBlockPattern = /```(\w+)?\n?([\s\S]*?)```/g;
        return text.replace(codeBlockPattern, (match, language, code) => {
            return this._formatCode(code.trim(), language || 'text');
        });
    }

    /**
     * @description 根据语言类型格式化代码，Python和JS有特殊缩进处理
     * @param {string} code - 代码内容
     * @param {string} language - 编程语言标识
     * @returns {string} 格式化后的HTML代码块
     * @private
     */
    _formatCode(code, language) {
        const languageMap = {
            'javascript': 'javascript',
            'js': 'javascript',
            'typescript': 'typescript',
            'ts': 'typescript',
            'python': 'python',
            'py': 'python',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'bash': 'bash',
            'shell': 'bash',
            'sql': 'sql'
        };

        const lang = languageMap[language] || 'text';
        const lines = code.split('\n');

        if (lang === 'python') {
            return this._formatPythonCode(lines);
        } else if (lang === 'javascript' || lang === 'typescript') {
            return this._formatJSCode(lines);
        }

        return `<pre><code class="language-${lang}">${code}</code></pre>`;
    }

    /**
     * @description 格式化Python代码，根据关键字自动调整缩进
     * @param {string[]} lines - Python代码行数组
     * @returns {string} 格式化后的HTML代码块
     * @private
     */
    _formatPythonCode(lines) {
        const formatted = [];
        let indent = 0;
        const indentSize = 4;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('def ') || trimmed.startsWith('class ') ||
                trimmed.startsWith('if ') || trimmed.startsWith('elif ') ||
                trimmed.startsWith('else:') || trimmed.startsWith('for ') ||
                trimmed.startsWith('while ') || trimmed.startsWith('try:') ||
                trimmed.startsWith('except') || trimmed.startsWith('with ')) {
                formatted.push(' '.repeat(indent) + trimmed);
                indent += indentSize;
            } else if (trimmed === 'pass' || trimmed === 'continue' || trimmed === 'break') {
                indent = Math.max(0, indent - indentSize);
                formatted.push(' '.repeat(indent) + trimmed);
            } else if (trimmed.startsWith('return ') || trimmed.startsWith('raise ') || trimmed.startsWith('break') || trimmed.startsWith('continue')) {
                indent = Math.max(0, indent - indentSize);
                formatted.push(' '.repeat(indent) + trimmed);
                indent += indentSize;
            } else if (trimmed.startsWith('#')) {
                formatted.push(' '.repeat(indent) + `<span class="comment">${trimmed}</span>`);
            } else {
                formatted.push(' '.repeat(indent) + trimmed);
            }
        }

        return `<pre class="python"><code>${formatted.join('\n')}</code></pre>`;
    }

    /**
     * @description 格式化JavaScript/TypeScript代码，处理行注释和块注释高亮
     * @param {string[]} lines - JS代码行数组
     * @returns {string} 格式化后的HTML代码块
     * @private
     */
    _formatJSCode(lines) {
        const formatted = [];
        let inBlockComment = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('//')) {
                formatted.push(`<span class="comment">${trimmed}</span>`);
            } else if (trimmed.startsWith('/*')) {
                inBlockComment = true;
                formatted.push(`<span class="comment">${trimmed}`);
            } else if (inBlockComment) {
                if (trimmed.endsWith('*/')) {
                    inBlockComment = false;
                    formatted[formatted.length - 1] += ' ' + trimmed + '</span>';
                } else {
                    formatted[formatted.length - 1] += ' ' + trimmed;
                }
            } else {
                formatted.push(trimmed);
            }
        }

        return `<pre class="javascript"><code>${formatted.join('\n')}</code></pre>`;
    }

    /**
     * @description 提取并规范化风格标签，将<style>标签从文本中分离
     * @param {string} text - 包含风格标签的文本
     * @returns {{text: string, style: string|null}} 分离后的文本和风格标签值
     */
    extractAndNormalizeStyle(text) {
        if (!text) return { text: '', style: null };

        const styleMatch = text.match(/<style>([^<]+)<\/style>/);
        const style = styleMatch ? styleMatch[1] : null;
        const cleaned = text.replace(/<style>.*?<\/style>/gi, '').trim();

        return { text: cleaned, style };
    }

    /**
     * @description 移除所有Emoji表情符号，包括Unicode表情和中文标点表情
     * @param {string} text - 待处理文本
     * @returns {string} 移除Emoji后的文本
     */
    removeEmojis(text) {
        if (!text) return '';

        // Unicode 表情范围
        const emojiRanges = [
            /[\u{1F600}-\u{1F64F}]/gu,  // 表情符号
            /[\u{1F300}-\u{1F5FF}]/gu,  // 符号和图片
            /[\u{1F680}-\u{1F6FF}]/gu,  // 交通和地图符号
            /[\u{1F1E0}-\u{1F1FF}]/gu,  // 国旗
            /[\u{2600}-\u{26FF}]/gu,    // 杂项符号
            /[\u{2700}-\u{27BF}]/gu,    // 装饰符号
            /[\u{1F900}-\u{1F9FF}]/gu,  // 补充符号
            /[\u{1FA00}-\u{1FA6F}]/gu,  // 棋类符号
            /[\u{1FA70}-\u{1FAFF}]/gu,  // 符号和表情
        ];

        let cleaned = text;
        for (const range of emojiRanges) {
            cleaned = cleaned.replace(range, '');
        }

        // 中文标点表情
        cleaned = cleaned.replace(/[⊙◉◈◐◑◒◓]/g, '');

        return cleaned.trim();
    }

    /**
     * @description 移除所有动作标签（核心功能 - 防止TTS朗读动作描写）
     * @param {string} text - 待处理文本
     * @returns {string} 移除动作标签后的文本
     */
    removeAllActionTags(text) {
        if (!text) return '';

        let cleaned = text;

        // 移除 <style>xxx</style>
        cleaned = cleaned.replace(/<style>.*?<\/style>/gi, '');

        // 移除动作标签
        for (const tag of ACTION_TAGS_TO_REMOVE) {
            // 括号内的动作描写
            cleaned = cleaned.replace(new RegExp(`（[^）]*${tag}[^）]*）`, 'g'), '');
        }

        // 移除情绪词
        for (const tag of EMOTION_TAGS_TO_REMOVE) {
            cleaned = cleaned.replace(new RegExp(`（[^）]*${tag}[^）]*）`, 'g'), '');
        }

        return cleaned.trim();
    }

    /**
     * @description 清理空白字符，统一换行符、压缩连续空行
     * @param {string} text - 待处理文本
     * @returns {string} 清理空白后的文本
     */
    cleanWhitespace(text) {
        if (!text) return '';

        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * @description 确保风格标签位于文本开头，便于TTS引擎优先识别
     * @param {string} text - 待处理文本
     * @returns {string} 风格标签在开头的文本
     */
    ensureStyleAtBeginning(text) {
        if (!text) return '';

        const styleMatch = text.match(/<style>([^<]+)<\/style>/);
        if (!styleMatch) return text;

        const style = styleMatch[0];
        const content = text.replace(style, '').trim();

        return style + content;
    }

    /**
     * @description 检测文本中是否包含敏感信息（电话、邮箱、日期等）
     * @param {string} text - 待检测文本
     * @returns {boolean} 是否包含敏感信息
     */
    containsSensitiveInfo(text) {
        if (!text) return false;

        const patterns = [
            /\d{3}[-.]?\d{3}[-.]?\d{4}/,  // 电话号码
            /\d{11}/,                        // 11位数字（手机号）
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,  // 邮箱
            /\d{4}[-/]\d{1,2}[-/]\d{1,2}/,   // 日期
        ];

        return patterns.some(p => p.test(text));
    }

    /**
     * @description 移除敏感信息，将手机号和邮箱替换为星号
     * @param {string} text - 待处理文本
     * @returns {string} 脱敏后的文本
     */
    removeSensitiveInfo(text) {
        if (!text) return '';

        let cleaned = text;

        // 手机号
        cleaned = cleaned.replace(/\d{3}[-.]?\d{3}[-.]?\d{4}/g, '***');

        // 邮箱
        cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '***');

        return cleaned;
    }
}

module.exports = new TagCleaner();