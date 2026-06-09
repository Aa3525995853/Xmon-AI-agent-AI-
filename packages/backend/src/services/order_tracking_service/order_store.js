/**
 * @file order_store.js
 * @description 订单存储管理器 - 基于文件系统的订单持久化存储，支持订单的增删改查、
 *              按用户/时间范围筛选和统计功能
 * @module services/order_tracking_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');
const { DATA_DIR, ensureDir } = require('../../config/runtimePaths');

// ============================================================
// 常量定义
// ============================================================

/** 订单数据文件路径 */
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

/** 订单状态枚举 */
const OrderStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

// 确保数据目录存在
ensureDir(DATA_DIR);

class OrderStore {
    /**
     * @description 构造函数，从文件加载订单数据
     */
    constructor() {
        /** 订单数据，包含 orders 数组和 lastId 计数器 */
        this.data = this.load();
    }

    /**
     * @description 从文件加载订单数据，文件不存在或解析失败时返回空数据
     * @returns {{orders: Array, lastId: number}} 订单数据
     */
    load() {
        try {
            if (fs.existsSync(ORDERS_FILE)) {
                return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
            }
        } catch (e) {
            logger.error('[OrderStore] 加载订单失败:', e);
        }
        return { orders: [], lastId: 0 };
    }

    /**
     * @description 将订单数据持久化到文件
     * @returns {void}
     */
    save() {
        try {
            fs.writeFileSync(ORDERS_FILE, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {
            logger.error('[OrderStore] 保存订单失败:', e);
        }
    }

    /**
     * @description 将时间字符串或数字统一转换为时间戳
     * @param {string|number} timeStr - 时间字符串或时间戳
     * @returns {number} 时间戳（毫秒）
     */
    parseTime(timeStr) {
        if (typeof timeStr === 'number') return timeStr;
        const date = new Date(timeStr);
        return isNaN(date.getTime()) ? Date.now() : date.getTime();
    }

    /**
     * @description 创建新订单
     * @param {Object} orderInfo - 订单信息
     * @param {string} [orderInfo.userId] - 用户ID
     * @param {string} [orderInfo.transportType] - 交通类型
     * @param {string} [orderInfo.trainNo] - 车次/航班号
     * @param {string} orderInfo.from - 出发地
     * @param {string} orderInfo.to - 目的地
     * @param {string|number} orderInfo.departureTime - 出发时间
     * @param {string|number} [orderInfo.arrivalTime] - 到达时间
     * @returns {Object} 创建的订单对象
     */
    create(orderInfo) {
        const {
            userId = 'default',
            transportType = 'train',
            trainNo = '',
            from,
            to,
            departureTime,
            arrivalTime,
            platform,
            bookingNo = '',
            price = null,
            seatType = '',
            passenger = '',
            contact = '',
            notes = ''
        } = orderInfo;

        const orderId = `order_${++this.data.lastId}_${Date.now()}`;

        const order = {
            id: orderId,
            userId,
            transportType,
            trainNo,
            from,
            to,
            departureTime: this.parseTime(departureTime),
            arrivalTime: arrivalTime ? this.parseTime(arrivalTime) : null,
            platform,
            bookingNo,
            price,
            seatType,
            passenger,
            contact,
            notes,
            status: OrderStatus.PENDING,
            createdAt: Date.now(),
            reminders: [],
            notifications: []
        };

        this.data.orders.push(order);
        this.save();
        return order;
    }

    /**
     * @description 更新订单信息，仅允许更新白名单字段
     * @param {string} orderId - 订单ID
     * @param {Object} updates - 更新字段
     * @returns {Object} 更新后的订单对象
     * @throws {Error} 订单不存在时抛出异常
     */
    update(orderId, updates) {
        const order = this.data.orders.find(o => o.id === orderId);
        if (!order) throw new Error('订单不存在');

        const allowedFields = ['trainNo', 'from', 'to', 'departureTime', 'arrivalTime',
            'platform', 'bookingNo', 'price', 'seatType', 'passenger', 'contact', 'notes', 'status'];

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                // 时间字段需要转换为时间戳
                if (field === 'departureTime' || field === 'arrivalTime') {
                    order[field] = this.parseTime(updates[field]);
                } else {
                    order[field] = updates[field];
                }
            }
        }

        order.updatedAt = Date.now();
        this.save();
        return order;
    }

