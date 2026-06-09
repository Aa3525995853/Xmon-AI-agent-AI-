/**
 * @file skill_learner.js
 * @description 学习进化服务，记录用户指令、提取语义等价的简化版本、
 *              持久化存储学习模式，并在下次用户输入时优先匹配已学习的模式
 * @module services/skill_learner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心功能：
 * 1. 记录用户下达的指令（成功执行后）
 * 2. 提取语义等价的简化版本
 * 3. 持久化存储到 learned_patterns.json
 * 4. 下次用户说类似的，优先匹配学习到的模式
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 模块名称：SkillLearner 学习进化类
// 功能说明：用户意图学习与模式进化，支持精确匹配和模糊匹配
// ============================================================

/** 模糊匹配的最低相似度阈值，低于此值不认为匹配成功 */
const FUZZY_MATCH_THRESHOLD = 0.5;

/** 变体最小长度要求，避免过短的输入产生误匹配 */
const MIN_VARIANT_LENGTH = 2;

class SkillLearner {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data', 'skill_learning');
        this.patternFile = path.join(this.dataDir, 'learned_patterns.json');
        this.statsFile = path.join(this.dataDir, 'learning_stats.json');

        this._patterns = new Map();
        this._stats = {
            totalLearned: 0,
            totalMatched: 0,
            lastUpdate: null
        };

