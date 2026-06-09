/**
 * @file index.js
 * @description TextCleaner 主入口 - 文本清洗拦截器，解决TTS"读标签"问题，过滤动作标签只保留风格标签
 * @module services/text_cleaner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 架构：
 * ┌──────────────────────────────────────────┐
 * │            TextCleaner                    │
 * │  主入口 + 流程编排 + 选项处理              │
 * └──────────────────────────────────────────┘
 *                    ↓
 *           ┌───────────────────────┐
 *           │     子模块拆分         │
 *           ├───────────────────────┤
 *           │ tag_cleaner.js      │ ← 标签清理
 *           │ markdown_cleaner.js  │ ← Markdown处理
 *           │ search_cleaner.js    │ ← 搜索结果处理
 *           │ speech_processor.js  │ ← 语音处理
 *           └───────────────────────┘
 */

const { logger } = require('../../utils/logger');
const TagCleaner = require('./tag_cleaner');
const MarkdownCleaner = require('./markdown_cleaner');
const SearchCleaner = require('./search_cleaner');
const SpeechProcessor = require('./speech_processor');

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

class TextCleaner {
    /**
     * @description 构造函数，初始化各子模块引用
     */
    constructor() {
        this.tagCleaner = TagCleaner;
        this.markdownCleaner = MarkdownCleaner;
        this.searchCleaner = SearchCleaner;
        this.speechProcessor = SpeechProcessor;
    }

    /**
     * @description 主清洗函数，按管线顺序依次处理文本
     * @param {string} text - 原始文本（LLM输出）
     * @returns {string} 清洗后的文本
     */
    clean(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        let cleaned = text;

        // 1. 搜索结果检测与处理
        if (this.searchCleaner.isSearchResult(cleaned)) {
            logger.warn('[文本清洗] 检测到原始搜索结果，尝试提取有意义内容');
            cleaned = this.searchCleaner.extractContent(cleaned);
        }

        // 2. 清理敏感信息
        cleaned = this.tagCleaner.removeSensitiveInfo(cleaned);

        // 3. 删除动作标签（防止TTS朗读）
        cleaned = this.tagCleaner.removeAllActionTags(cleaned);

        // 4. 删除Markdown语法
        cleaned = this.markdownCleaner.clean(cleaned);

        // 5. 清理空白字符
        cleaned = this.tagCleaner.cleanWhitespace(cleaned);

        // 6. 删除Emoji
        cleaned = this.tagCleaner.removeEmojis(cleaned);

        // 7. 移除游离的情绪词
        cleaned = this.tagCleaner.detectAndMoveEmotionWord(cleaned);

        // 8. 确保风格标签在开头
        cleaned = this.tagCleaner.ensureStyleAtBeginning(cleaned);

        return cleaned;
    }

    /**
     * @description 清理用于显示的文本，保留Markdown格式但移除敏感信息
     * @param {string} text - 原始文本
     * @returns {string} 适合前端显示的文本
     */
    cleanForDisplay(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        let cleaned = text;

        // 移除敏感信息
        cleaned = this.tagCleaner.removeSensitiveInfo(cleaned);

        // 保留Markdown用于显示
        cleaned = this.markdownCleaner.cleanForDisplay(cleaned);

        // 清理空白
        cleaned = this.tagCleaner.cleanWhitespace(cleaned);

        return cleaned;
    }

    /**
     * @description 清理用于TTS的文本，进行口语化处理使朗读更自然
     * @param {string} text - 原始文本
     * @param {string} [emotion='neutral'] - 情感标签，用于决定是否添加填充词
     * @returns {string} 适合TTS朗读的口语化文本
     */
    cleanForTTS(text, emotion = 'neutral') {
        if (!text || typeof text !== 'string') {
            return '';
        }

        let cleaned = text;

        // 保留风格标签供TTS使用
        cleaned = this.tagCleaner.removeCssCode(cleaned);
        cleaned = this.tagCleaner.removeCodeBlocks(cleaned);
        cleaned = this.tagCleaner.cleanWhitespace(cleaned);

        // 口语化处理
        cleaned = this.speechProcessor.oralize(cleaned);
        cleaned = this.speechProcessor.shortenSentences(cleaned);

        // 添加填充词（可选）
        if (emotion === 'neutral') {
            cleaned = this.speechProcessor.addFillers(cleaned, emotion);
        }

        return cleaned;
    }

    /**
     * @description 提取并规范化风格标签，将风格标签从文本中分离
     * @param {string} text - 包含风格标签的文本
     * @returns {{text: string, style: string|null}} 分离后的文本和风格标签
     */
    extractAndNormalizeStyle(text) {
        return this.tagCleaner.extractAndNormalizeStyle(text);
    }

    /**
     * @description 统一处理入口，根据选项选择不同的清洗策略
     * @param {string} text - 原始文本
     * @param {Object} [options={}] - 处理选项
     * @param {boolean} [options.forDisplay=false] - 是否用于前端显示
     * @param {boolean} [options.forTTS=false] - 是否用于TTS朗读
     * @param {boolean} [options.preserveMarkdown=false] - 是否保留Markdown格式
     * @param {string} [options.emotion='neutral'] - 情感标签
     * @returns {string} 处理后的文本
     */
    process(text, options = {}) {
        const {
            forDisplay = false,
            forTTS = false,
            preserveMarkdown = false,
            emotion = 'neutral'
        } = options;

        if (forTTS) {
            return this.cleanForTTS(text, emotion);
        }

        if (forDisplay) {
            return this.cleanForDisplay(text);
        }

        return this.clean(text);
    }
}

module.exports = new TextCleaner();