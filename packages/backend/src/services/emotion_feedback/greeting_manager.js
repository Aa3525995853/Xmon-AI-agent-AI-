/**
 * @file greeting_manager.js
 * @description 问候语管理器 - 根据当前时间段生成合适的问候语，
 *              支持早晨/工作时间/中午/下午/傍晚/深夜六个时段
 * @module services/emotion_feedback
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义：时段问候语
// ============================================================

/** 各时段对应的问候语列表 */
const GREETINGS = {
    morning: ['早安！今天想让我帮你做什么？', '早上好～有什么需要我帮忙的吗？'],
    worktime: ['上午好！需要我帮你处理什么？', '工作顺利吗？有什么要做的尽管说～'],
    noon: ['中午好！休息一下，吃午饭了吗？', '中午啦～有什么我可以帮你的？'],
    afternoon: ['下午好！需要我帮忙吗？', '下午啦，要来杯咖啡还是来点帮助？'],
    evening: ['傍晚好！累了一天了吧？', '晚上好～有什么我可以帮你的？'],
    night: ['晚上好！这么晚还在，需要我陪你吗？', '夜深了，需要我帮忙做什么吗？']
};

// ============================================================
// GreetingManager 类：问候语生成
// ============================================================

class GreetingManager {
    /**
     * @description 获取当前时段的随机问候语
     * @returns {string} 问候语文本
     */
    getPhrase() {
        const hour = new Date().getHours();
        let timeOfDay;

        if (hour >= 6 && hour < 9) timeOfDay = 'morning';
        else if (hour >= 9 && hour < 12) timeOfDay = 'worktime';
        else if (hour >= 12 && hour < 14) timeOfDay = 'noon';
        else if (hour >= 14 && hour < 18) timeOfDay = 'afternoon';
        else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
        else timeOfDay = 'night';

        const phrases = GREETINGS[timeOfDay] || GREETINGS.afternoon;
        return this.randomPick(phrases);
    }

    /**
     * @description 获取当前时段标识
     * @returns {string} 时段标识（morning/worktime/noon/afternoon/evening/night）
     */
    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 9) return 'morning';
        if (hour >= 9 && hour < 12) return 'worktime';
        if (hour >= 12 && hour < 14) return 'noon';
        if (hour >= 14 && hour < 18) return 'afternoon';
        if (hour >= 18 && hour < 22) return 'evening';
        return 'night';
    }

    /**
     * @description 从数组中随机选择一个元素
     * @param {Array} array - 候选数组
     * @returns {*} 随机选中的元素
     */
    randomPick(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

module.exports = new GreetingManager();