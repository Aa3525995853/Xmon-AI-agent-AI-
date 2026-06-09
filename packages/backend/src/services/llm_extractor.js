/**
 * @file LLM 信息提取器
 * @description 使用 LLM 从对话中提取用户深层信息
 *              支持身份、偏好、习惯、情绪、目标、知识等多维度提取
 * @module services/llm_extractor
 * @version 1.0.0
 * @date 2026-06-06
 */

const fs = require('fs');
const path = require('path');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 常量定义
// ============================================================

/** LLM 提取缓存文件路径 */
const EXTRACT_CACHE_FILE = dataPath('llm_extract_cache.json');
/** 缓存最大条数 */
const MAX_CACHE_SIZE = 200;

// ============================================================
// LLMExtractor 类
// ============================================================

/**
 * LLM 信息提取器类
 * 使用 LLM 从对话中提取用户深层信息，并缓存结果
 * @class
 */
class LLMExtractor {
    /**
     * 构造函数
     */
    constructor() {
        /** @type {Array} 提取缓存 */
        this.cache = this.loadCache();
        /** @type {Array} 待处理的提取队列 */
        this.extractQueue = [];
        /** @type {boolean} 是否正在处理 */
        this.isProcessing = false;
        /** @type {Object|null} LLM 服务实例 */
        this.llmService = null;
    }

    /**
     * 从磁盘加载缓存
     * @returns {Object} 缓存数据
     */
    loadCache() {
        try {
            if (fs.existsSync(EXTRACT_CACHE_FILE)) {
                return JSON.parse(fs.readFileSync(EXTRACT_CACHE_FILE, 'utf-8'));
            }
        } catch (e) {
            console.error('[LLMExtractor] 加载缓存失败:', e.message);
        }
        return { extractions: [], lastCleanup: Date.now() };
    }

