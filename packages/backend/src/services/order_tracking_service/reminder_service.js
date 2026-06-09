/**
 * @file reminder_service.js
 * @description 提醒服务 - 在行程前自动发送提醒通知，支持 24小时/3小时/1小时 三级提醒，
 *              通过 WebSocket 广播和 PWA 推送两种渠道发送
 * @module services/order_tracking_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** 出发前提醒时间点（小时），分别在出发前24/3/1小时提醒 */
const REMIND_BEFORE_HOURS = [24, 3, 1];

/** 提醒时间窗口容差（小时），0.2小时≈12分钟，避免因检查间隔导致错过提醒 */
const REMIND_WINDOW_TOLERANCE = 0.2;

/** 有到达时间的订单，到达后2小时自动标记完成 */
const ARRIVAL_COMPLETE_DELAY_HOURS = 2;

/** 无到达时间的订单，出发后12小时自动标记完成 */
const DEPARTURE_COMPLETE_DELAY_HOURS = 12;

class ReminderService {
    /**
     * @description 调度提醒（实际由 checkAll 统一处理）
     * @param {Object} order - 订单对象
     * @returns {void}
     */
    scheduleReminders(order) {
        logger.info(`[Reminder] 已调度提醒: ${order.id}`);
    }

    /**
     * @description 检查所有订单的提醒状态，在指定时间窗口内发送提醒，过期订单自动标记完成
     * @param {Array<Object>} orders - 订单列表
     * @param {Object} formatter - 格式化器实例
     * @returns {void}
     */
    checkAll(orders, formatter) {
        const now = Date.now();

        for (const order of orders) {
            if (order.status !== 'pending') continue;

            const depTime = order.departureTime;
            const hoursUntil = (depTime - now) / (1000 * 60 * 60);

            for (const hours of REMIND_BEFORE_HOURS) {
                // 已发送过的提醒不重复发送
                if (order.reminders?.includes(hours)) continue;
                // 在 [hours-容差, hours] 窗口内触发提醒
                if (hoursUntil <= hours && hoursUntil > hours - REMIND_WINDOW_TOLERANCE) {
                    this.sendReminder(order, hours, formatter);
                }
            }

            // 检查行程是否已过期，自动标记完成
            if (order.arrivalTime && now > order.arrivalTime + ARRIVAL_COMPLETE_DELAY_HOURS * 60 * 60 * 1000) {
                this.completeOrder(order.id);
            } else if (!order.arrivalTime && now > depTime + DEPARTURE_COMPLETE_DELAY_HOURS * 60 * 60 * 1000) {
                this.completeOrder(order.id);
            }
        }
    }

    /**
     * @description 发送提醒通知，通过 WebSocket 广播和 PWA 推送两种渠道
     * @param {Object} order - 订单对象
     * @param {number} hoursUntil - 距出发小时数
     * @param {Object} formatter - 格式化器实例
     * @returns {Promise<void>}
     */
    async sendReminder(order, hoursUntil, formatter) {
        if (!order.reminders) order.reminders = [];
        order.reminders.push(hoursUntil);

        const notification = this.buildNotification(order, hoursUntil, formatter);

        // WebSocket 广播
        try {
            const wsService = require('../websocketService');
            if (wsService?.broadcast) {
                wsService.broadcast({
                    type: 'trip_reminder',
                    order: formatter.format(order),
                    message: notification,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            logger.warn('[Reminder] WebSocket 不可用:', e.message);
        }

        // PWA 推送
        try {
            const pushRoutes = require('../../routes/push_routes');
            if (pushRoutes?.sendPushNotification) {
                pushRoutes.sendPushNotification({
                    title: hoursUntil <= 1 ? '🚨 即将出发！' : '📅 行程提醒',
                    body: notification,
                    data: { orderId: order.id }
                });
            }
        } catch (e) {
            logger.warn('[Reminder] PWA 推送不可用:', e.message);
        }

        logger.info(`[Reminder] 发送提醒: ${order.id}, ${hoursUntil}小时前`);
    }

    /**
     * @description 根据距出发时间和交通类型构建提醒消息文本
     * @param {Object} order - 订单对象
     * @param {number} hoursUntil - 距出发小时数
     * @param {Object} formatter - 格式化器实例
     * @returns {string} 提醒消息文本
     */
    buildNotification(order, hoursUntil, formatter) {
        const transportEmoji = { train: '🚂', high_speed: '🚄', plane: '✈️', bus: '🚌' };
        const emoji = transportEmoji[order.transportType] || '🚃';
        const from = order.from;
        const to = order.to;
        const time = formatter.formatTime(order.departureTime);
        const trainNo = order.trainNo ? ` (${order.trainNo})` : '';

        if (hoursUntil === 24) {
            return `${emoji} 明天要出发啦！\n📍 ${from} → ${to}${trainNo}\n🕐 ${time}\n\n记得提前收拾行李哦~`;
        } else if (hoursUntil === 3) {
            return `${emoji} 还有3小时就要出发了！\n📍 ${from} → ${to}${trainNo}\n🕐 ${time}\n\n可以准备出发了，别忘了带身份证！`;
        } else if (hoursUntil === 1) {
            return `🚨 ${emoji} 还有1小时就要出发了！\n📍 ${from} → ${to}${trainNo}\n🕐 ${time}\n\n快点出发吧，别误了时间！`;
        }

        return `${emoji} ${from} → ${to}\n🕐 ${time}`;
    }

    /**
     * @description 标记订单为已完成
     * @param {string} orderId - 订单ID
     * @returns {void}
     */
    completeOrder(orderId) {
        const orderStore = require('./order_store');
        orderStore.completeOrder(orderId);
    }
}

module.exports = new ReminderService();