/**
 * @file digest_routes.js
 * @description 信息消化路由模块，让小梦能理解并消化用户分享的各种信息，
 *              支持文件上传分析、网页内容分析、文本分析、内容问答、历史记录查询及类型查询
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const InfoDigestService = require('../services/info_digest_service');
const { logger } = require('../utils/logger');

const router = express.Router();
const infoDigestService = InfoDigestService.instance;

// ============================================================
// 模块名称：文件上传配置
// 功能说明：文件大小限制、MIME 类型白名单、multer 存储配置
// ============================================================

/** 文件上传大小上限：10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 允许上传的文件 MIME 类型列表 */
const ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
];

// 配置 multer 存储
const storage = multer.memoryStorage(); // 使用内存存储，方便处理
const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('不支持的文件类型'), false);
        }
    }
});

// ============================================================
// 模块名称：文件上传分析 API
// 功能说明：上传文件并根据类型自动路由到对应处理方法
// ============================================================

/**
 * @description 上传文件并分析，根据文件类型自动路由到对应的处理方法
 *              （图片/PDF/Excel/CSV/Word/音频/视频）
 * @param {Object} req - Express 请求对象
 * @param {Object} req.file - multer 上传的文件对象
 * @param {string} [req.body.question] - 针对文件内容的问题（可选）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含分析结果
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    const { question } = req.body;

    if (!file) {
        return res.status(400).json({
            success: false,
            error: '请上传文件'
        });
    }

    try {
        const type = infoDigestService.detectType(file.originalname, file.mimetype);
        let result;

        switch (type) {
            case infoDigestService.ContentType?.IMAGE:
                result = await infoDigestService.processImage(file.buffer, question);
                break;
            case infoDigestService.ContentType?.PDF:
                result = await infoDigestService.processPDF(file.buffer, question, file.originalname);
                break;
            case infoDigestService.ContentType?.EXCEL:
            case infoDigestService.ContentType?.CSV:
                result = await infoDigestService.processExcel(file.buffer, question, file.originalname);
                break;
            case infoDigestService.ContentType?.WORD:
                result = await infoDigestService.processWord(file.buffer, question, file.originalname);
                break;
            case infoDigestService.ContentType?.AUDIO:
                result = await infoDigestService.processAudio(file.buffer, question, file.originalname);
                break;
            case infoDigestService.ContentType?.VIDEO:
                result = await infoDigestService.processVideo(file.buffer, question, file.originalname);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: '不支持的文件类型'
                });
        }

        logger.info(`[消化路由] 文件分析完成: ${file.originalname}, 成功: ${result.success}`);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('[消化路由] 上传处理失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：网页/文本分析 API
// 功能说明：网页内容分析、纯文本分析
// ============================================================

/**
 * @description 分析网页内容，抓取指定 URL 的页面并提取关键信息
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.url - 待分析的网页 URL
 * @param {string} [req.body.question] - 针对网页内容的问题（可选）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含网页分析结果
 */
router.post('/url', express.json(), async (req, res) => {
    const { url, question } = req.body;

    if (!url) {
        return res.status(400).json({
            success: false,
            error: '请提供网址'
        });
    }

    try {
        const result = await infoDigestService.processURL(url, question);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('[消化路由] URL 处理失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 分析文本内容，对用户提供的纯文本进行信息提取和摘要
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.text - 待分析的文本内容
 * @param {string} [req.body.question] - 针对文本内容的问题（可选）
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含文本分析结果
 */
router.post('/text', express.json(), async (req, res) => {
    const { text, question } = req.body;

    if (!text) {
        return res.status(400).json({
            success: false,
            error: '请提供文本内容'
        });
    }

    try {
        const result = await infoDigestService.processText(text, question);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('[消化路由] 文本处理失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：内容问答与历史查询 API
// 功能说明：基于已分析内容的问答、历史记录查询、支持类型查询
// ============================================================

/**
 * @description 基于已分析的内容回答问题，通过 contentId 关联之前上传/分析的内容
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.contentId - 已分析内容的唯一标识
 * @param {string} req.body.question - 针对该内容的问题
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含问答结果
 */
router.post('/ask', express.json(), async (req, res) => {
    const { contentId, question } = req.body;

    if (!contentId || !question) {
        return res.status(400).json({
            success: false,
            error: '缺少参数'
        });
    }

    try {
        const result = await infoDigestService.answerAboutContent(contentId, question);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('[消化路由] 问答处理失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @description 获取已分析的内容列表，返回所有历史消化记录
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 count 和 items 数组
 */
router.get('/history', (req, res) => {
    const content = infoDigestService.getStoredContent();

    res.json({
        success: true,
        count: content.length,
        items: content
    });
});

/**
 * @description 获取信息消化服务支持的文件类型列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 supportedTypes 数组（type、extensions、description）
 */
router.get('/types', (req, res) => {
    res.json({
        success: true,
        supportedTypes: [
            { type: 'image', extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'], description: '图片/截图' },
            { type: 'pdf', extensions: ['.pdf'], description: 'PDF 文档' },
            { type: 'excel', extensions: ['.xlsx', '.xls'], description: 'Excel 表格' },
            { type: 'csv', extensions: ['.csv'], description: 'CSV 文件' },
            { type: 'word', extensions: ['.docx', '.doc'], description: 'Word 文档' },
            { type: 'audio', extensions: ['.mp3', '.wav', '.ogg', '.webm', '.m4a'], description: '音频文件' },
            { type: 'video', extensions: ['.mp4', '.avi', '.mkv', '.webm'], description: '视频文件' }
        ]
    });
});

module.exports = router;
