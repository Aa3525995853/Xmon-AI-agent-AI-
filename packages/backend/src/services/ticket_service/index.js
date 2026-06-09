/**
 * @file index.js
 * @description 票务服务入口 - 整合搜索、比价和订票链接生成功能，
 *              提供统一的票务查询和预订接口
 * @module ticket_service
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块，避免循环依赖
// ============================================================

let _searchEngine = null;
let _priceComparator = null;
let _bookingAssistant = null;

/**
 * @description 延迟加载搜索引擎模块
 * @returns {Object} TicketSearchEngine 实例
 */
function getSearchEngine() {
    if (!_searchEngine) _searchEngine = require('./search_engine');
    return _searchEngine;
}

/**
 * @description 延迟加载比价器模块
 * @returns {Object} PriceComparator 实例
 */
function getPriceComparator() {
    if (!_priceComparator) _priceComparator = require('./price_comparator');
    return _priceComparator;
}

/**
 * @description 延迟加载订票助手模块
 * @returns {Object} BookingAssistant 实例
 */
function getBookingAssistant() {
    if (!_bookingAssistant) _bookingAssistant = require('./booking_assistant');
    return _bookingAssistant;
}

// ============================================================
// 常量定义
// ============================================================

/** 预订平台配置，包含名称、搜索 URL、图标和主题色 */
const BOOKING_PLATFORMS = {
    train: {
        name: '12306',
        searchUrl: 'https://www.12306.cn/index/',
        icon: 'train',
        color: '#007bff'
    },
    ctrip: {
        name: 'Ctrip',
        searchUrl: 'https://www.ctrip.com/',
        icon: 'flight',
        color: '#ff6600'
    },
    qunar: {
        name: 'Qunar',
        searchUrl: 'https://www.qunar.com/',
        icon: 'travel',
        color: '#00bcd4'
    },
    tongcheng: {
        name: 'Tongcheng',
        searchUrl: 'https://www.ly.com/',
        icon: 'ticket',
        color: '#e91e63'
    }
};

/** 票务类型枚举 */
const TicketType = {
    TRAIN: 'train',          // 普通火车
    HIGH_SPEED: 'high_speed', // 高铁
    PLANE: 'plane'            // 飞机
};

/** 座位类型枚举 */
const SeatType = {
    BUSINESS: 'business',           // 商务座
    FIRST_CLASS: 'first_class',     // 一等座
    SECOND_CLASS: 'second_class',   // 二等座
    SOFT_SLEEPER: 'soft_sleeper',   // 软卧
    HARD_SLEEPER: 'hard_sleeper',   // 硬卧
    SOFT_SEAT: 'soft_seat',         // 软座
    HARD_SEAT: 'hard_seat'          // 硬座
};

/** 搜索历史最大保留条数 */
const MAX_SEARCH_HISTORY = 50;

/** 搜索历史返回条数 */
const SEARCH_HISTORY_RETURN_COUNT = 20;

// ============================================================
// 核心类：TicketService
// 功能说明：票务搜索、比价、订票链接生成和意图识别
// ============================================================

class TicketService {
    constructor() {
        this.searchEngine = getSearchEngine();
        this.priceComparator = getPriceComparator();
        this.bookingAssistant = getBookingAssistant();
        this.searchHistory = [];

        logger.info('[TicketService] initialized');
    }

