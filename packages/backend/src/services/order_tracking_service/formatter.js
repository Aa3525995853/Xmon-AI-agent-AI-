/**
 * @file formatter.js
 * @description 订单格式化器 - 将订单原始数据转换为前端展示友好的格式，
 *              包含交通类型图标/名称、时间状态标签和格式化时间
 * @module services/order_tracking_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class Formatter {
    /**
     * @description 将订单原始数据格式化为前端展示格式
     * @param {Object} order - 订单原始对象
     * @returns {Object} 格式化后的订单对象，包含图标、时间状态等展示字段
     */
    format(order) {
        const now = Date.now();
        const depTime = order.departureTime;
        const hoursUntil = (depTime - now) / (1000 * 60 * 60);

        const transportEmoji = { train: '🚂', high_speed: '🚄', plane: '✈️', bus: '🚌' };
        const transportName = { train: '火车', high_speed: '高铁', plane: '飞机', bus: '大巴' };

        // 根据距出发时间生成时间状态标签
        let timeStatus = '';
        if (order.status === 'pending') {
            if (hoursUntil < 0) {
                timeStatus = '⚠️ 已过期';
            } else if (hoursUntil < 1) {
                timeStatus = '🚨 即将出发';
            } else if (hoursUntil < 3) {
                timeStatus = '⏰ 3小时内';
            } else if (hoursUntil < 24) {
                timeStatus = '📅 今日';
            } else {
                const days = Math.floor(hoursUntil / 24);
                timeStatus = `📅 ${days}天后`;
            }
        }

        return {
            id: order.id,
            transportEmoji: transportEmoji[order.transportType] || '🚃',
            transportName: transportName[order.transportType] || '火车',
            trainNo: order.trainNo || null,
            route: `${order.from} → ${order.to}`,
            from: order.from,
            to: order.to,
            departureTime: this.formatDateTime(depTime),
            departureDate: this.formatDate(depTime),
            departureHour: this.formatTime(depTime),
            arrivalTime: order.arrivalTime ? this.formatDateTime(order.arrivalTime) : null,
            platform: order.platform || null,
            bookingNo: order.bookingNo || null,
            price: order.price ? `¥${order.price}` : null,
            seatType: order.seatType || null,
            passenger: order.passenger || null,
            hoursUntilDeparture: hoursUntil > 0 ? Math.round(hoursUntil * 10) / 10 : 0,
            timeStatus,
            status: this.getStatusText(order.status),
            statusCode: order.status,
            notes: order.notes || null,
            createdAt: this.formatDateTime(order.createdAt)
        };
    }

    /**
     * @description 格式化时间戳为日期时间字符串（月/日 时:分）
     * @param {number} timestamp - 时间戳（毫秒）
     * @returns {string} 格式化的日期时间
     */
    formatDateTime(timestamp) {
        return new Date(timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * @description 格式化时间戳为日期字符串（月/日）
     * @param {number} timestamp - 时间戳（毫秒）
     * @returns {string} 格式化的日期
     */
    formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString('zh-CN', {
            month: '2-digit',
            day: '2-digit'
        });
    }

    /**
     * @description 格式化时间戳为时间字符串（时:分）
     * @param {number} timestamp - 时间戳（毫秒）
     * @returns {string} 格式化的时间
     */
    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * @description 将订单状态码转换为中文文本
     * @param {string} status - 状态码
     * @returns {string} 状态中文文本
     */
    getStatusText(status) {
        const statusMap = {
            pending: '待出行',
            in_progress: '出行中',
            completed: '已完成',
            cancelled: '已取消'
        };
        return statusMap[status] || status;
    }
}

module.exports = new Formatter();