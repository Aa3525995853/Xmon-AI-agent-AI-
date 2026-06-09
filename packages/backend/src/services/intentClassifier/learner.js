/**
 * @file learner.js
 * @description 学习器 - 从成功执行的任务中学习模式，持久化存储到文件
 * @module intentClassifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');

/** 学习到的模式持久化文件路径 */
const LEARNED_PATTERNS_FILE = path.join(__dirname, '..', '..', 'data', 'learned_intent_patterns.json');

/** 学习到的模式列表 */
let learnedPatterns = [];

/**
 * @description 从文件加载学习到的模式
 */
function loadPatterns() {
    try {
        if (fs.existsSync(LEARNED_PATTERNS_FILE)) {
            learnedPatterns = JSON.parse(fs.readFileSync(LEARNED_PATTERNS_FILE, 'utf8'));
        }
    } catch (_) {
        learnedPatterns = [];
    }
}

/**
 * @description 将学习到的模式保存到文件
 */
function savePatterns() {
    try {
        const dir = path.dirname(LEARNED_PATTERNS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(LEARNED_PATTERNS_FILE, JSON.stringify(learnedPatterns, null, 2), 'utf8');
    } catch (_) {}
}

class Learner {
    constructor() {
        loadPatterns();
    }

    /**
     * @description 学习成功执行的 task 模式 - 去除通用前缀后存储核心动作
     * @param {string} input - 用户原始输入
     * @param {string} classifiedType - 分类结果类型
     */
    learn(input, classifiedType) {
        // 去除通用前缀，提取核心动作
        const cleaned = input
            .replace(/^(帮我|请帮|麻烦帮|能不能帮|可以帮)\s*/g, '')
            .trim();

        if (cleaned.length < 3 || cleaned.length > 50) return;

        // 检查是否已存在
        const exists = learnedPatterns.some(p => p.pattern === cleaned);
        if (exists) {
            learnedPatterns.forEach(p => {
                if (p.pattern === cleaned) p.count++;
            });
        } else {
            learnedPatterns.push({
                pattern: cleaned,
                type: classifiedType,
                count: 1,
                lastUsed: Date.now()
            });
        }

        // 保留最近 50 个模式
        if (learnedPatterns.length > 50) {
            learnedPatterns.sort((a, b) => b.count - a.count);
            learnedPatterns = learnedPatterns.slice(0, 50);
        }

        savePatterns();
        logger.debug(`[Learner] 学习新模式: "${cleaned}" → ${classifiedType}`);
    }

    /**
     * @description 使用学习到的模式分类文本 - 匹配包含关系的最佳模式
     * @param {string} text - 待分类文本
     * @returns {Object|null} 最佳匹配模式 { pattern, type, count, lastUsed }
     */
    classify(text) {
        if (learnedPatterns.length === 0) {
            loadPatterns();
        }

        const lowerText = text.toLowerCase();
        let bestMatch = null;

        for (const p of learnedPatterns) {
            const patternLower = p.pattern.toLowerCase();
            if (lowerText.includes(patternLower) || patternLower.includes(lowerText)) {
                if (!bestMatch || p.count > bestMatch.count) {
                    bestMatch = p;
                }
            }
        }

        return bestMatch;
    }
}

module.exports = new Learner();