/**
 * @file scheduler.js
 * @description 主动服务调度器 - 定时检查并触发早安/晚安问候等主动消息
 * @module services/proactive_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：调度检查间隔
// ============================================================

/** 检查间隔（毫秒），每1分钟检查一次是否有待发送的主动消息 */
const CHECK_INTERVAL = 60000;

class Scheduler {
    /**
     * @description 构造函数，初始化定时器和上次检查时间
     */
    constructor() {
        /** @type {NodeJS.Timeout|null} 定时器引用 */
        this.interval = null;
        /** @type {number|null} 上次检查时间戳 */
        this.lastCheck = null;
    }

    /**
     * @description 启动调度器，每分钟检查一次待发送消息
     * @param {Object} service - 主动服务实例，需提供 enabled、generateMessage、messageQueue、data、saveData 属性
     */
    start(service) {
        if (this.interval) {
            this.stop();
        }

        this.interval = setInterval(() => {
            this.checkPending(service);
        }, CHECK_INTERVAL);

        logger.info('[调度器] 启动');
    }

    /**
     * @description 停止调度器，清除定时器
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            logger.info('[调度器] 停止');
        }
    }

    /**
     * @description 检查待发送消息，在特定时间段触发早安/晚安问候
     * @param {Object} service - 主动服务实例
     * @returns {Promise<void>}
     */
    async checkPending(service) {
        if (!service.enabled) return;

        this.lastCheck = Date.now();

        try {
            const hour = new Date().getHours();
            const now = new Date();

            // 早安问候 (6-9点)
            if (hour >= 6 && hour <= 9) {
                const lastGreeting = service.data.lastGreeting;
                if (!lastGreeting || !this._isToday(lastGreeting)) {
                    const message = await service.generateMessage('greeting', { hour });
                    if (message.success) {
                        service.messageQueue.push(message);
                        service.data.lastGreeting = now.toISOString();
                        service.data.messageCount++;
                        service.saveData();
                    }
                }
            }

            // 晚安问候 (21-23点)
            if (hour >= 21 && hour <= 23) {
                const lastNightGreeting = service.data.lastNightGreeting;
                if (!lastNightGreeting || !this._isToday(lastNightGreeting)) {
                    const message = await service.generateMessage('greeting', { hour: 22 });
                    if (message.success) {
                        service.messageQueue.push(message);
                        service.data.lastNightGreeting = now.toISOString();
                        service.data.messageCount++;
                        service.saveData();
                    }
                }
            }

        } catch (error) {
            logger.error('[调度器] 检查失败:', error);
        }
    }

    /**
     * @description 判断ISO时间字符串是否是今天
     * @param {string} isoString - ISO格式的时间字符串
     * @returns {boolean} 是否是今天
     * @private
     */
    _isToday(isoString) {
        const date = new Date(isoString);
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    /**
     * @description 获取下次检查的预计时间戳
     * @returns {number|null} 下次检查时间戳，调度器未启动返回 null
     */
    getNextCheck() {
        if (!this.interval) return null;
        return this.lastCheck ? this.lastCheck + CHECK_INTERVAL : null;
    }
}

module.exports = new Scheduler();