/**
 * @file ticket_routes.js
 * @description 订票路由模块，提供火车票/高铁票/机票搜索、意图识别、订票链接打开、
 *              搜索历史查询、价格对比、参数解析、国际机票搜索、城市/货币列表及货币转换等 API 接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const ticketService = require('../services/ticket_service');

// ============================================================
// 模块名称：火车票/机票搜索
// 功能说明：搜索火车票、高铁票、机票，解析自然语言订票参数
// ============================================================

/**
 * @description 搜索火车票/高铁票/机票
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.from - 出发地城市名
 * @param {string} req.body.to - 目的地城市名
 * @param {string} [req.body.date] - 出发日期，格式 YYYY-MM-DD
 * @param {string} [req.body.type] - 票种类型：high_speed（高铁）、train（火车）、plane（机票）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含搜索结果 data、用户友好回复文本 reply
 */
router.post('/search', async (req, res) => {
    try {
        const { from, to, date, type } = req.body;

        if (!from && !to) {
            return res.status(400).json({
                success: false,
                error: '请提供出发地和目的地',
                example: {
                    from: '北京',
                    to: '上海',
                    date: '2024-06-15',
                    type: 'high_speed' // high_speed, train, plane
                }
            });
        }

        // 如果只有一个城市名，尝试解析完整参数
        let params = { from, to, date, type };
        if (!from || !to) {
            const text = from || to || '';
            const parsed = ticketService.parseTicketParams(text + ' ' + (date || ''));
            params = {
                from: from || parsed.from,
                to: to || parsed.to,
                date: date || parsed.date,
                type: type || parsed.type
            };
        }

        logger.info('[订票路由] 搜索请求:', params);

        const results = await ticketService.search(params);

        // 生成用户友好的回复文本
        const replyText = ticketService.generateReplyText(params, results);

        res.status(results.success ? 200 : 503).json({
            success: results.success === true,
            data: results,
            error: results.success ? undefined : results.message,
            reply: replyText
        });

    } catch (error) {
        logger.error('[订票路由] 搜索失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：意图识别与参数解析
// 功能说明：识别用户文本中的订票意图，解析出发地/目的地/日期等参数
// ============================================================

/**
 * @description 识别用户输入文本中的订票意图，提取出发地、目的地、日期等关键信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.text - 待分析的文本内容（也可通过 message 或 query 字段传入）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含识别出的意图数据 data
 */
router.post('/recognize', async (req, res) => {
    try {
        const text = req.body.text || req.body.message || req.body.query;

        if (!text || !text.trim()) {
            return res.status(400).json({
                success: false,
                error: '请提供要分析的文字'
            });
        }

        const intent = await ticketService.recognizeBookingIntent(text);

        res.json({
            success: true,
            data: intent
        });

    } catch (error) {
        logger.error('[订票路由] 意图识别失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：订票链接与历史
// 功能说明：打开订票链接、查询搜索历史、价格对比
// ============================================================

/**
 * @description 打开指定平台的订票链接，调用系统浏览器或应用打开
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.platform - 订票平台标识（如 12306、ctrip 等）
 * @param {string} req.body.url - 要打开的订票链接地址
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含打开结果 data
 */
router.post('/open', async (req, res) => {
    try {
        const { platform, url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: '请提供要打开的链接'
            });
        }

        logger.info(`[订票路由] 打开链接: ${platform} - ${url}`);

        const result = await ticketService.openBookingLink(platform, url);

        res.status(result.success ? 200 : 202).json({
            success: result.success === true,
            data: result
        });

    } catch (error) {
        logger.error('[订票路由] 打开链接失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取订票搜索历史记录列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含历史搜索记录数组 data
 */
router.get('/history', (req, res) => {
    try {
        const history = ticketService.getSearchHistory();

        res.json({
            success: true,
            data: history
        });

    } catch (error) {
        logger.error('[订票路由] 获取历史失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 生成不同票种/车次之间的价格对比报告
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.from - 出发地城市名
 * @param {string} req.body.to - 目的地城市名
 * @param {string} [req.body.date] - 出发日期
 * @param {string} [req.body.type] - 票种类型
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含对比报告 report 和搜索数据 data
 */
router.post('/compare', async (req, res) => {
    try {
        const { from, to, date, type } = req.body;

        if (!from || !to) {
            return res.status(400).json({
                success: false,
                error: '请提供出发地和目的地'
            });
        }

        const params = { from, to, date, type };
        const results = await ticketService.search(params);
        const report = ticketService.generateComparisonReport(results);

        res.status(report.success ? 200 : 503).json({
            success: report.success === true,
            report,
            data: results
        });

    } catch (error) {
        logger.error('[订票路由] 对比报告生成失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 解析自然语言文本中的订票参数（出发地、目的地、日期、票种）
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.text - 待解析的自然语言文本
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含解析出的参数 data（from、to、date、type）
 */
router.post('/parse', (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: '请提供要解析的文字'
            });
        }

        const params = ticketService.parseTicketParams(text);

        res.json({
            success: true,
            data: params
        });

    } catch (error) {
        logger.error('[订票路由] 参数解析失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 清除订票服务的缓存数据
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，确认缓存已清除
 */
router.post('/clear-cache', (req, res) => {
    const result = ticketService.clearCache();

    res.json({
        success: true,
        message: '缓存已清除'
    });
});

// ============================================================
// 模块名称：国际机票与辅助功能
// 功能说明：国际机票搜索、城市/货币列表、货币转换
// ============================================================

/**
 * @description 搜索国际机票，支持往返日期、乘客人数和舱位等级
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.from - 出发城市
 * @param {string} req.body.to - 目的地城市
 * @param {string} req.body.date - 出发日期
 * @param {string} [req.body.returnDate] - 返程日期（可选）
 * @param {number} [req.body.passengers] - 乘客人数（可选）
 * @param {string} [req.body.cabinClass] - 舱位等级（可选，如 economy/business/first）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含国际机票搜索结果 data 和回复文本 reply
 */
router.post('/international', async (req, res) => {
    try {
        const { from, to, date, returnDate, passengers, cabinClass } = req.body;

        if (!from || !to || !date) {
            return res.status(400).json({
                success: false,
                error: '请提供出发城市、目的地和出发日期'
            });
        }

        logger.info(`[订票路由] 国际机票搜索: ${from} → ${to}`);

        const results = await ticketService.searchInternational({
            from, to, date, returnDate, passengers, cabinClass
        });

        const replyText = ticketService.generateInternationalReply({ from, to, date }, results);

        res.status(results.success ? 200 : 503).json({
            success: results.success === true,
            data: results,
            error: results.success ? undefined : results.message,
            reply: replyText
        });

    } catch (error) {
        logger.error('[订票路由] 国际机票搜索失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取订票服务支持的城市列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含城市列表 data 和城市数量 count
 */
router.get('/cities', (req, res) => {
    try {
        const result = ticketService.getSupportedCities();

        res.status(result.success ? 200 : 503).json({
            success: result.success === true,
            data: result.cities || [],
            count: result.cities?.length || 0,
            error: result.success ? undefined : result.message
        });

    } catch (error) {
        logger.error('[订票路由] 获取城市列表失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取订票服务支持的货币列表（用于国际机票价格展示）
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含货币列表 data 和货币数量 count
 */
router.get('/currencies', (req, res) => {
    try {
        const result = ticketService.getSupportedCurrencies();

        res.status(result.success ? 200 : 503).json({
            success: result.success === true,
            data: result.currencies || [],
            count: result.currencies?.length || 0,
            error: result.success ? undefined : result.message
        });

    } catch (error) {
        logger.error('[订票路由] 获取货币列表失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 货币转换，将指定金额从源货币转换为目标货币
 * @param {Object} req - Express 请求对象
 * @param {number} req.body.amount - 待转换的金额
 * @param {string} req.body.from - 源货币代码（如 CNY、USD）
 * @param {string} req.body.to - 目标货币代码
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含转换结果 data（amount、from、fromFormatted、to、toFormatted、converted）
 */
router.post('/convert', (req, res) => {
    try {
        const { amount, from, to } = req.body;

        if (!amount || !from || !to) {
            return res.status(400).json({
                success: false,
                error: '请提供金额、源货币和目标货币'
            });
        }

        const result = ticketService.convertCurrency(amount, from, to);
        const fromFormatted = ticketService.formatPrice(amount, from);
        const toFormatted = ticketService.formatPrice(result, to);

        res.json({
            success: true,
            data: {
                amount: parseFloat(amount),
                from,
                fromFormatted,
                to: to,
                toFormatted,
                converted: result
            }
        });

    } catch (error) {
        logger.error('[订票路由] 货币转换失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
