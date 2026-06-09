/**
 * @file price_comparator.js
 * @description 票务比价器 - 对搜索结果进行价格排序、统计分析和推荐，
 *              仅对真实搜索结果进行比价，不生成虚假数据
 * @module ticket_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义
// ============================================================

/** 价格评分权重：价格在综合评分中占 60% */
const PRICE_SCORE_WEIGHT = 0.6;

/** 时间评分权重：出发时间在综合评分中占 40% */
const TIME_SCORE_WEIGHT = 0.4;

/** 评分基准价格，用于归一化价格评分（越低分越高） */
const PRICE_BASELINE = 1000;

// ============================================================
// 核心类：PriceComparator
// 功能说明：票务比价、排序和推荐
// ============================================================

class PriceComparator {

    /**
     * @description 对搜索结果进行比价分析，包含排序、统计和推荐
     * @param {Object} searchResults - 搜索结果对象，需 success === true
     * @param {boolean} searchResults.success - 搜索是否成功
     * @param {Array} searchResults.results - 票务结果列表
     * @param {Object} searchResults.query - 原始查询参数
     * @returns {Promise<{success: boolean, query?: Object, all?: Array, sortedByPrice?: Array, sortedByTime?: Array, stats?: Object, recommendation?: Object, summary?: string, message?: string}>} 比价结果
     */
    async compare(searchResults) {
        // 仅对成功的搜索结果进行比价
        if (!searchResults || searchResults.success !== true) {
            return { success: false, message: 'No successful ticket search result to compare' };
        }

        const tickets = Array.isArray(searchResults.results) ? searchResults.results : [];
        if (tickets.length === 0) {
            return { success: false, message: 'Ticket search returned no comparable results' };
        }

        // 过滤出包含有效价格和时间信息的票务
        const comparable = tickets.filter(ticket =>
            Number.isFinite(Number(ticket.price)) &&
            ticket.departureTime &&
            ticket.arrivalTime
        );
        if (comparable.length === 0) {
            return { success: false, message: 'Ticket results do not contain comparable price/time data' };
        }

        // 按价格升序排序
        const byPrice = [...comparable].sort((a, b) => Number(a.price) - Number(b.price));
        // 按出发时间排序
        const byTime = [...comparable].sort((a, b) =>
            String(a.departureTime).localeCompare(String(b.departureTime))
        );

        // 计算价格统计信息
        const prices = comparable.map(ticket => Number(ticket.price));
        const stats = {
            min: Math.min(...prices),
            max: Math.max(...prices),
            avg: prices.reduce((sum, price) => sum + price, 0) / prices.length
        };

        return {
            success: true,
            query: searchResults.query,
            all: comparable,
            sortedByPrice: byPrice,
            sortedByTime: byTime,
            stats,
            recommendation: this._recommend(comparable),
            summary: this._generateSummary(comparable, stats)
        };
    }

    /**
     * @description 从可用票务中推荐最便宜和综合最优选项
     * @param {Array} tickets - 可比价的票务列表
     * @returns {{available: boolean, cheapest?: Object, best?: Object, reason?: Object}} 推荐结果
     * @private
     */
    _recommend(tickets) {
        // 仅推荐标记为可用的票务
        const available = tickets.filter(ticket => ticket.available === true);
        if (available.length === 0) return { available: false };

        // 找出最低价票务
        const cheapest = available.reduce((best, ticket) =>
            Number(ticket.price) < Number(best.price) ? ticket : best
        );
        // 找出综合评分最高的票务
        const best = available.reduce((currentBest, ticket) =>
            this._calculateScore(ticket) > this._calculateScore(currentBest) ? ticket : currentBest
        );

        return {
            available: true,
            cheapest,
            best,
            reason: {
                cheapest: 'lowest price',
                best: 'best price/time balance'
            }
        };
    }

    /**
     * @description 计算票务的综合评分（价格 + 时间）
     * @param {Object} ticket - 票务信息
     * @param {number|string} ticket.price - 价格
     * @param {string} ticket.departureTime - 出发时间
     * @returns {number} 综合评分（0~1 之间，越高越好）
     * @private
     */
    _calculateScore(ticket) {
        // 价格越低分越高，归一化到 0~1
        const priceScore = Math.max(0, (PRICE_BASELINE - Number(ticket.price)) / PRICE_BASELINE);
        const timeScore = this._getTimeScore(ticket.departureTime);
        return priceScore * PRICE_SCORE_WEIGHT + timeScore * TIME_SCORE_WEIGHT;
    }

    /**
     * @description 根据出发时间段计算时间评分
     * @param {string} time - 出发时间（HH:MM 格式）
     * @returns {number} 时间评分（0.4~1.0 之间）
     * @private
     */
    _getTimeScore(time) {
        const hour = Number.parseInt(String(time).split(':')[0], 10);
        // 早高峰（6-9点）评分最高
        if (hour >= 6 && hour <= 9) return 1;
        // 晚高峰（18-21点）评分次高
        if (hour >= 18 && hour <= 21) return 0.8;
        // 白天其他时段（10-17点）评分中等
        if (hour >= 10 && hour <= 17) return 0.6;
        // 夜间时段评分最低
        return 0.4;
    }

    /**
     * @description 生成比价摘要文本
     * @param {Array} tickets - 可比价的票务列表
     * @param {Object} stats - 价格统计信息
     * @param {number} stats.min - 最低价
     * @param {number} stats.max - 最高价
     * @param {number} stats.avg - 平均价
     * @returns {string} 比价摘要文本
     * @private
     */
    _generateSummary(tickets, stats) {
        const available = tickets.filter(ticket => ticket.available === true);
        return `Found ${tickets.length} comparable ticket(s), ${available.length} currently marked available. Price range: ${stats.min}-${stats.max}, average: ${Math.round(stats.avg)}.`;
    }
}

module.exports = new PriceComparator();
