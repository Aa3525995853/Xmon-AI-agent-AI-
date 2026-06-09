/**
 * @file price_alert_service.js
 * @description 价格提醒服务，当票价下降到用户心理价位时主动推送通知，支持多提醒管理和定时监控
 * @module services/price_alert_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../utils/logger');
const ticketService = require('./ticket_service');

// ============================================================
// 常量配置：价格提醒相关参数
// ============================================================

/** 价格提醒存储 */
const priceAlerts = new Map();
let alertIdCounter = 0;

/** 检查间隔（毫秒）- 默认 30 分钟检查一次 */
const CHECK_INTERVAL = 30 * 60 * 1000;

/** 价格历史记录最大保留条数 */
const MAX_PRICE_HISTORY_COUNT = 10;

/** 检查单个提醒间的延迟（毫秒），避免请求过快 */
const CHECK_DELAY_MS = 2000;

/** 过期提醒清理间隔（毫秒），默认1小时清理一次 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** 过期提醒最大保留时间（毫秒），默认7天 */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 自动启动监控的延迟时间（毫秒），等待其他服务就绪 */
const AUTO_START_DELAY_MS = 5000;

let checkTimer = null;

/**
 * 提醒数据结构
 * {
 *   id: string,
 *   from: string,           // 出发城市
 *   to: string,             // 到达城市
 *   date: string,          // 出发日期 (YYYY-MM-DD)
 *   targetPrice: number,    // 心理价位
 *   currentPrice: number,   // 最近一次查询到的价格
 *   createdAt: number,      // 创建时间
 *   lastCheck: number,      // 上次检查时间
 *   checkedCount: number,    // 检查次数
 *   status: 'active' | 'triggered' | 'expired',  // 状态
 *   triggeredAt: number,    // 触发时间
 *   userId: string,         // 用户ID（可选，用于多用户）
 *   flightType: 'train' | 'plane',  // 交通类型
 *   platform: string        // 偏好平台
 * }
 */

// ============================================================
// 价格提醒服务类
// ============================================================

class PriceAlertService {
    constructor() {
        this.alerts = priceAlerts;
        this.alertIdCounter = alertIdCounter;
        this.checkInterval = CHECK_INTERVAL;
        this.isRunning = false;
    }

    /**
     * @description 创建价格提醒
     * @param {Object} params - 提醒参数
     * @param {string} params.from - 出发城市
     * @param {string} params.to - 到达城市
     * @param {string} params.date - 出发日期 (YYYY-MM-DD)
     * @param {number} params.targetPrice - 心理价位
     * @param {string} [params.userId='default'] - 用户ID
     * @param {string} [params.flightType='train'] - 交通类型（train/plane）
     * @param {string} [params.platform=null] - 偏好平台
     * @returns {Object} 创建的提醒对象
     * @throws {Error} 缺少必要参数或心理价位无效时抛出错误
     */
    createAlert(params) {
        const {
            from,
            to,
            date,
            targetPrice,
            userId = 'default',
            flightType = 'train',
            platform = null
        } = params;

        // 验证参数
        if (!from || !to || !date || !targetPrice) {
            throw new Error('缺少必要参数：出发地、目的地、日期、心理价位');
        }

        if (targetPrice <= 0) {
            throw new Error('心理价位必须大于0');
        }

        // 生成唯一ID
        const alertId = `alert_${++this.alertIdCounter}_${Date.now()}`;

        const alert = {
            id: alertId,
            from,
            to,
            date,
            targetPrice,
            currentPrice: null,
            createdAt: Date.now(),
            lastCheck: null,
            checkedCount: 0,
            status: 'active',
            triggeredAt: null,
            userId,
            flightType,
            platform,
            priceHistory: [],  // 价格历史记录
            notificationSent: false
        };

        this.alerts.set(alertId, alert);
        logger.info(`[价格提醒] 创建提醒: ${from}→${to}, 目标价: ¥${targetPrice}`);

        return alert;
    }

    /**
     * @description 取消价格提醒，将状态设为 expired
     * @param {string} alertId - 提醒ID
     * @returns {boolean} 是否成功取消
     */
    cancelAlert(alertId) {
        const alert = this.alerts.get(alertId);
        if (!alert) {
            return false;
        }

        alert.status = 'expired';
        logger.info(`[价格提醒] 取消提醒: ${alertId}`);
        return true;
    }

    /**
     * @description 获取指定用户的活跃提醒列表
     * @param {string} userId - 用户ID
     * @returns {Array<Object>} 格式化后的提醒列表
     */
    getAlertsByUser(userId) {
        const userAlerts = [];
        for (const [id, alert] of this.alerts) {
            if (alert.userId === userId && alert.status === 'active') {
                userAlerts.push(this.formatAlertForUser(alert));
            }
        }
        return userAlerts;
    }

