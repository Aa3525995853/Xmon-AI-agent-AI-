/**
 * @file search_engine.js
 * @description 票务搜索引擎 - 提供票务搜索接口，
 *              当前无真实提供商集成，搜索始终返回失败以避免生成虚假数据
 * @module ticket_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 核心类：TicketSearchEngine
// 功能说明：票务搜索（当前为占位实现，待接入真实提供商）
// ============================================================

class TicketSearchEngine {
    constructor() {
        /** 支持的搜索平台列表 */
        this.platforms = ['12306', 'ctrip', 'qunar', 'tongcheng'];
    }

    /**
     * @description 搜索票务信息（当前无真实提供商集成，始终返回失败）
     * @param {Object} query - 查询参数
     * @param {string} query.from - 出发地
     * @param {string} query.to - 目的地
     * @param {string} query.date - 出发日期
     * @param {string} query.type - 票务类型
     * @returns {Promise<{success: boolean, message: string, query: Object, searchedAt: number}>} 搜索结果（当前始终失败）
     */
    async search(query) {
        const { from, to, date, type } = query || {};
        logger.info(`[TicketSearch] unavailable real search: ${from} -> ${to}, ${date}, ${type}`);

        // 无真实提供商集成时返回失败，不编造票务数据
        return {
            success: false,
            message: 'Ticket search has no real provider integration',
            query,
            searchedAt: Date.now()
        };
    }
}

module.exports = new TicketSearchEngine();