        this._init();
    }

    /**
     * @description 初始化数据目录、加载已有模式和统计数据
     */
    _init() {
        // 确保数据目录存在
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        // 加载已有模式
        this._loadPatterns();

        // 加载统计
        this._loadStats();
    }

    /**
     * @description 从文件加载已学习的模式到内存 Map
     * @throws {Error} 文件读取或 JSON 解析失败时记录错误日志
     */
    _loadPatterns() {
        try {
            if (fs.existsSync(this.patternFile)) {
                const data = JSON.parse(fs.readFileSync(this.patternFile, 'utf8'));
                for (const [canonical, pattern] of Object.entries(data)) {
                    this._patterns.set(canonical, pattern);
                }
            }
        } catch (e) {
            console.error('[SkillLearner] 加载模式失败:', e.message);
        }
    }

    /**
     * @description 从文件加载学习统计数据
     * @throws {Error} 文件读取或 JSON 解析失败时记录错误日志
     */
    _loadStats() {
        try {
            if (fs.existsSync(this.statsFile)) {
                this._stats = JSON.parse(fs.readFileSync(this.statsFile, 'utf8'));
            }
        } catch (e) {
            console.error('[SkillLearner] 加载统计失败:', e.message);
        }
    }

    /**
     * @description 将内存中的模式持久化到文件
     * @throws {Error} 文件写入失败时记录错误日志
     */
    _savePatterns() {
        try {
            const data = Object.fromEntries(this._patterns);
            fs.writeFileSync(this.patternFile, JSON.stringify(data, null, 2), 'utf8');
            this._stats.lastUpdate = Date.now();
            this._saveStats();
        } catch (e) {
            console.error('[SkillLearner] 保存模式失败:', e.message);
        }
    }

    /**
     * @description 将统计数据持久化到文件
     * @throws {Error} 文件写入失败时记录错误日志
     */
    _saveStats() {
        try {
            fs.writeFileSync(this.statsFile, JSON.stringify(this._stats, null, 2), 'utf8');
        } catch (e) {
            console.error('[SkillLearner] 保存统计失败:', e.message);
        }
    }

    /**
     * 学习新指令（成功执行后调用）
     * @param {string} originalText - 用户原始输入
     * @param {string} canonicalIntent - 标准化意图（如"打开应用"、"搜索网页"）
     * @param {object} extractedParams - 提取的参数 { appName: "微信", ... }
     */
    learn(originalText, canonicalIntent, extractedParams = {}) {
        const key = this._normalize(originalText);

        // 如果已有模式，更新变体列表
        if (this._patterns.has(canonicalIntent)) {
            const pattern = this._patterns.get(canonicalIntent);
            if (!pattern.variants.includes(originalText)) {
                pattern.variants.push(originalText);
                pattern.variantCount = pattern.variants.length;
                pattern.lastUsed = Date.now();
                pattern.usageCount++;
            }
        } else {
            // 新建模式
            this._patterns.set(canonicalIntent, {
                canonical: canonicalIntent,
                variants: [originalText],
                variantCount: 1,
                params: extractedParams,
                createdAt: Date.now(),
                lastUsed: Date.now(),
                usageCount: 1
            });
            this._stats.totalLearned++;
        }

        this._savePatterns();
        console.log(`[SkillLearner] 学习新模式: "${originalText}" → ${canonicalIntent}`);
    }

    /**
     * 匹配用户输入（优先使用学习到的模式）
     * @param {string} userInput - 用户输入
     * @returns {object|null} 匹配结果 { canonical, pattern, similarity }
     */
    match(userInput) {
        const normalized = this._normalize(userInput);

        // 1. 精确匹配变体
        for (const [canonical, pattern] of this._patterns) {
            if (pattern.variants.includes(userInput) || pattern.variants.includes(normalized)) {
                pattern.lastUsed = Date.now();
                pattern.usageCount++;
                this._stats.totalMatched++;
                this._saveStats();

                return {
                    canonical,
                    pattern,
                    similarity: 1.0,
                    type: 'exact'
                };
            }
        }

        // 2. 模糊匹配（包含关系）
        let bestMatch = null;
        let bestScore = 0;

        for (const [canonical, pattern] of this._patterns) {
            // 检查输入是否包含某个变体
            for (const variant of pattern.variants) {
                const variantNorm = this._normalize(variant);

                // 用户输入包含变体
                if (normalized.includes(variantNorm)) {
                    const score = variantNorm.length / normalized.length;
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = { canonical, pattern };
                    }
                }

                // 变体包含用户输入（用户用了更简短的版本），但需确保输入长度足够避免误匹配
                if (variantNorm.includes(normalized) && normalized.length >= MIN_VARIANT_LENGTH) {
                    const score = normalized.length / variantNorm.length;
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = { canonical, pattern };
                    }
                }
            }
        }

        if (bestMatch && bestScore >= 0.5) {
            bestMatch.pattern.lastUsed = Date.now();
            bestMatch.pattern.usageCount++;
            this._stats.totalMatched++;
            this._saveStats();

            return {
                ...bestMatch,
                similarity: bestScore,
                type: 'fuzzy'
            };
        }

        return null;
    }

    /**
     * 提取简化版本（从用户输入生成更简短的表达）
     * @param {string} originalText - 原始输入
     * @returns {string[]} 可能的简化版本
     */
    generateSimplifiedVariants(originalText) {
        const variants = [];
        const text = originalText.trim();

        // 移除"帮我"、"帮我一下"、"麻烦你"等开头
        const prefixes = ['帮我', '帮我一下', '麻烦你', '可以帮我', '能不能帮我', '请帮我', '你能帮我'];
        for (const prefix of prefixes) {
            if (text.startsWith(prefix)) {
                variants.push(text.substring(prefix.length).trim());
            }
        }

        // 移除结尾的语气词
        const suffixes = ['吧', '呀', '哦', '呢', '哈', '嘛', '呗', '好'];
        let simplified = text;
        for (const suffix of suffixes) {
            if (simplified.endsWith(suffix)) {
                variants.push(simplified.substring(0, simplified.length - 1).trim());
            }
        }

        // 提取核心动词短语
        const verbPatterns = [
            /(打开|启动|运行)\s*\S+/,  // 打开微信
            /(搜索|查找)\s*\S+/,        // 搜索天气
            /(整理|分类)\s*\S+/,        // 整理桌面
            /(设|设置)\s*\S+/,          // 设闹钟
            /(查|查询)\s*\S+/,          // 查快递
            /(做|制作)\s*\S+/,          // 做PPT
        ];

        for (const pattern of verbPatterns) {
            const match = text.match(pattern);
            if (match) {
                variants.push(match[0]);
            }
        }

        // 去重
        return [...new Set(variants)].filter(v => v.length >= 2);
    }

    /**
     * @description 建议用户可以用更短的表达方式
     * @param {string} learnedPattern - 已学习的模式
     * @param {string} userInput - 用户刚才用的输入
     * @returns {string|null} 建议文本，如果简化后不够短则返回 null
     */
    suggestShorter(learnedPattern, userInput) {
        const simplifieds = this.generateSimplifiedVariants(userInput);
        // 只有简化后比原始输入短2个字符以上才值得建议
        if (simplifieds.length > 0 && simplifieds[0].length < userInput.length - 2) {
            return `下次说"${simplifieds[0]}"也可以哦~`;
        }
        return null;
    }

    /**
     * @description 获取所有学习到的模式列表
     * @returns {Array<Object>} 模式数组
     */
    getAllPatterns() {
        return Array.from(this._patterns.values());
    }

    /**
     * @description 获取学习统计数据，包括模式数量和各模式使用情况
     * @returns {Object} 统计信息对象
     */
    getStats() {
        return {
            ...this._stats,
            patternCount: this._patterns.size,
            patterns: this.getAllPatterns().map(p => ({
                canonical: p.canonical,
                variantCount: p.variantCount,
                usageCount: p.usageCount
            }))
        };
    }

    /**
     * @description 删除指定模式
     * @param {string} canonical - 模式的标准化意图名称
     * @returns {boolean} 是否删除成功
     */
    removePattern(canonical) {
        if (this._patterns.has(canonical)) {
            this._patterns.delete(canonical);
            this._savePatterns();
            return true;
        }
        return false;
    }

    /**
     * @description 重置所有学习数据和统计信息
     */
    reset() {
        this._patterns.clear();
        this._stats = {
            totalLearned: 0,
            totalMatched: 0,
            lastUpdate: null
        };
        this._savePatterns();
        this._saveStats();
    }

    /**
     * @description 文本标准化处理，转小写、去空格和标点符号
     * @param {string} text - 原始文本
     * @returns {string} 标准化后的文本
     */
    _normalize(text) {
        return text.toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[？?。！!，,]/g, '');
    }
}

// ============================================================
// 模块名称：模块导出
// 功能说明：导出 SkillLearner 单例和类定义
// ============================================================

// 导出单例，同时导出类定义以便测试或扩展
module.exports = new SkillLearner();
module.exports.SkillLearner = SkillLearner;