    /**
     * @description 获取所有活跃提醒（供价格同步服务使用）
     * @returns {Array<Object>} 活跃提醒列表
     */
    getActiveAlerts() {
        const active = [];
        for (const [id, alert] of this.alerts) {
            if (alert.status === 'active') {
                active.push(alert);
            }
        }
        return active;
    }

    /**
     * @description 格式化提醒信息（面向用户展示）
     * @param {Object} alert - 原始提醒对象
     * @returns {Object} 格式化后的提醒信息，包含中文状态和日期
     */
    formatAlertForUser(alert) {
        return {
            id: alert.id,
            route: `${alert.from} → ${alert.to}`,
            date: alert.date,
            targetPrice: alert.targetPrice,
            currentPrice: alert.currentPrice,
            status: alert.status === 'active' ? '监控中' : '已触发',
            createdAt: new Date(alert.createdAt).toLocaleString('zh-CN'),
            lastCheck: alert.lastCheck ? new Date(alert.lastCheck).toLocaleString('zh-CN') : '未检查',
            priceDrop: alert.currentPrice && alert.currentPrice < alert.targetPrice
                ? `降了 ¥${(alert.targetPrice - alert.currentPrice).toFixed(0)}`
                : null
        };
    }

    /**
     * @description 开始监控所有活跃提醒，启动定时检查
     * @returns {Promise<void>}
     */
    async startMonitoring() {
        if (this.isRunning) {
            logger.warn('[价格提醒] 监控已在运行');
            return;
        }

        this.isRunning = true;
        logger.info('[价格提醒] 开始监控价格...');

        // 立即执行一次检查
        await this.checkAllAlerts();

        // 设置定时检查
        this.checkTimer = setInterval(async () => {
            await this.checkAllAlerts();
        }, this.checkInterval);

        logger.info(`[价格提醒] 每 ${this.checkInterval / 60000} 分钟检查一次`);
    }