    /**
     * 保存缓存到磁盘
     */
    saveCache() {
        try {
            if (this.cache.extractions.length > MAX_CACHE_SIZE) {
                this.cache.extractions = this.cache.extractions.slice(-100);
            }
            fs.writeFileSync(EXTRACT_CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
        } catch (e) {
            console.error('[LLMExtractor] 保存缓存失败:', e.message);
        }
    }

    /**
     * 初始化 LLM 服务
     * @param {Object} llmService - LLM 服务实例
     */
    init(llmService) {
        this.llmService = llmService;
    }

    /**
     * 深度提取用户信息
     * @param {string} userInput - 用户输入
     * @param {string} aiResponse - AI 回复
     * @param {Object} existingProfile - 已有用户画像
     * @returns {Object} 提取结果
     */
    async extractDeepInsights(userInput, aiResponse, existingProfile = {}) {
        if (!this.llmService) {
            return this.fallbackExtract(userInput);
        }

        try {
            const prompt = this.buildExtractionPrompt(userInput, aiResponse, existingProfile);
            const result = await this.callLLM(prompt);
            const parsed = this.parseExtractionResult(result);

            if (parsed && Object.keys(parsed).length > 0) {
                this.cache.extractions.push({
                    input: userInput.slice(0, 100),
                    result: parsed,
                    timestamp: Date.now()
                });
                this.saveCache();
            }

            return parsed;
        } catch (e) {
            console.error('[LLMExtractor] LLM提取失败，降级到正则:', e.message);
            return this.fallbackExtract(userInput);
        }
    }

    /**
     * 构建提取提示词
     * @param {string} userInput - 用户输入
     * @param {string} aiResponse - AI 回复
     * @param {Object} existingProfile - 已有用户画像
     * @returns {string} 提示词
     */
    buildExtractionPrompt(userInput, aiResponse, existingProfile) {
        const profileSummary = existingProfile.name
            ? `已知信息：姓名=${existingProfile.name || '未知'}, 职业=${existingProfile.occupation || '未知'}, 所在地=${existingProfile.location || '未知'}`
            : '暂无已知信息';

        return `分析以下对话，提取用户的深层信息。只返回JSON，不要其他文字。

${profileSummary}

用户说: ${userInput}
AI回复: ${aiResponse.slice(0, 200)}

请提取以下信息（如果对话中有的话），没有的字段留空：
{
  "identity": {
    "name": "",
    "gender": "",
    "age_group": "",
    "occupation": "",
    "location": "",
    "personality_traits": []
  },
  "preferences": {
    "likes": [],
    "dislikes": [],
    "hobbies": [],
    "food": [],
    "entertainment": []
  },
  "habits": {
    "sleep_time": "",
    "wake_time": "",
    "work_style": "",
    "communication_style": ""
  },
  "emotions": {
    "current_mood": "",
    "stress_level": "",
    "emotional_needs": []
  },
  "relationships": {
    "family": [],
    "friends": [],
    "pets": []
  },
  "goals": {
    "short_term": [],
    "long_term": [],
    "current_challenges": []
  },
  "knowledge": {
    "expertise_areas": [],
    "learning_interests": [],
    "skill_level": {}
  },
  "context": {
    "current_activity": "",
    "recent_events": [],
    "upcoming_events": []
  }
}`;
    }

    /**
     * 解析 LLM 提取结果
     * @param {string} result - LLM 返回的原始结果
     * @returns {Object} 解析后的对象
     */
    parseExtractionResult(result) {
        try {
            let jsonStr = result;

            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonStr = jsonMatch[0];
            }

            const parsed = JSON.parse(jsonStr);

            const cleaned = {};
            for (const [category, values] of Object.entries(parsed)) {
                if (typeof values !== 'object' || values === null) continue;

                const cleanedCategory = {};
                for (const [key, value] of Object.entries(values)) {
                    if (value === '' || value === null || value === undefined) continue;
                    if (Array.isArray(value) && value.length === 0) continue;
                    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
                    cleanedCategory[key] = value;
                }

                if (Object.keys(cleanedCategory).length > 0) {
                    cleaned[category] = cleanedCategory;
                }
            }

            return cleaned;
        } catch (e) {
            console.error('[LLMExtractor] 解析LLM提取结果失败:', e.message);
            return {};
        }
    }

    /**
     * 降级提取（使用正则表达式）
     * @param {string} userInput - 用户输入
     * @returns {Object} 提取结果
     */
    fallbackExtract(userInput) {
        const result = {};

        const nameMatch = userInput.match(/我(?:叫|是|的名字是)\s*([^\s，。！？]{2,8})/);
        if (nameMatch) {
            result.identity = { name: nameMatch[1] };
        }

        const likeMatch = userInput.match(/我喜欢(了?)([^\s，。！？]{2,10})/g);
        if (likeMatch) {
            result.preferences = {
                likes: likeMatch.map(m => m.replace(/我喜欢了?/, ''))
            };
        }

        const dislikeMatch = userInput.match(/我不喜欢(了?)([^\s，。！？]{2,10})/g);
        if (dislikeMatch) {
            result.preferences = result.preferences || {};
            result.preferences.dislikes = dislikeMatch.map(m => m.replace(/我不喜欢了?/, ''));
        }

        const occupationMatch = userInput.match(/我(?:的工作|职业|岗位)是([^\s，。！？]{2,10})/);
        if (occupationMatch) {
            result.identity = result.identity || {};
            result.identity.occupation = occupationMatch[1];
        }

        const locationMatch = userInput.match(/我在([^\s，。！？]{2,8})(工作|上班|生活|居住)/);
        if (locationMatch) {
            result.identity = result.identity || {};
            result.identity.location = locationMatch[1];
        }

        return result;
    }

