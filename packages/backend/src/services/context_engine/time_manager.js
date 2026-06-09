/**
 * @file time_manager.js
 * @description 时间感知管理器 - 根据当前时间段判断工作/休息状态，获取时间规则
 * @module context_engine
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class TimeManager {
    /**
     * @description 获取当前时间段标识
     * @returns {string} 时间段：morning/worktime/noon/afternoon/evening/night/late_night
     */
    getTimePeriod() {
        const hour = new Date().getHours();

        if (hour >= 6 && hour < 9) return 'morning';
        if (hour >= 9 && hour < 12) return 'worktime';
        if (hour >= 12 && hour < 14) return 'noon';
        if (hour >= 14 && hour < 18) return 'afternoon';
        if (hour >= 18 && hour < 22) return 'evening';
        if (hour >= 22 || hour < 2) return 'night';
        return 'late_night';
    }

    /**
     * @description 获取指定时间段的规则配置
     * @param {string} timePeriod - 时间段标识
     * @param {Object} profile - 用户配置
     * @returns {Object} 时间规则配置
     */
    getTimeRule(timePeriod, profile) {
        return profile?.time_rules?.[timePeriod] || {};
    }

    /**
     * @description 获取当前小时数
     * @returns {number} 小时数（0-23）
     */
    getHour() {
        return new Date().getHours();
    }

    /**
     * @description 判断当前是否为工作时间（9:00-18:00）
     * @returns {boolean} 是否为工作时间
     */
    isWorkTime() {
        const hour = this.getHour();
        return hour >= 9 && hour < 18;
    }

    /**
     * @description 判断当前是否为休息时间（23:00-7:00）
     * @returns {boolean} 是否为休息时间
     */
    isRestTime() {
        const hour = this.getHour();
        return hour >= 23 || hour < 7;
    }
}

module.exports = new TimeManager();