    /**
     * @description 停止监控，清除定时器
     * @returns {void}
     */
    stopMonitoring() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
        this.isRunning = false;
        logger.info('[价格提醒] 停止监控');
    }

    /**
     * @description 检查所有活跃提醒的最新价格
     * @returns {Promise<void>}
     */
    async checkAllAlerts() {
        const activeAlerts = this.getActiveAlerts();

        if (activeAlerts.length === 0) {
            return;
        }

        logger.info(`[价格提醒] 开始检查 ${activeAlerts.length} 个提醒...`);

        for (const alert of activeAlerts) {
            try {
                await this.checkAlert(alert);
                // 添加延迟，避免请求过快
                await this.sleep(CHECK_DELAY_MS);
            } catch (e) {
                logger.error(`[价格提醒] 检查失败: ${alert.id}`, e);
            }
        }

        logger.info('[价格提醒] 本次检查完成');
    }

    /**
     * @description 检查单个提醒的最新价格，判断是否触发通知
     * @param {Object} alert - 提醒对象
     * @returns {Promise<void>}
     */
    async checkAlert(alert) {
        alert.lastCheck = Date.now();
        alert.checkedCount++;

        logger.info(`[价格提醒] 检查: ${alert.from}→${alert.to}, 目标: ¥${alert.targetPrice}`);

        try {
            // 调用订票服务获取最新价格
            const result = await ticketService.search({
                from: alert.from,
                to: alert.to,
                date: alert.date,
                type: alert.flightType
            });

            if (!result.success || !result.platforms) {
                logger.warn(`[价格提醒] 获取价格失败: ${alert.id}`);
                return;
            }

            const cheapest = this.extractCheapestTicket(result);
            const minPrice = cheapest ? cheapest.price : null;
            if (cheapest?.platform) alert.platform = cheapest.platform;

            if (minPrice) {
                alert.currentPrice = minPrice;
                alert.priceHistory.push({
                    price: minPrice,
                    time: Date.now()
                });

                // 保留最近N条价格记录
                if (alert.priceHistory.length > MAX_PRICE_HISTORY_COUNT) {
                    alert.priceHistory = alert.priceHistory.slice(-MAX_PRICE_HISTORY_COUNT);
                }

                logger.info(`[价格提醒] ${alert.from}→${alert.to}: 当前价 ¥${minPrice}, 目标价 ¥${alert.targetPrice}`);

                // 检查是否触发提醒
                if (minPrice <= alert.targetPrice && !alert.notificationSent) {
                    alert.status = 'triggered';
                    alert.triggeredAt = Date.now();
                    alert.notificationSent = true;

                    logger.info(`[价格提醒] ✅ 触发提醒: ${alert.from}→${alert.to} 价格降到 ¥${minPrice}`);

                    // 发送通知（通过 WebSocket）
                    this.sendAlertNotification(alert);
                }
            }

        } catch (e) {
            logger.error(`[价格提醒] 检查出错: ${alert.id}`, e);
        }
    }

    /**
     * @description 发送提醒通知，通过 WebSocket 和 PWA 推送两种渠道
     * @param {Object} alert - 已触发的提醒对象
     * @returns {void}
     */
    sendAlertNotification(alert) {
        // 通过 WebSocket 发送通知
        try {
            const wsService = require('./websocketService');
            if (wsService && wsService.broadcast) {
                const notification = {
                    type: 'price_alert',
                    alert: this.formatAlertForUser(alert),
                    message: this.buildAlertMessage(alert),
                    timestamp: Date.now()
                };
                wsService.broadcast(notification);
                logger.info(`[价格提醒] WebSocket 通知已发送: ${alert.id}`);
            }
        } catch (e) {
            logger.warn('[价格提醒] WebSocket 不可用:', e.message);
        }

        // 通过 PWA 推送通知
        try {
            const pushRoutes = require('../routes/push_routes');
            if (pushRoutes.sendPushNotification) {
                pushRoutes.sendPushNotification({
                    title: '🎉 价格提醒',
                    body: this.buildAlertMessage(alert),
                    data: { alertId: alert.id }
                });
            }
        } catch (e) {
            logger.warn('[价格提醒] PWA 推送不可用:', e.message);
        }
    }

    /**
     * @description 从查询结果中提取最便宜的票（仅从 results 数组中提取，不使用平台配置数据）
     * @param {Object} result - 票价查询结果
     * @returns {Object|null} 最便宜的票信息
     */
    extractCheapestTicket(result) {
        // TicketService returns real search rows in `results`. Platform config
        // is only metadata; it must not be used as if it contained live prices.
        const tickets = Array.isArray(result?.results) ? result.results : [];
        return tickets
            .filter(ticket => Number.isFinite(Number(ticket.price)))
            .sort((a, b) => Number(a.price) - Number(b.price))[0] || null;
    }

    /**
     * @description 构建提醒通知消息文本
     * @param {Object} alert - 提醒对象
     * @returns {string} 格式化的通知消息
     */
    buildAlertMessage(alert) {
        const drop = alert.targetPrice - alert.currentPrice;
        return `📉 ${alert.from}→${alert.to} 的${alert.flightType === 'plane' ? '机票' : '火车票'}降价啦！\n` +
               `💰 当前最低价 ¥${alert.currentPrice}\n` +
               `🎯 你的目标价 ¥${alert.targetPrice}\n` +
               `💵 比目标价还低 ¥${drop.toFixed(0)}！\n` +
               `📅 ${alert.date}\n\n` +
               `快去下单吧~`;
    }

    /**
     * @description 获取提醒统计数据（各状态数量和监控状态）
     * @returns {Object} 统计对象，包含 total/active/triggered/expired/monitoring
     */
    getStats() {
        let active = 0, triggered = 0, expired = 0;
        for (const [id, alert] of this.alerts) {
            if (alert.status === 'active') active++;
            else if (alert.status === 'triggered') triggered++;
            else if (alert.status === 'expired') expired++;
        }

        return {
            total: this.alerts.size,
            active,
            triggered,
            expired,
            monitoring: this.isRunning
        };
    }

    /**
     * @description 删除过期提醒，清理超过指定时间的已触发/过期提醒
     * @param {number} [maxAge=DEFAULT_MAX_AGE_MS] - 最大保留时间（毫秒），默认7天
     * @returns {number} 清理的提醒数量
     */
    cleanupExpired(maxAge = 7 * 24 * 60 * 60 * 1000) {
        const now = Date.now();
        let cleaned = 0;

        for (const [id, alert] of this.alerts) {
            // 删除超过 maxAge 的已触发/过期提醒
            if ((alert.status === 'triggered' || alert.status === 'expired') &&
                (now - alert.createdAt > maxAge || now - alert.triggeredAt > maxAge)) {
                this.alerts.delete(id);
                cleaned++;
            }
        }

        logger.info(`[价格提醒] 清理了 ${cleaned} 个过期提醒`);
        return cleaned;
    }

    /**
     * @description 延迟指定毫秒数
     * @param {number} ms - 延迟毫秒数
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 导出单例
const priceAlertService = new PriceAlertService();

// 自动启动监控，延迟等待其他服务就绪
setTimeout(() => {
    priceAlertService.startMonitoring();
}, AUTO_START_DELAY_MS);

// 定期清理过期提醒
setInterval(() => {
    priceAlertService.cleanupExpired();
}, CLEANUP_INTERVAL_MS);

module.exports = priceAlertService;