    /**
     * 调用 LLM 服务
     * @param {string} prompt - 提示词
     * @returns {string} LLM 回复
     */
    async callLLM(prompt) {
        if (!this.llmService) throw new Error('LLM服务未初始化');

        if (typeof this.llmService.generateReply === 'function') {
            const result = await this.llmService.generateReply(prompt, prompt, [], 'default', 'none');
            return result.content || result.message || JSON.stringify(result);
        }

        throw new Error('无法调用LLM服务');
    }

    /**
     * 将提取结果合并到用户画像
     * @param {Object} extraction - 提取结果
     * @param {Object} profile - 已有用户画像
     * @returns {Object} 合并后的用户画像
     */
    mergeExtractionIntoProfile(extraction, profile) {
        if (!extraction || !profile) return profile;

        const updated = JSON.parse(JSON.stringify(profile));

        if (extraction.identity) {
            for (const [key, value] of Object.entries(extraction.identity)) {
                if (value && (!updated.identity || !updated.identity[key])) {
                    updated.identity = updated.identity || {};
                    updated.identity[key] = value;
                }
            }
            if (extraction.identity.personality_traits && extraction.identity.personality_traits.length > 0) {
                updated.identity = updated.identity || {};
                updated.identity.personality_traits = [
                    ...(updated.identity.personality_traits || []),
                    ...extraction.identity.personality_traits
                ].filter((v, i, a) => a.indexOf(v) === i);
            }
        }

        if (extraction.preferences) {
            updated.learned = updated.learned || {};
            updated.learned.preferences = updated.learned.preferences || {};

            for (const [key, values] of Object.entries(extraction.preferences)) {
                if (Array.isArray(values)) {
                    updated.learned.preferences[key] = [
                        ...(updated.learned.preferences[key] || []),
                        ...values
                    ].filter((v, i, a) => a.indexOf(v) === i);
                }
            }
        }

        if (extraction.habits) {
            updated.learned = updated.learned || {};
            updated.learned.habits = { ...updated.learned.habits, ...extraction.habits };
        }

        if (extraction.goals) {
            updated.learned = updated.learned || {};
            updated.learned.goals = updated.learned.goals || {};
            if (extraction.goals.short_term) {
                updated.learned.goals.short_term = [
                    ...(updated.learned.goals.short_term || []),
                    ...extraction.goals.short_term
                ].filter((v, i, a) => a.indexOf(v) === i);
            }
            if (extraction.goals.long_term) {
                updated.learned.goals.long_term = [
                    ...(updated.learned.goals.long_term || []),
                    ...extraction.goals.long_term
                ].filter((v, i, a) => a.indexOf(v) === i);
            }
        }

        if (extraction.emotions) {
            updated.xiaomeng_state = updated.xiaomeng_state || {};
            if (extraction.emotions.emotional_needs) {
                updated.xiaomeng_state.emotional_needs = extraction.emotions.emotional_needs;
            }
        }

        if (extraction.knowledge) {
            updated.learned = updated.learned || {};
            updated.learned.knowledge = updated.learned.knowledge || {};
            if (extraction.knowledge.expertise_areas) {
                updated.learned.knowledge.expertise_areas = [
                    ...(updated.learned.knowledge.expertise_areas || []),
                    ...extraction.knowledge.expertise_areas
                ].filter((v, i, a) => a.indexOf(v) === i);
            }
            if (extraction.knowledge.learning_interests) {
                updated.learned.knowledge.learning_interests = [
                    ...(updated.learned.knowledge.learning_interests || []),
                    ...extraction.knowledge.learning_interests
                ].filter((v, i, a) => a.indexOf(v) === i);
            }
        }

        return updated;
    }

    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            totalExtractions: this.cache.extractions.length,
            lastExtraction: this.cache.extractions.length > 0
                ? this.cache.extractions[this.cache.extractions.length - 1].timestamp
                : null,
            categories: this.cache.extractions.reduce((acc, e) => {
                for (const key of Object.keys(e.result || {})) {
                    acc[key] = (acc[key] || 0) + 1;
                }
                return acc;
            }, {})
        };
    }
}

module.exports = new LLMExtractor();
