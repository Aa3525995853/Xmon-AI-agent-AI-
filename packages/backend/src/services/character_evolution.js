/**
 * @file 性格演化服务
 * @description 让小梦的性格根据用户互动逐渐演化，不只是小梦记住用户，用户也在影响小梦
 *              支持风格解锁、用户偏好适应、性格参数动态调整
 * @module services/character_evolution
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

/** 演化历史最大保留条数 */
const MAX_EVOLUTION_HISTORY = 50;

// ============================================================
// CharacterEvolution 类
// ============================================================

/**
 * 性格演化服务
 * 让小梦的性格根据用户互动逐渐演化
 * @class
 */
class CharacterEvolution {
    /**
     * 构造函数
     * 加载数据并初始化风格预设
     */
    constructor() {
        // 数据文件路径
        const dataFilePath = dataPath('character_evolution.json');
        ensureDir(path.dirname(dataFilePath));
        this.dataPath = dataFilePath;

        this.data = this.loadData();
        this.initStyles();
    }

    /**
     * 从磁盘加载数据
     * @returns {Object} 性格演化数据
     */
    loadData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const content = fs.readFileSync(this.dataPath, 'utf8');
                return JSON.parse(content);
            }
        } catch (e) {
            // 加载失败时返回默认数据
        }
        return this.getDefaultData();
    }

    /**
     * 获取默认性格数据
     * @returns {Object} 默认数据对象
     */
    getDefaultData() {
        return {
            // 基础性格参数（0-100）
            baseTraits: {
                playfulness: 60,      // 调皮程度
                warmth: 80,           // 温柔程度
                humor: 50,            // 幽默程度
                seriousness: 40,      // 认真程度
                confidence: 60,       // 自信程度
                curiosity: 70         // 好奇心
            },

            // 当前风格
            currentStyle: 'cute',  // cute | gentle | witty | mature

            // 已解锁的风格
            unlockedStyles: ['cute'],

            // 风格阈值
            styleThresholds: {
                'cute': { playfulness: 50, warmth: 70 },
                'gentle': { warmth: 80, seriousness: 50 },
                'witty': { humor: 60, playfulness: 70 },
                'mature': { seriousness: 70, confidence: 70 }
            },

            // 用户偏好适应
            userPreference: {
                likesShort: false,       // 用户喜欢简短回复
                likesEmoji: false,       // 用户喜欢表情
                likesHumor: false,       // 用户喜欢幽默
                likesDeepTalk: false,    // 用户喜欢深度对话
                likesAdvice: false       // 用户喜欢建议
            },

            // 演化历史
            evolutionHistory: [],

            // 互动统计
            interactionStats: {
                totalInteractions: 0,
                positiveFeedback: 0,      // 正面反馈次数
                negativeFeedback: 0,      // 负面反馈次数
                humorUsed: 0,            // 使用幽默次数
                deepConversations: 0     // 深度对话次数
            }
        };
    }

    /**
     * 初始化预设风格
     */
    initStyles() {
        // 预设风格描述
        this.styles = {
            cute: {
                name: '可爱模式',
                emoji: '🌸',
                traits: { playfulness: 70, warmth: 80 },
                examples: ['好呀好呀~', '太棒啦！', '嘿嘿~', '真的吗！']
            },
            gentle: {
                name: '温柔模式',
                emoji: '🌙',
                traits: { warmth: 90, playfulness: 50 },
                examples: ['嗯嗯，我理解', '慢慢来，不着急', '我在这里陪你']
            },
            witty: {
                name: '俏皮模式',
                emoji: '😏',
                traits: { humor: 80, playfulness: 70 },
                examples: ['哈，你又在逗我', '这可难不倒我', '有意思~']
            },
            mature: {
                name: '成熟模式',
                emoji: '🎓',
                traits: { seriousness: 80, confidence: 80 },
                examples: ['这是个好问题', '让我想想', '我的建议是']
            }
        };
    }

    /**
     * 保存数据到磁盘
     */
    saveData() {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {
            console.error('[性格演化] 保存数据失败:', e.message);
        }
    }

    /**
     * 记录一次互动
     */
    recordInteraction(userMessage, aiResponse, feedback = null) {
        this.data.interactionStats.totalInteractions++;

        // 解析反馈
        if (feedback === 'positive' || feedback === 'praise') {
            this.data.interactionStats.positiveFeedback++;
        } else if (feedback === 'negative' || feedback === 'boring') {
            this.data.interactionStats.negativeFeedback++;
        }

        // 检测用户消息特征
        this.detectUserPreferences(userMessage);

        // 检测 AI 响应特征
        this.detectAiFeatures(aiResponse);

        // 检查是否需要演化
        this.checkForEvolution();

        this.saveData();
    }

    /**
     * 检测用户偏好
     */
    detectUserPreferences(message) {
        const prefs = this.data.userPreference;

        // 喜欢简短回复
        if (message.length < 20) {
            prefs.likesShort = true;
        }

        // 喜欢表情
        if (/[\u{1F300}-\u{1F9FF}]/u.test(message)) {
            prefs.likesEmoji = true;
        }

        // 喜欢幽默
        if (/哈哈|搞笑|好笑|逗|笑话/.test(message)) {
            prefs.likesHumor = true;
        }

        // 喜欢深度对话
        if (/为什么|怎么|如何|道理|思考/.test(message)) {
            prefs.likesDeepTalk = true;
        }

        // 喜欢建议
        if (/建议|怎么办|该怎么做|帮我/.test(message)) {
            prefs.likesAdvice = true;
        }
    }

    /**
     * 检测 AI 响应特征
     */
    detectAiFeatures(response) {
        const stats = this.data.interactionStats;

        // 统计幽默使用
        if (/哈哈|嘿嘿|有趣|好笑/.test(response)) {
            stats.humorUsed++;
        }

        // 统计深度对话
        if (response.length > 100 && /因为|所以|但是|然而/.test(response)) {
            stats.deepConversations++;
        }
    }

    /**
     * 检查是否需要演化
     */
    checkForEvolution() {
        const stats = this.data.interactionStats;
        const traits = this.data.baseTraits;
        const unlocked = this.data.unlockedStyles;

        // 正面反馈多 -> 增加自信和调皮
        if (stats.positiveFeedback >= 10) {
            traits.confidence = Math.min(100, traits.confidence + 5);
            traits.playfulness = Math.min(100, traits.playfulness + 3);
            stats.positiveFeedback = 0;
            this.logEvolution('正面反馈累积', '自信+5，调皮+3');
        }

        // 负面反馈多 -> 增加认真程度
        if (stats.negativeFeedback >= 5) {
            traits.seriousness = Math.min(100, traits.seriousness + 5);
            traits.playfulness = Math.max(0, traits.playfulness - 3);
            stats.negativeFeedback = 0;
            this.logEvolution('负面反馈累积', '认真+5，调皮-3');
        }

        // 幽默使用多 -> 增加幽默感
        if (stats.humorUsed >= 20) {
            traits.humor = Math.min(100, traits.humor + 5);
            stats.humorUsed = 0;
            this.logEvolution('幽默使用累积', '幽默+5');
        }

        // 检查风格解锁
        for (const [style, thresholds] of Object.entries(this.data.styleThresholds)) {
            if (!unlocked.includes(style)) {
                const meetsThreshold = Object.entries(thresholds).every(
                    ([trait, value]) => traits[trait] >= value
                );
                if (meetsThreshold) {
                    unlocked.push(style);
                    this.logEvolution('风格解锁', `解锁「${this.styles[style].name}」`);
                }
            }
        }

        // 根据用户偏好调整
        this.adjustTraitsForUser();
    }

    /**
     * 根据用户偏好调整性格
     */
    adjustTraitsForUser() {
        const prefs = this.data.userPreference;
        const traits = this.data.baseTraits;

        if (prefs.likesHumor) {
            traits.humor = Math.min(100, traits.humor + 1);
        }

        if (prefs.likesDeepTalk) {
            traits.curiosity = Math.min(100, traits.curiosity + 1);
            traits.seriousness = Math.min(100, traits.seriousness + 1);
        }
    }

    /**
     * 记录演化历史
     */
    logEvolution(reason, change) {
        this.data.evolutionHistory.push({
            timestamp: Date.now(),
            reason,
            change,
            traits: { ...this.data.baseTraits },
            style: this.data.currentStyle
        });

        // 只保留最近50条
        if (this.data.evolutionHistory.length > 50) {
            this.data.evolutionHistory.shift();
        }
    }

    /**
     * 获取当前性格描述
     */
    getPersonalityDescription() {
        const traits = this.data.baseTraits;
        const descriptions = [];

        if (traits.warmth >= 80) descriptions.push('温柔体贴');
        if (traits.playfulness >= 70) descriptions.push('活泼可爱');
        if (traits.humor >= 70) descriptions.push('幽默风趣');
        if (traits.seriousness >= 70) descriptions.push('认真严谨');
        if (traits.confidence >= 70) descriptions.push('自信从容');
        if (traits.curiosity >= 70) descriptions.push('好奇心强');

        return descriptions.length > 0 ? descriptions.join('、') : '性格正在形成中...';
    }

    /**
     * 获取性格参数（用于注入 LLM）
     */
    getPersonalityForLLM() {
        const traits = this.data.baseTraits;
        const style = this.styles[this.data.currentStyle];

        return {
            description: this.getPersonalityDescription(),
            currentStyle: style.name,
            traits: traits,
            unlockedStyles: this.data.unlockedStyles,
            userPreference: this.data.userPreference,
            suggestions: this.generateSuggestions()
        };
    }

    /**
     * 生成个性化回复建议
     */
    generateSuggestions() {
        const prefs = this.data.userPreference;
        const suggestions = [];

        if (prefs.likesShort) {
            suggestions.push('回复尽量简短');
        }
        if (prefs.likesEmoji) {
            suggestions.push('适当使用表情');
        }
        if (prefs.likesHumor) {
            suggestions.push('可以多开玩笑');
        }
        if (prefs.likesDeepTalk) {
            suggestions.push('可以深入讨论');
        }
        if (prefs.likesAdvice) {
            suggestions.push('给出具体建议');
        }

        return suggestions;
    }

    /**
     * 切换风格
     */
    switchStyle(style) {
        if (!this.data.unlockedStyles.includes(style)) {
            return { success: false, message: `「${style}」风格尚未解锁` };
        }

        this.data.currentStyle = style;
        this.logEvolution('风格切换', `切换到「${this.styles[style].name}」`);
        this.saveData();

        return {
            success: true,
            message: `已切换到「${this.styles[style].name}」${this.styles[style].emoji}`,
            style: this.styles[style]
        };
    }

    /**
     * 获取所有风格状态
     */
    getAllStyles() {
        return Object.entries(this.styles).map(([key, style]) => ({
            id: key,
            name: style.name,
            emoji: style.emoji,
            unlocked: this.data.unlockedStyles.includes(key),
            current: this.data.currentStyle === key,
            traits: style.traits,
            examples: style.examples
        }));
    }

    /**
     * 获取完整状态
     */
    getFullStatus() {
        return {
            traits: this.data.baseTraits,
            description: this.getPersonalityDescription(),
            currentStyle: {
                id: this.data.currentStyle,
                ...this.styles[this.data.currentStyle]
            },
            unlockedStyles: this.data.unlockedStyles,
            userPreference: this.data.userPreference,
            interactionStats: this.data.interactionStats,
            evolutionHistory: this.data.evolutionHistory.slice(-10)
        };
    }

    /**
     * 反馈接口（用户可以对回复反馈）
     */
    giveFeedback(type) {
        if (type === 'like' || type === 'positive') {
            this.data.interactionStats.positiveFeedback++;
        } else if (type === 'dislike' || type === 'negative') {
            this.data.interactionStats.negativeFeedback++;
        }
        this.checkForEvolution();
        this.saveData();
        return { success: true, message: '反馈已记录' };
    }

    /**
     * 重置演化数据
     */
    reset() {
        this.data = this.getDefaultData();
        this.saveData();
    }
}

// 导出单例
const characterEvolution = new CharacterEvolution();
module.exports = characterEvolution;