    /**
     * @description 搜索票务信息，调用搜索引擎查询
     * @param {Object} query - 查询参数
     * @param {string} query.from - 出发地
     * @param {string} query.to - 目的地
     * @param {string} query.date - 出发日期（YYYY-MM-DD）
     * @param {string} [query.type=TicketType.TRAIN] - 票务类型
     * @param {Object} [options={}] - 搜索选项
     * @returns {Promise<{success: boolean, query?: Object, results?: Array, searchedAt?: number, platforms?: Object, message?: string}>} 搜索结果
     */
    async search(query = {}, options = {}) {
        const { from, to, date, type = TicketType.TRAIN } = query;
        if (!from || !to || !date) {
            return { success: false, message: 'Ticket search requires from, to and date' };
        }

        try {
            const result = await this.searchEngine.search({ from, to, date, type, options });
            if (!result.success) {
                return {
                    success: false,
                    message: result.message || 'Ticket search failed',
                    query: result.query || { from, to, date, type },
                    platforms: BOOKING_PLATFORMS
                };
            }

            return {
                success: true,
                query: result.query,
                results: result.results,
                searchedAt: result.searchedAt,
                platforms: BOOKING_PLATFORMS
            };
        } catch (error) {
            logger.error('[TicketService] search failed:', error);
            return { success: false, message: error.message };
        } finally {
            // 无论搜索成功与否，都记录搜索历史
            this.searchHistory.push({ query: { from, to, date, type }, searchedAt: Date.now() });
            // 超出最大保留条数时截断，保留最新的记录
            if (this.searchHistory.length > MAX_SEARCH_HISTORY) this.searchHistory = this.searchHistory.slice(-MAX_SEARCH_HISTORY);
        }
    }

    /**
     * @description 对搜索结果进行比价分析
     * @param {Object} searchResults - 搜索结果对象
     * @returns {Promise<Object>} 比价结果，包含排序、统计和推荐
     */
    async comparePrices(searchResults) {
        return this.priceComparator.compare(searchResults);
    }

    /**
     * @description 生成预订链接，跳转到对应平台
     * @param {Object} selection - 用户选择的票务信息
     * @returns {Promise<Object>} 包含预订链接的结果
     */
    async generateBookingLink(selection) {
        return this.bookingAssistant.generateLink(selection, BOOKING_PLATFORMS);
    }

    /**
     * @description 从自然语言文本中解析票务搜索参数
     * @param {string} [text=''] - 用户输入的自然语言文本
     * @returns {{from: string|null, to: string|null, date: string|null, type: string, confidence: number}} 解析出的参数和置信度
     */
    parseTicketParams(text = '') {
        const normalized = String(text).trim();
        // 提取日期（YYYY-MM-DD 格式）
        const date = normalized.match(/\d{4}-\d{1,2}-\d{1,2}/)?.[0] || null;
        // 提取出发地和目的地（支持"到"、->、→、"去"等分隔符）
        const routeMatch = normalized.match(/(.+?)(?:到|->|→|去)(.+?)(?:\s|$)/);

        return {
            from: routeMatch?.[1]?.trim() || null,
            to: routeMatch?.[2]?.trim() || null,
            date,
            // 根据关键词判断票务类型
            type: /飞机|机票|flight|plane/i.test(normalized) ? TicketType.PLANE : TicketType.TRAIN,
            // 置信度：成功匹配路线时为 0.6，否则为 0.2
            confidence: routeMatch ? 0.6 : 0.2
        };
    }

    /**
     * @description 识别用户文本中的订票意图
     * @param {string} [text=''] - 用户输入文本
     * @returns {{success: boolean, intent: string, params: Object, message: string}} 意图识别结果
     */
    async recognizeBookingIntent(text = '') {
        const params = this.parseTicketParams(text);
        return {
            success: Boolean(params.from && params.to),
            intent: 'ticket_search',
            params,
            message: params.from && params.to
                ? 'Ticket search parameters recognized'
                : 'Could not recognize complete ticket search parameters'
        };
    }

    /**
     * @description 根据搜索结果生成回复文本
     * @param {Object} params - 搜索参数
     * @param {Object} result - 搜索结果
     * @returns {string} 回复文本
     */
    generateReplyText(params, result) {
        if (!result || result.success !== true) {
            return result?.message || 'Ticket search is unavailable because no real provider is configured';
        }

        return `Found ${result.results?.length || 0} ticket result(s) for ${params.from} -> ${params.to} on ${params.date}`;
    }

