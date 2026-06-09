/**
 * @file style_normalizer.js
 * @description 风格规范化器 - 将各种格式的 TTS 风格标签规范化为 MiMo TTS 支持的有效风格，
 *              支持风格别名映射、方言处理和复合风格解析
 * @module mimo_tts
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：有效风格、方言和别名映射
// ============================================================

/** MiMo TTS 支持的有效风格列表 */
const VALID_STYLES = [
    '开心', '悲伤', '生气', '惊讶', '温柔', '调皮', '俏皮', '撒娇', '悄悄话',
    '夹子音', '台湾腔', '东北话', '四川话', '河南话', '粤语', '唱歌', '变快', '变慢'
];

/** 方言风格词列表 */
const DIALECT_WORDS = ['台湾腔', '东北话', '四川话', '河南话', '粤语'];

/** 方言 ID 到方言名称的映射 */
const DIALECT_ID_MAP = {
    taiwan: '台湾腔',
    dongbei: '东北话',
    sichuan: '四川话',
    henan: '河南话',
    cantonese: '粤语'
};

/** 风格别名映射 - 将英文和常见中文别名统一映射到标准风格名 */
const STYLE_ALIASES = {
    happy: '开心',
    sad: '悲伤',
    angry: '生气',
    surprised: '惊讶',
    calm: '温柔',
    neutral: '温柔',
    tender: '温柔',
    warm: '温柔',
    playful: '调皮',
    平静: '温柔'
};

/** 复合风格中情感标签的最大数量 */
const MAX_EMOTION_TOKENS = 2;

// ============================================================
// 核心类：StyleNormalizer
// 功能说明：风格标签的规范化、验证和解析
// ============================================================

class StyleNormalizer {

    /**
     * @description 构造函数，初始化风格配置
     */
    constructor() {
        this.validStyles = VALID_STYLES;
        this.dialectWords = DIALECT_WORDS;
        this.dialectIds = DIALECT_ID_MAP;
        this.styleAliases = STYLE_ALIASES;
    }

    /**
     * @description 将输入的风格字符串规范化为有效的风格组合。
     *              支持别名映射、方言过滤和复合风格限制
     * @param {string} style - 原始风格字符串，可包含多个风格（空格/逗号分隔）
     * @param {string|null} [allowedDialect=null] - 允许的方言 ID，如 'taiwan'、'dongbei' 等
     * @returns {string|null} 规范化后的风格字符串，无效时返回 null
     */
    normalize(style, allowedDialect = null) {
        // 分词 → 别名映射 → 过滤无效风格
        const tokens = String(style || '')
            .split(/[\s,，、/|]+/)
            .map(token => this.styleAliases[token] || token)
            .filter(token => this.validStyles.includes(token));

        if (tokens.length === 0) return null;

        let uniqueTokens = [...new Set(tokens)];

        // 处理方言：如果指定了允许的方言，优先使用该方言
        const targetDialectWord = allowedDialect
            ? (this.dialectIds[allowedDialect] || null)
            : null;

        if (targetDialectWord) {
            // 方言 + 最多1个情感标签
            const emotionTokens = uniqueTokens.filter(t => !this.dialectWords.includes(t));
            const result = [targetDialectWord, ...emotionTokens.slice(0, 1)];
            return result.length > 0 ? result.join(' ') : null;
        } else {
            // 未指定方言时，过滤掉所有方言词，只保留情感标签
            uniqueTokens = uniqueTokens.filter(t => !this.dialectWords.includes(t));
            return uniqueTokens.length > 0 ? uniqueTokens.slice(0, MAX_EMOTION_TOKENS).join(' ') : null;
        }
    }

    /**
     * @description 获取所有有效的风格列表
     * @returns {string[]} 有效风格名称数组
     */
    getValidStyles() {
        return this.validStyles;
    }

    /**
     * @description 获取所有方言风格列表
     * @returns {string[]} 方言名称数组
     */
    getDialects() {
        return this.dialectWords;
    }

    /**
     * @description 获取方言 ID 到名称的映射
     * @returns {Object<string, string>} 方言 ID 映射对象
     */
    getDialectIds() {
        return this.dialectIds;
    }

    /**
     * @description 验证指定风格是否为有效风格
     * @param {string} style - 待验证的风格名称
     * @returns {boolean} 是否为有效风格
     */
    isValidStyle(style) {
        return this.validStyles.includes(style);
    }

    /**
     * @description 解析复合风格字符串，分离情感标签和方言标签
     * @param {string} style - 复合风格字符串
     * @returns {{emotions: string[], dialects: string[]}} 分离后的情感和方言列表
     */
    parseCompoundStyle(style) {
        const tokens = String(style || '').split(/[\s,，、/|]+/);
        const emotions = [];
        const dialects = [];

        for (const token of tokens) {
            const normalized = this.styleAliases[token] || token;

            if (this.dialectWords.includes(normalized)) {
                dialects.push(normalized);
            } else if (this.validStyles.includes(normalized)) {
                emotions.push(normalized);
            }
        }

        return { emotions, dialects };
    }
}

module.exports = new StyleNormalizer();