    /**
     * @description 更新订单状态，取消时记录取消时间
     * @param {string} orderId - 订单ID
     * @param {string} status - 新状态
     * @returns {boolean} 是否更新成功
     */
    updateStatus(orderId, status) {
        const order = this.data.orders.find(o => o.id === orderId);
        if (!order) return false;

        order.status = status;
        // 取消订单时记录取消时间
        if (status === OrderStatus.CANCELLED) order.cancelledAt = Date.now();
        this.save();
        return true;
    }

    /**
     * @description 删除指定订单
     * @param {string} orderId - 订单ID
     * @returns {boolean} 是否删除成功
     */
    delete(orderId) {
        const index = this.data.orders.findIndex(o => o.id === orderId);
        if (index === -1) return false;

        this.data.orders.splice(index, 1);
        this.save();
        return true;
    }

    /**
     * @description 获取所有订单
     * @returns {Array<Object>} 订单列表
     */
    getAll() {
        return this.data.orders;
    }

    /**
     * @description 按用户ID筛选订单
     * @param {string} userId - 用户ID
     * @returns {Array<Object>} 该用户的订单列表
     */
    getByUser(userId) {
        return this.data.orders.filter(o => o.userId === userId);
    }

    /**
     * @description 按订单ID获取单个订单
     * @param {string} orderId - 订单ID
     * @returns {Object|undefined} 订单对象
     */
    getById(orderId) {
        return this.data.orders.find(o => o.id === orderId);
    }

    /**
     * @description 获取指定小时数内即将出发的待出行订单
     * @param {number} hours - 查询未来多少小时内的订单
     * @param {string} [userId] - 可选，按用户筛选
     * @returns {Array<Object>} 即将出发的订单列表，按出发时间升序排列
     */
    getUpcoming(hours, userId = null) {
        const now = Date.now();
        const inHours = now + hours * 60 * 60 * 1000;

        return this.data.orders
            .filter(o => {
                if (o.status !== OrderStatus.PENDING) return false;
                if (userId && o.userId !== userId) return false;
                return o.departureTime > now && o.departureTime <= inHours;
            })
            .sort((a, b) => a.departureTime - b.departureTime);
    }

    /**
     * @description 获取今日出发的待出行订单
     * @param {string} [userId] - 可选，按用户筛选
     * @returns {Array<Object>} 今日出发的订单列表，按出发时间升序排列
     */
    getToday(userId = null) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return this.data.orders
            .filter(o => {
                if (o.status !== OrderStatus.PENDING) return false;
                if (userId && o.userId !== userId) return false;
                return o.departureTime >= today.getTime() && o.departureTime < tomorrow.getTime();
            })
            .sort((a, b) => a.departureTime - b.departureTime);
    }

    /**
     * @description 将订单标记为已完成
     * @param {string} orderId - 订单ID
     * @returns {void}
     */
    completeOrder(orderId) {
        const order = this.data.orders.find(o => o.id === orderId);
        if (!order || order.status === OrderStatus.COMPLETED) return;

        order.status = OrderStatus.COMPLETED;
        order.completedAt = Date.now();
        this.save();
    }

    /**
     * @description 获取订单统计数据，包含各状态数量和即将出行数量
     * @returns {Object} 统计信息
     */
    getStats() {
        const stats = {
            total: this.data.orders.length,
            pending: 0,
            in_progress: 0,
            completed: 0,
            cancelled: 0,
            upcomingToday: 0,
            upcoming24h: 0
        };

        const now = Date.now();
        const tomorrow = now + 24 * 60 * 60 * 1000;

        for (const order of this.data.orders) {
            const status = order.status;
            if (status === 'pending') stats.pending++;
            else if (status === 'in_progress') stats.in_progress++;
            else if (status === 'completed') stats.completed++;
            else if (status === 'cancelled') stats.cancelled++;

            if (order.status === OrderStatus.PENDING) {
                const depTime = order.departureTime;
                if (depTime >= now && depTime < tomorrow) {
                    stats.upcomingToday++;
                    stats.upcoming24h++;
                } else if (depTime > tomorrow) {
                    stats.upcoming24h++;
                }
            }
        }

        return stats;
    }
}

module.exports = new OrderStore();