    /**
     * @description 生成比价报告
     * @param {Object} result - 搜索结果
     * @returns {Object} 比价报告，搜索失败时返回错误信息
     */
    generateComparisonReport(result) {
        if (!result || result.success !== true) {
            return {
                success: false,
                message: result?.message || 'Cannot compare prices without successful ticket search results'
            };
        }
        return this.priceComparator.compare(result);
    }

    /**
     * @description 打开预订链接（服务端无法直接打开浏览器，返回手动跳转提示）
     * @param {string} platform - 平台标识
     * @param {string} url - 预订 URL
     * @returns {{success: boolean, actionRequired: boolean, bookingCompleted: boolean, platform: string, url: string, message: string}} 手动跳转提示
     */
    async openBookingLink(platform, url) {
        if (!url) return { success: false, message: 'Missing booking URL' };

        // 服务端无法替用户打开浏览器，返回明确的交接信息
        // 调用方应展示链接让用户手动打开，不应标记为已完成预订
        return {
            success: false,
            actionRequired: true,
            bookingCompleted: false,
            platform,
            url,
            message: 'Open this URL manually to continue booking'
        };
    }

    /**
     * @description 清除搜索引擎缓存
     * @returns {{success: boolean, cleared: boolean}} 清除结果
     */
    clearCache() {
        if (this.searchEngine.clearCache) this.searchEngine.clearCache();
        return { success: true, cleared: true };
    }

    /**
     * @description 搜索国际票务（当前无真实提供商集成）
     * @param {Object} query - 查询参数
     * @returns {Promise<{success: boolean, message: string, query: Object}>} 始终返回失败
     */
    async searchInternational(query) {
        return {
            success: false,
            message: 'International ticket search has no real provider integration',
            query
        };
    }

    /**
     * @description 生成国际票务搜索回复文本
     * @param {Object} params - 搜索参数
     * @param {Object} result - 搜索结果
     * @returns {string} 回复文本
     */
    generateInternationalReply(params, result) {
        if (!result || result.success !== true) {
            return result?.message || 'International ticket search is unavailable';
        }
        return `Found ${result.results?.length || 0} international ticket result(s)`;
    }

    /**
     * @description 获取最近的搜索历史
     * @returns {Array} 最近的搜索历史记录，按时间倒序
     */
    getSearchHistory() {
        return this.searchHistory.slice(-SEARCH_HISTORY_RETURN_COUNT).reverse();
    }

    /**
     * @description 获取支持的城市列表（当前无真实提供商集成）
     * @returns {{success: boolean, message: string, cities: Array}} 始终返回空列表
     */
    getSupportedCities() {
        return {
            success: false,
            message: 'Supported-city list has no real provider integration',
            cities: []
        };
    }

    /**
     * @description 获取支持的货币列表（当前无真实提供商集成）
     * @returns {{success: boolean, message: string, currencies: Array}} 始终返回空列表
     */
    getSupportedCurrencies() {
        return {
            success: false,
            message: 'Currency list has no real provider integration',
            currencies: []
        };
    }

    /**
     * @description 货币转换（当前无真实汇率提供商集成）
     * @throws {Error} 始终抛出异常
     */
    convertCurrency() {
        throw new Error('Currency conversion has no real exchange-rate provider integration');
    }

    /**
     * @description 格式化价格显示
     * @param {number} amount - 金额
     * @param {string} [currency='CNY'] - 货币代码
     * @returns {string} 格式化后的价格字符串
     */
    formatPrice(amount, currency = 'CNY') {
        return `${currency} ${Number(amount).toFixed(2)}`;
    }

    /**
     * @description 获取预订平台配置
     * @returns {Object} 平台配置映射
     */
    getPlatforms() {
        return BOOKING_PLATFORMS;
    }

    /**
     * @description 获取座位类型枚举
     * @returns {Object} 座位类型映射
     */
    getSeatTypes() {
        return SeatType;
    }

    /**
     * @description 获取票务类型枚举
     * @returns {Object} 票务类型映射
     */
    getTicketTypes() {
        return TicketType;
    }
}

module.exports = TicketService;
