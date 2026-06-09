/**
 * @file price_sync_service.js
 * @description 价格同步调度服务，定期查询票价并对比历史价格，当价格下降到目标价位或变动超过阈值时推送通知
 * @module services/price_sync_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../utils/logger');
const ticketService = require('./ticket_service');
const priceAlertService = require('./price_alert_service');

// ============================================================
// 常量配置：价格同步相关参数
// ============================================================

/** 同步基础间隔（毫秒），默认1小时同步一次 */
const SYNC_BASE_INTERVAL_MS = 60 * 60 * 1000;

/** 价格变动通知阈值（百分比），变动超过5%才通知 */
const PRICE_CHANGE_THRESHOLD_PERCENT = 5;

/** 单次同步最大并发数，防止请求过载 */
const MAX_CONCURRENT_SYNC = 5;

/** 单次票价查询超时时间（毫秒） */
const SYNC_TIMEOUT_MS = 30000;

/** 批次间休眠时间（毫秒），避免请求过快 */
const BATCH_SLEEP_MS = 1000;

const SYNC_CONFIG = {
    BASE_INTERVAL: SYNC_BASE_INTERVAL_MS,
    CHANGE_THRESHOLD: PRICE_CHANGE_THRESHOLD_PERCENT,
    MAX_CONCURRENT: MAX_CONCURRENT_SYNC,
    SYNC_TIMEOUT: SYNC_TIMEOUT_MS,
    enabled: true
};

let syncTimer = null;
let isSyncing = false;
let lastSyncTime = null;
let syncCount = 0;
/** 价格历史缓存，key为"出发:到达:日期:类型"，value为最新价格信息 */
const priceHistory = new Map();

// ============================================================
// 价格同步服务类
// ============================================================

class PriceSyncService {
    /**
     * @description 构造函数，初始化同步服务状态
     */
    constructor() {
        this.isRunning = false;
        this.syncInterval = SYNC_CONFIG.BASE_INTERVAL;
    }

    /**
     * @description 启动价格同步定时任务
     * @returns {void}
     */
    start() {
        if (this.isRunning) {
            logger.warn('[PriceSync] already running');
            return;
        }

        this.isRunning = true;
        this.syncNow();
        syncTimer = setInterval(() => {
            this.syncNow();
        }, this.syncInterval);
    }

    /**
     * @description 停止价格同步定时任务
     * @returns {void}
     */
    stop() {
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
        this.isRunning = false;
    }

    /**
     * @description 立即执行一次价格同步，遍历所有活跃提醒并查询最新价格
     * @returns {Promise<Object>} 同步结果，包含 success/total/synced/failed 等字段
     */
    async syncNow() {
        if (isSyncing) {
            return { success: false, skipped: true, message: 'Price sync is already running' };
        }

        isSyncing = true;
        syncCount++;
        const startTime = Date.now();

        try {
            const activeAlerts = priceAlertService.getActiveAlerts();
            if (activeAlerts.length === 0) {
                return {
                    success: false,
                    skipped: true,
                    total: 0,
                    synced: 0,
                    failed: 0,
                    message: 'No active price alerts to sync'
                };
            }

            const results = [];
            const batches = this.batchArray(activeAlerts, SYNC_CONFIG.MAX_CONCURRENT);
            for (const batch of batches) {
                const batchResults = await Promise.all(batch.map(alert => this.syncAlertPrice(alert)));
                results.push(...batchResults);
                // 批次间休眠，避免请求过快被限流
                await this.sleep(BATCH_SLEEP_MS);
            }

            const synced = results.filter(result => result.success).length;
            const failed = results.length - synced;
            if (synced > 0) lastSyncTime = Date.now();

            return {
                success: synced > 0 && failed === 0,
                total: results.length,
                synced,
                failed,
                elapsedMs: Date.now() - startTime,
                results
            };
        } catch (error) {
            logger.error('[PriceSync] sync failed:', error);
            return { success: false, error: error.message };
        } finally {
            isSyncing = false;
        }
    }

