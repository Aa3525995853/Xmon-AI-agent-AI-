/**
 * @file index.js
 * @description 性格管理器，统一管理所有性格配置。负责加载、注册、验证和获取性格配置，
 *              并根据性格和上下文动态生成系统提示词。
 * @module config/personalities
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 模块名称：性格管理器
// 功能说明：管理所有性格配置的加载、注册、验证和获取
// ============================================================

class PersonalityManager {
    /**
     * @description 初始化性格管理器，加载所有内置性格配置
     */
    constructor() {
        /** @type {Map<string, Object>} 性格配置映射表，key 为性格 ID */
        this.personalities = new Map();
        this.loadBuiltInPersonalities();
    }

    /**
     * @description 加载内置性格配置文件（normal、bad、cute、gentle、obedient）
     */
    loadBuiltInPersonalities() {
        const builtInFiles = [
            'normal.js',
            'bad.js',
            'cute.js',
            'gentle.js',
            'obedient.js'
        ];

        builtInFiles.forEach(file => {
            try {
                const personality = require(path.join(__dirname, file));
           this.register(personality);
            } catch (error) {
             console.warn(`[性格管理器] 加载性格失败: ${file}`, error.message);
            }
        });
    }

    /**
     * @description 注册一个性格配置到管理器
     * @param {Object} personality - 性格配置对象，必须包含 id、name、systemPrompt
     * @param {string} personality.id - 性格唯一标识
     * @param {string} personality.name - 性格显示名称
     * @param {string} personality.systemPrompt - 系统提示词
     * @throws {Error} 性格配置无效时抛出错误
     */
    register(personality) {
        if (!this.validate(personality)) {
         throw new Error(`性格配置无效: ${personality.id}`);
        }
        this.personalities.set(personality.id, personality);
      console.log(`[性格管理器] 已注册性格: ${personality.name} (${personality.id})`);
    }

    /**
     * @description 验证性格配置是否包含必需字段
     * @param {Object} personality - 待验证的性格配置对象
     * @returns {boolean} 配置是否有效
     */
    validate(personality) {
        const required = ['id', 'name', 'systemPrompt'];
      return required.every(field => personality[field]);
    }

    /**
     * @description 根据性格 ID 获取性格配置，不存在时返回默认性格（normal）
     * @param {string} personalityId - 性格 ID
     * @returns {Object} 性格配置对象
     */
    get(personalityId) {
        const personality = this.personalities.get(personalityId);
        if (!personality) {
            console.warn(`[性格管理器] 性格不存在: ${personalityId}，使用默认性格`);
            return this.personalities.get('normal'); // 默认正常性格
        }
        return personality;
    }

    /**
     * @description 根据性格 ID 和上下文生成完整的系统提示词，
     *              自动注入当前时间、格式化输出规则、称呼规则等上下文信息
     * @param {string} personalityId - 性格 ID
     * @param {Object} [context={}] - 额外上下文信息
     * @param {Object} [context.address] - 称呼规则，包含 user（对用户称呼）和 xiaomeng（小梦自称）
     * @param {string} [context.welcomeBack] - 欢迎回来提示语
     * @returns {string} 完整的系统提示词
     */
    getSystemPrompt(personalityId, context = {}) {
        const personality = this.get(personalityId);
        let prompt = personality.systemPrompt;

        // 注入当前时间信息，让 AI 感知时间上下文
        const now = new Date();
        const hour = now.getHours();
        const minute = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
        const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

        // 根据小时数判断时段，用于让 AI 使用合适的问候语
        let period;
        if (hour >= 5 && hour < 12) period = '早上';
        else if (hour >= 12 && hour < 14) period = '中午';
        else if (hour >= 14 && hour < 18) period = '下午';
        else if (hour >= 18 && hour < 22) period = '晚上';
        else period = '深夜';

        prompt += `\n\n当前时间：${timeStr}（星期${weekday}）${period} ${hour}:${minute}`;

        prompt += `\n\n【格式化输出规则 - 必须严格遵守】
- 段落之间必须空一行，禁止连续多行紧挨在一起
- 长内容使用 --- 分隔不同主题，--- 上下各空一行
- 重点内容用 **加粗**，引用/定义用 > 引用块
- 列表使用有序（1. 2. 3.）或无序（-），子项缩进
- 同一主题不要堆在一起，适当用空行分隔不同层次
- 禁止出现：省略号、无意义停顿词、敷衍结尾
- 当用户要求整理数据、制作表格、对比分析时，使用Markdown表格格式输出（| 列1 | 列2 |）
- 代码使用三个反引号包裹并标注语言
- 标题使用 # 标记，重点内容使用 **加粗**
- 保持内容工整、结构清晰、不拥挤`;

        // 注入自定义称呼规则，确保 AI 使用指定的称呼
        if (context.address) {
            const addressInjection = `\n\n【称呼规则 - 必须遵守】
- 对用户的称呼：${context.address.user}
- 小梦的自称：${context.address.xiaomeng}
- 每次回复都要使用这些称呼`;
            prompt += addressInjection;
        }

        // 注入欢迎回来提示，用于长时间未对话后的重新连接场景
        if (context.welcomeBack) {
            prompt += `\n\n【欢迎回来】${context.welcomeBack}`;
        }

        return prompt;
    }

    /**
     * @description 获取所有性格的摘要列表（仅包含 id、name、description）
     * @returns {Array<{id: string, name: string, description: string}>} 性格摘要列表
     */
    list() {
        return Array.from(this.personalities.values()).map(p => ({
            id: p.id,
            name: p.name,
            description: p.description
        }));
    }

    /**
     * @description 获取所有已注册的性格 ID 列表
     * @returns {string[]} 性格 ID 数组
     */
    getIds() {
        return Array.from(this.personalities.keys());
    }
}

/** @type {PersonalityManager} 性格管理器单例 */
const personalityManager = new PersonalityManager();
module.exports = personalityManager;
