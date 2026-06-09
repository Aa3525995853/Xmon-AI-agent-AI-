/**
 * @file booking_assistant.js
 * @description 订票助手 - 生成各平台的预订链接，
 *              明确区分"链接生成"与"完成订票"，不将链接生成视为已预订
 * @module ticket_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 核心类：BookingAssistant
// 功能说明：生成预订链接和格式化选择信息
// ============================================================

class BookingAssistant {

    /**
     * @description 生成预订链接，返回各平台的外部跳转 URL
     * @param {Object} selection - 用户选择的票务信息
     * @param {string} [selection.trainNumber] - 车次/航班号
     * @param {string} selection.from - 出发地
     * @param {string} selection.to - 目的地
     * @param {string} selection.date - 出发日期
     * @param {string} [selection.platform='train'] - 目标平台标识
     * @param {Object} platforms - 平台配置映射
     * @returns {{success: boolean, bookingCompleted: boolean, actionRequired: boolean, trainNumber?: string, from?: string, to?: string, date?: string, platform?: string, platformName?: string, platformIcon?: string, platformColor?: string, directUrl?: string, allLinks?: Object, message?: string}} 链接生成结果
     */
    generateLink(selection = {}, platforms = {}) {
        const { trainNumber, from, to, date, platform = 'train' } = selection;
        if (!from || !to || !date) {
            return {
                success: false,
                message: 'Booking link generation requires from, to and date'
            };
        }

        // 获取平台配置，未知平台回退到 12306
        const platformConfig = platforms[platform] || platforms.train;
        if (!platformConfig) {
            return { success: false, message: `Unknown booking platform: ${platform}` };
        }

        // 生成各平台的预订链接
        const links = {
            train: this._generate12306Link(from, to, date),
            '12306': this._generate12306Link(from, to, date),
            ctrip: this._generateCtripLink(from, to, date),
            qunar: this._generateQunarLink(from, to, date),
            tongcheng: this._generateTongchengLink(from, to, date)
        };

        return {
            success: true,
            bookingCompleted: false,     // 链接生成不等于完成订票
            actionRequired: true,        // 需要用户手动操作
            trainNumber,
            from,
            to,
            date,
            platform,
            platformName: platformConfig.name,
            platformIcon: platformConfig.icon,
            platformColor: platformConfig.color,
            directUrl: links[platform] || links.train,
            allLinks: links,
            message: `Open ${platformConfig.name} and complete booking manually`
        };
    }

    /**
     * @description 生成 12306 预订链接
     * @param {string} from - 出发站
     * @param {string} to - 到达站
     * @param {string} date - 出发日期
     * @returns {string} 12306 查询链接
     * @private
     */
    _generate12306Link(from, to, date) {
        return `https://kyfw.12306.cn/otn/leftTicket/init?` +
            `leftTicketDTO.train_date=${encodeURIComponent(date)}&` +
            `leftTicketDTO.from_station=${encodeURIComponent(from)}&` +
            `leftTicketDTO.to_station=${encodeURIComponent(to)}&` +
            `purpose_codes=ADULT`;
    }

    /**
     * @description 生成携程预订链接
     * @param {string} from - 出发地
     * @param {string} to - 目的地
     * @param {string} date - 出发日期
     * @returns {string} 携程查询链接
     * @private
     */
    _generateCtripLink(from, to, date) {
        return `https://flights.ctrip.com/international/search/oneway-${encodeURIComponent(from)}-${encodeURIComponent(to)}?depdate=${encodeURIComponent(date)}&cabin=y_s_c_common&adult=1&child=0`;
    }

    /**
     * @description 生成去哪儿预订链接
     * @param {string} from - 出发地
     * @param {string} to - 目的地
     * @param {string} date - 出发日期
     * @returns {string} 去哪儿查询链接
     * @private
     */
    _generateQunarLink(from, to, date) {
        return `https://www.qunar.com/site/oneshot/zh_cn/?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}`;
    }

    /**
     * @description 生成同程预订链接
     * @param {string} from - 出发地
     * @param {string} to - 目的地
     * @returns {string} 同程查询链接
     * @private
     */
    _generateTongchengLink(from, to, date) {
        return `https://www.ly.com/train/station/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
    }

    /**
     * @description 格式化用户选择的票务信息为可读文本
     * @param {Object} [selection={}] - 用户选择的票务信息
     * @param {string} [selection.trainNumber] - 车次/航班号
     * @param {string} [selection.from] - 出发地
     * @param {string} [selection.to] - 目的地
     * @param {string} [selection.date] - 出发日期
     * @param {string} [selection.departureTime] - 出发时间
     * @param {string} [selection.arrivalTime] - 到达时间
     * @param {string} [selection.duration] - 行程时长
     * @param {number} [selection.price] - 价格
     * @param {string} [selection.seatType] - 座位类型
     * @returns {{summary: string, details: Object}} 格式化后的选择信息
     */
    formatSelection(selection = {}) {
        return {
            summary: `${selection.trainNumber || 'unknown'} | ${selection.departureTime || '?'} - ${selection.arrivalTime || '?'} | ${selection.price ?? '?'}`,
            details: {
                trainNumber: selection.trainNumber,
                from: selection.from,
                to: selection.to,
                date: selection.date,
                time: `${selection.departureTime || '?'} - ${selection.arrivalTime || '?'}`,
                duration: selection.duration,
                price: selection.price,
                seatType: selection.seatType
            }
        };
    }
}

module.exports = new BookingAssistant();