    /**
     * @description 同步单个提醒的最新价格，对比历史价格判断是否需要通知
     * @param {Object} alert - 价格提醒对象，包含 from/to/date/targetPrice 等字段
     * @returns {Promise<Object>} 同步结果，包含 success/alertId/price 等字段
     */
    async syncAlertPrice(alert) {
        const key = `${alert.from}:${alert.to}:${alert.date}:${alert.type || alert.flightType || 'train'}`;

        try {
            const result = await this.fetchPriceWithTimeout(
                alert.from,
                alert.to,
                alert.date,
                alert.type || alert.flightType || 'train'
            );

            if (!result.success) {
                return { success: false, alertId: alert.id, key, message: result.message || 'Ticket search failed' };
            }

            const cheapest = this.extractCheapestTicket(result);
            if (!cheapest) {
                return { success: false, alertId: alert.id, key, message: 'No comparable ticket price returned' };
            }

            const newPrice = Number(cheapest.price);
            const oldPrice = priceHistory.get(key)?.price;
            priceHistory.set(key, {
                price: newPrice,
                time: Date.now(),
                ticket: cheapest
            });

            if (oldPrice && oldPrice !== newPrice) {
                const changePercent = ((newPrice - oldPrice) / oldPrice * 100).toFixed(1);
                const isDrop = newPrice < oldPrice;
                if (isDrop && newPrice <= alert.targetPrice) {
                    this.notifyPriceDrop(alert, newPrice, oldPrice);
                } else if (Math.abs(Number.parseFloat(changePercent)) >= SYNC_CONFIG.CHANGE_THRESHOLD) {
                    this.notifyPriceChange(alert, newPrice, oldPrice, changePercent, isDrop);
                }
            }

            return { success: true, alertId: alert.id, key, price: newPrice, ticket: cheapest };
        } catch (error) {
            logger.error(`[PriceSync] ${key} failed:`, error.message);
            return { success: false, alertId: alert.id, key, error: error.message };
        }
    }

