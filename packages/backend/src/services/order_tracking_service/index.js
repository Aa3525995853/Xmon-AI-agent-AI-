/**
 * @file index.js
 * @description OrderTrackingService 主入口 - 订单追踪服务，记录用户订单（航班号、时间、出发地、目的地），
 *              在行程前主动提醒用户（24小时、3小时、1小时），提供订单查询和管理
 * @module services/order_tracking_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块，避免循环依赖
// ============================================================

/** 订单存储懒加载实例 */
let _orderStore = null;
/** 提醒服务懒加载实例 */
let _reminderService = null;
/** 格式化器懒加载实例 */
let _formatter = null;

/**
 * @description 获取订单存储单例
 * @returns {Object} OrderStore 实例
 */
function getOrderStore() {
    if (!_orderStore) _orderStore = require('./order_store');
    return _orderStore;
}

/**
 * @description 获取提醒服务单例
 * @returns {Object} ReminderService 实例
 */
function getReminderService() {
    if (!_reminderService) _reminderService = require('./reminder_service');
    return _reminderService;
}

/**
 * @description 获取格式化器单例
 * @returns {Object} Formatter 实例
 */
function getFormatter() {
    if (!_formatter) _formatter = require('./formatter');
    return _formatter;
}

// ============================================================
// 常量定义
// ============================================================

/** 订单状态枚举 */
const OrderStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

/** 交通类型枚举 */
const TransportType = {
    TRAIN: 'train',
    HIGH_SPEED: 'high_speed',
    PLANE: 'plane',
    BUS: 'bus'
};

/** 提醒检查间隔（毫秒），60秒 */
const REMINDER_CHECK_INTERVAL_MS = 60 * 1000;

/** 即将出行查询时间范围（分钟），24小时 */
const UPCOMING_HOURS = 24 * 60;

class OrderTrackingService {
    /**
     * @description 构造函数，初始化子模块并启动提醒检查器
     */
    constructor() {
        this.orderStore = getOrderStore();
        this.reminderService = getReminderService();
        this.formatter = getFormatter();

        this.startReminderChecker();

        logger.info('[OrderTracking] 订单追踪服务初始化完成');
    }

    /**
     * @description 创建订单，同时调度提醒
     * @param {Object} orderInfo - 订单信息，必须包含 from、to、departureTime
     * @returns {Object} 创建的订单对象
     * @throws {Error} 缺少必要参数时抛出异常
     */
    createOrder(orderInfo) {
        const { from, to, departureTime } = orderInfo;

        if (!from || !to || !departureTime) {
            throw new Error('缺少必要参数：出发地、目的地、出发时间');
        }

        const order = this.orderStore.create(orderInfo);
        this.reminderService.scheduleReminders(order);

        logger.info(`[OrderTracking] 创建订单: ${from}→${to}, ${departureTime}`);
        return order;
    }

    /**
     * @description 更新订单信息
     * @param {string} orderId - 订单ID
     * @param {Object} updates - 更新字段
     * @returns {Object} 更新后的订单对象
     */
    updateOrder(orderId, updates) {
        return this.orderStore.update(orderId, updates);
    }

    /**
     * @description 取消订单
     * @param {string} orderId - 订单ID
     * @returns {boolean} 是否取消成功
     */
    cancelOrder(orderId) {
        return this.orderStore.updateStatus(orderId, OrderStatus.CANCELLED);
    }

    /**
     * @description 删除订单
     * @param {string} orderId - 订单ID
     * @returns {boolean} 是否删除成功
     */
    deleteOrder(orderId) {
        return this.orderStore.delete(orderId);
    }

    /**
     * @description 获取用户订单列表，格式化后返回
     * @param {string} userId - 用户ID
     * @returns {Array<Object>} 格式化后的订单列表
     */
    getOrdersByUser(userId) {
        const orders = this.orderStore.getByUser(userId);
        return orders.map(o => this.formatter.format(o));
    }

    /**
     * @description 获取即将出行的订单（24小时内）
     * @param {string} [userId] - 可选，按用户筛选
     * @returns {Array<Object>} 格式化后的即将出行订单列表
     */
    getUpcomingOrders(userId = null) {
        const orders = this.orderStore.getUpcoming(UPCOMING_HOURS, userId);
        return orders.map(o => this.formatter.format(o));
    }

    /**
     * @description 获取今日出行的订单
     * @param {string} [userId] - 可选，按用户筛选
     * @returns {Array<Object>} 格式化后的今日出行订单列表
     */
    getTodayOrders(userId = null) {
        const orders = this.orderStore.getToday(userId);
        return orders.map(o => this.formatter.format(o));
    }

    /**
     * @description 获取订单详情
     * @param {string} orderId - 订单ID
     * @returns {Object|null} 格式化后的订单详情，不存在则返回 null
     */
    getOrderDetail(orderId) {
        const order = this.orderStore.getById(orderId);
        return order ? this.formatter.format(order) : null;
    }

    /**
     * @description 获取订单统计数据
     * @returns {Object} 统计信息
     */
    getStats() {
        return this.orderStore.getStats();
    }

    /**
     * @description 启动定时提醒检查器，每分钟检查一次所有订单的提醒状态
     * @returns {void}
     */
    startReminderChecker() {
        setInterval(() => {
            this.reminderService.checkAll(this.orderStore.getAll(), this.formatter);
        }, REMINDER_CHECK_INTERVAL_MS);

        logger.info('[OrderTracking] 提醒检查器已启动');
    }
}

const instance = new OrderTrackingService();
module.exports = instance;
module.exports.OrderStatus = OrderStatus;
module.exports.TransportType = TransportType;