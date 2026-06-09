/**
 * @file message_generator.js
 * @description 消息生成器 - 根据类型和上下文生成问候、关心、提醒、庆祝等主动消息
 * @module services/proactive_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：问候语和关心语模板
// ============================================================

/** 按时段分组的问候语模板 */
const GREETING_TEMPLATES = {
    morning: [
        '早上好呀，今天也要元气满满哦~',
        '早安！新的一天开始了，要加油哦~',
        '早上好呀，今天感觉怎么样？'
    ],
    afternoon: [
        '下午好，休息得怎么样？',
        '下午啦，工作/学习顺利吗？'
    ],
    evening: [
        '晚上好呀，今天辛苦了~',
        '傍晚好，准备好休息了吗？'
    ],
    night: [
        '晚安啦，早点休息哦~',
        '夜深了，该睡觉啦，好梦~'
    ]
};

/** 按情绪分组的关心语模板 */
const CARE_TEMPLATES = {
    tired: [
        '看起来有点累，要不要休息一下？',
        '注意身体哦，不要太辛苦了~'
    ],
    busy: [
        '最近挺忙的吧，别忘了照顾好自己~',
        '忙坏了吧？记得偶尔休息一下哦~'
    ],
    happy: [
        '看起来心情不错呢，发生什么好事了？',
        '开心就好~'
    ]
};

class MessageGenerator {
    /**
     * @description 构造函数，初始化问候语和关心语模板
     */
    constructor() {
        this.greetings = GREETING_TEMPLATES;
        this.cares = CARE_TEMPLATES;
    }

    /**
     * @description 根据类型和上下文生成主动消息
     * @param {string} type - 消息类型：greeting/care/reminder/celebration
     * @param {Object} [context={}] - 上下文信息
     * @param {number} [context.hour] - 当前小时（greeting类型使用）
     * @param {string} [context.mood] - 用户情绪（care类型使用）
     * @param {string} [context.task] - 任务描述（reminder类型使用）
     * @param {string} [context.milestone] - 里程碑名称（celebration类型使用）
     * @returns {Promise<{success: boolean, type: string, message: string}>} 生成的消息
     */
    async generate(type, context = {}) {
        switch (type) {
            case 'greeting':
                return this._generateGreeting(context);

            case 'care':
                return this._generateCare(context);

            case 'reminder':
                return this._generateReminder(context);

            case 'celebration':
                return this._generateCelebration(context);

            default:
                return this._generateRandom(type, context);
        }
    }

    /**
     * @description 根据时段生成问候消息
     * @param {Object} [context={}] - 上下文
     * @param {number} [context.hour] - 当前小时，默认取系统时间
     * @returns {{success: boolean, type: string, message: string, timeOfDay: string}} 问候消息
     * @private
     */
    _generateGreeting(context = {}) {
        const hour = context.hour || new Date().getHours();

        let timeOfDay = 'morning';
        if (hour >= 6 && hour < 12) timeOfDay = 'morning';
        else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
        else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
        else timeOfDay = 'night';

        const templates = this.greetings[timeOfDay];
        const message = templates[Math.floor(Math.random() * templates.length)];

        return {
            success: true,
            type: 'greeting',
            message,
            timeOfDay
        };
    }

    /**
     * @description 根据用户情绪生成关心消息
     * @param {Object} [context={}] - 上下文
     * @param {string} [context.mood] - 用户情绪：happy/busy/tired 等
     * @returns {{success: boolean, type: string, message: string}} 关心消息
     * @private
     */
    _generateCare(context = {}) {
        const { mood } = context;

        let templates = this.cares.general || this.cares.tired;
        if (mood === 'happy') {
            templates = this.cares.happy;
        } else if (mood === 'busy') {
            templates = this.cares.busy;
        }

        const message = templates[Math.floor(Math.random() * templates.length)];

        return {
            success: true,
            type: 'care',
            message
        };
    }

    /**
     * @description 生成任务提醒消息
     * @param {Object} [context={}] - 上下文
     * @param {string} [context.task] - 任务描述
     * @returns {{success: boolean, type: string, message: string}} 提醒消息
     * @private
     */
    _generateReminder(context = {}) {
        const { task } = context;

        const templates = [
            `提醒一下：${task || '之前的事情还没做完哦~'}`,
            '别忘了之前说的事情哦~',
            `有个小提醒：${task || '有什么事需要处理吗？'}`
        ];

        const message = templates[Math.floor(Math.random() * templates.length)];

        return {
            success: true,
            type: 'reminder',
            message
        };
    }

    /**
     * @description 生成庆祝消息
     * @param {Object} [context={}] - 上下文
     * @param {string} [context.milestone] - 里程碑名称
     * @returns {{success: boolean, type: string, message: string}} 庆祝消息
     * @private
     */
    _generateCelebration(context = {}) {
        const { milestone } = context;

        const templates = [
            '恭喜恭喜！太棒了！',
            `太厉害了！${milestone || '你真棒'}！`,
            '哇！这真是个值得庆祝的时刻！'
        ];

        const message = templates[Math.floor(Math.random() * templates.length)];

        return {
            success: true,
            type: 'celebration',
            message
        };
    }

    /**
     * @description 生成默认随机消息，用于未知消息类型
     * @param {string} type - 原始消息类型
     * @param {Object} context - 上下文信息
     * @returns {{success: boolean, type: string, message: string, context: Object}} 随机消息
     * @private
     */
    _generateRandom(type, context = {}) {
        return {
            success: true,
            type,
            message: '小梦在这里陪着你哦~',
            context
        };
    }
}

module.exports = new MessageGenerator();