    /**
     * @description 带超时的票价查询，防止单次请求无限等待
     * @param {string} from - 出发城市
     * @param {string} to - 到达城市
     * @param {string} date - 出发日期
     * @param {string} type - 交通类型（train/plane）
     * @returns {Promise<Object>} 票价查询结果
     * @throws {Error} 查询超时或接口异常时抛出错误
     */
    async fetchPriceWithTimeout(from, to, date, type) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Ticket price fetch timed out'));
            }, SYNC_CONFIG.SYNC_TIMEOUT);

            ticketService.search({ from, to, date, type })
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    /**
     * @description 从查询结果中提取最便宜的票，按价格升序排列取第一个
     * @param {Object} result - 票价查询结果对象
     * @returns {Object|null} 最便宜的票信息，无有效数据时返回 null
     */
    extractCheapestTicket(result) {
        const tickets = Array.isArray(result?.results) ? result.results : [];
        return tickets
            .filter(ticket => Number.isFinite(Number(ticket.price)))
            .sort((a, b) => Number(a.price) - Number(b.price))[0] || null;
    }

    /**
     * @description 发送价格下降通知，当价格低于目标价位时触发
     * @param {Object} alert - 价格提醒对象
     * @param {number} newPrice - 新价格
     * @param {number} oldPrice - 旧价格
     * @returns {void}
     */
    notifyPriceDrop(alert, newPrice, oldPrice) {
        const drop = oldPrice - newPrice;
        this.sendNotification({
            type: 'price_drop',
            alertId: alert.id,
            route: `${alert.from} -> ${alert.to}`,
            oldPrice,
            newPrice,
            drop,
            message: this.buildPriceDropMessage(alert, newPrice, drop)
        });
    }

    /**
     * @description 发送价格变动通知，当价格变动超过阈值时触发
     * @param {Object} alert - 价格提醒对象
     * @param {number} newPrice - 新价格
     * @param {number} oldPrice - 旧价格
     * @param {string} changePercent - 变动百分比字符串
     * @param {boolean} isDrop - 是否为降价
     * @returns {void}
     */
    notifyPriceChange(alert, newPrice, oldPrice, changePercent, isDrop) {
        this.sendNotification({
            type: 'price_change',
            alertId: alert.id,
            route: `${alert.from} -> ${alert.to}`,
            oldPrice,
            newPrice,
            changePercent,
            direction: isDrop ? 'down' : 'up',
            message: this.buildPriceChangeMessage(alert, newPrice, changePercent, isDrop)
        });
    }

    /**
     * @description 通过 WebSocket 广播通知数据
     * @param {Object} data - 通知数据对象
     * @returns {void}
     */
    sendNotification(data) {
        try {
            const wsService = require('./websocketService');
            if (wsService && wsService.broadcast) {
                wsService.broadcast({
                    type: 'price_update',
                    ...data,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            logger.warn('[PriceSync] WebSocket unavailable:', e.message);
        }
    }

    /**
     * @description 构建价格下降通知消息文本
     * @param {Object} alert - 价格提醒对象
     * @param {number} newPrice - 新价格
     * @param {number} drop - 降价金额
     * @returns {string} 通知消息文本
     */
    buildPriceDropMessage(alert, newPrice, drop) {
        return `${alert.from} -> ${alert.to} dropped to ${newPrice}, down ${drop}`;
    }

    /**
     * @description 构建价格变动通知消息文本
     * @param {Object} alert - 价格提醒对象
     * @param {number} newPrice - 新价格
     * @param {string} changePercent - 变动百分比
     * @param {boolean} isDrop - 是否为降价
     * @returns {string} 通知消息文本
     */
    buildPriceChangeMessage(alert, newPrice, changePercent, isDrop) {
        return `${alert.from} -> ${alert.to} price ${isDrop ? 'dropped' : 'rose'} to ${newPrice} (${changePercent}%)`;
    }

    /**
     * @description 根据活跃提醒数量动态调整同步间隔，提醒越多同步越频繁
     * @returns {void}
     */
    adjustInterval() {
        const activeCount = priceAlertService.getActiveAlerts().length;
        // 提醒数超过20个时，缩短为30分钟同步一次
        if (activeCount > 20) {
            this.syncInterval = 30 * 60 * 1000;
        } else if (activeCount > 5) {
            // 提醒数5-20个时，45分钟同步一次
            this.syncInterval = 45 * 60 * 1000;
        } else {
            // 提醒数5个以下，使用基础间隔
            this.syncInterval = SYNC_CONFIG.BASE_INTERVAL;
        }

        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = setInterval(() => {
                this.syncNow();
            }, this.syncInterval);
        }
    }

    /**
     * @description 获取价格同步服务的运行状态信息
     * @returns {Object} 状态对象，包含 isRunning/isSyncing/syncInterval/lastSyncTime/syncCount 等
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isSyncing,
            syncInterval: this.syncInterval,
            lastSyncTime,
            syncCount,
            activeAlerts: priceAlertService.getActiveAlerts().length,
            cachedPrices: priceHistory.size
        };
    }

    /**
     * @description 手动触发一次同步（供外部API调用）
     * @returns {Promise<Object>} 同步结果
     */
    async manualSync() {
        return await this.syncNow();
    }

    /**
     * @description 查询指定路线的价格历史缓存
     * @param {string} from - 出发城市
     * @param {string} to - 到达城市
     * @param {string} date - 出发日期
     * @param {string} type - 交通类型
     * @returns {Object|null} 价格历史记录，无缓存时返回 null
     */
    getPriceHistory(from, to, date, type) {
        const key = `${from}:${to}:${date}:${type || 'train'}`;
        return priceHistory.get(key) || null;
    }

    /**
     * @description 将数组按指定大小分批，用于并发控制
     * @param {Array} arr - 待分批的数组
     * @param {number} size - 每批大小
     * @returns {Array<Array>} 分批后的二维数组
     */
    batchArray(arr, size) {
        const batches = [];
        for (let i = 0; i < arr.length; i += size) batches.push(arr.slice(i, i + size));
        return batches;
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

const priceSyncService = new PriceSyncService();

module.exports = priceSyncService;
module.exports.SYNC_CONFIG = SYNC_CONFIG;
