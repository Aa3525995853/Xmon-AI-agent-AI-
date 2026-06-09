/**
 * @file ttsRoutes.js
 * @description TTS 路由模块，处理文字转语音相关的 HTTP 请求，包括服务状态查询、
 *              语音合成（音频/JSON）、语音列表、风格标签、服务测试及流式语音合成
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const express = require('express');
const router = express.Router();
const ttsController = require('../controllers/ttsController');
const textProcessor = require('../utils/textProcessor');
const { requestCache } = require('../middleware/cache');
const { ttsSynthesizeValidation, ttsStreamValidation } = require('../middleware/validator');

/** TTS 合成缓存 TTL：5 分钟 */
const TTS_CACHE_TTL_MS = 5 * 60 * 1000;

/** TTS 默认语速 */
const DEFAULT_SPEECH_RATE = 0.9;

/** TTS 默认音量 */
const DEFAULT_VOLUME = 0.7;

/** 背压控制高水位标记：256KB（音频数据较大） */
const BP_HIGH_WATER_MARK = 256 * 1024;

/** 背压控制低水位标记：64KB */
const BP_LOW_WATER_MARK = 64 * 1024;

/** 背压控制最大队列大小 */
const BP_MAX_QUEUE_SIZE = 100;

// ============================================================
// 模块名称：TTS 状态与资源查询
// 功能说明：服务状态、语音列表、风格标签、可用性测试
// ============================================================

/**
 * @description 获取 TTS 服务当前状态
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 TTS 服务状态信息
 */
router.get('/status', async (req, res) => {
    try {
        const status = ttsController.getTTSStatus();
        res.json(status);
    } catch (error) {
        console.error('[TTS] 获取状态失败:', error);
        res.status(500).json({ 
            error: '获取 TTS 状态失败', 
            message: error.message 
        });
    }
});

// ============================================================
// 模块名称：语音合成
// 功能说明：文本转语音（音频流/JSON/base64）、流式语音合成
// ============================================================

/**
 * @description 文本转语音接口，返回音频 Buffer。应用 5 分钟缓存，使用 express-validator 验证输入
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.text - 要转换的文本
 * @param {string} [req.body.emotion='neutral'] - 情感标签
 * @param {number} [req.body.speech_rate=0.9] - 语速
 * @param {number} [req.body.volume=0.7] - 音量
 * @param {Object} res - Express 响应对象
 * @returns {Buffer} 音频 Buffer（Content-Type 为 audio/wav 或 audio/mp3）
 */
router.post('/synthesize',
    ttsSynthesizeValidation,
    requestCache({ ttl: TTS_CACHE_TTL_MS, keyFields: ['body'] }),
    async (req, res) => {
        try {
            const { text, emotion, speech_rate, volume } = req.body;

            console.log('[TTS] 合成请求:', text.substring(0, 50));

            // 清理文本，移除style标签等
            const cleanedText = textProcessor.cleanForTTS(text) || text;

            const { buffer: audioBuffer, format } = await ttsController.textToSpeech(cleanedText, {
                emotion: emotion || 'neutral',
                speech_rate: speech_rate || DEFAULT_SPEECH_RATE,
                volume: volume || DEFAULT_VOLUME
            });

            const contentType = format === 'wav' ? 'audio/wav' : 'audio/mp3';
            res.set('Content-Type', contentType);
            res.set('Content-Length', audioBuffer.length);
            res.send(audioBuffer);

        } catch (error) {
            console.error('[TTS] 合成失败:', error);
            res.status(500).json({
                error: '语音合成失败',
                message: error.message
            });
        }
    }
);

/**
 * @description 文本转语音接口（返回 JSON），包含 base64 编码的音频数据。应用 5 分钟缓存
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.text - 要转换的文本
 * @param {string} [req.body.emotion='neutral'] - 情感标签
 * @param {number} [req.body.speech_rate=0.9] - 语速
 * @param {number} [req.body.volume=0.7] - 音量
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、format、audio（base64）、text
 */
router.post('/synthesize-json', requestCache({ ttl: TTS_CACHE_TTL_MS, keyFields: ['body'] }), async (req, res) => {
    try {
        const { text, emotion, speech_rate, volume } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: '请提供要转换的文本' });
        }

        console.log('[TTS] 合成请求(JSON):', text.substring(0, 50));

        // 清理文本，移除style标签等
        const cleanedText = textProcessor.cleanForTTS(text) || text;

        const { buffer: audioBuffer, format } = await ttsController.textToSpeech(cleanedText, {
            emotion: emotion || 'neutral',
            speech_rate: speech_rate || 0.9,
            volume: volume || 0.7
        });

        res.json({
            success: true,
            format: format,
            audio: audioBuffer.toString('base64'),
            text: cleanedText.substring(0, 100)
        });

    } catch (error) {
        console.error('[TTS] 合成失败:', error);
        res.status(500).json({ 
            error: '语音合成失败', 
            message: error.message 
        });
    }
});

/**
 * @description 获取 TTS 支持的语音列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 voices 数组
 */
router.get('/voices', (req, res) => {
    try {
        const voices = ttsController.getVoiceList();
        res.json({
            success: true,
            voices: voices
        });
    } catch (error) {
        console.error('[TTS] 获取语音列表失败:', error);
        res.status(500).json({ 
            error: '获取语音列表失败', 
            message: error.message 
        });
    }
});

/**
 * @description 获取 TTS 支持的语音风格标签列表
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 styles 数组
 */
router.get('/styles', (req, res) => {
    try {
        const styles = ttsController.getStyleTags();
        res.json({
            success: true,
            styles: styles
        });
    } catch (error) {
        console.error('[TTS] 获取风格标签失败:', error);
        res.status(500).json({ 
            error: '获取风格标签失败', 
            message: error.message 
        });
    }
});

/**
 * @description 测试 TTS 服务是否可用
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success、available 和 message
 */
router.get('/test', async (req, res) => {
    try {
        const isAvailable = await ttsController.testTTS();
        res.json({
            success: true,
            available: isAvailable,
            message: isAvailable ? 'TTS 服务可用' : 'TTS 服务不可用'
        });
    } catch (error) {
        console.error('[TTS] 测试失败:', error);
        res.status(500).json({ 
            error: 'TTS 测试失败', 
            message: error.message,
            available: false
        });
    }
});

/**
 * @description 流式文本转语音接口（SSE），带背压控制防止客户端过载
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.text - 要转换的文本
 * @param {string} [req.body.emotion='neutral'] - 情感标签
 * @param {Object} res - Express 响应对象（SSE 流）
 * @returns {void} 通过 SSE 事件流推送音频片段
 */
router.post('/stream', async (req, res) => {
    try {
        const { text, emotion } = req.body;

        if (!text) {
            return res.status(400).json({ error: '请提供要转换的文本' });
        }

        // 清理文本，移除style标签等
        const cleanedText = textProcessor.cleanForTTS(text) || text;

        // 设置 SSE 响应头
        res.set('Content-Type', 'text/event-stream');
        res.set('Cache-Control', 'no-cache');
        res.set('Connection', 'keep-alive');
        res.set('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // 创建背压控制器
        const { createBackpressureController } = require('../utils/backpressure');
        const bpController = createBackpressureController(res, {
            highWaterMark: BP_HIGH_WATER_MARK,
            lowWaterMark: BP_LOW_WATER_MARK,
            maxQueueSize: BP_MAX_QUEUE_SIZE
        });

        await ttsController.streamTextToSpeech(cleanedText, bpController.sendSSE, {
            emotion: emotion || 'neutral'
        });

        await bpController.flush();

    } catch (error) {
        console.error('[TTS] 流式合成失败:', error);
        try {
            res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        } catch (e) {}
    }
});

module.exports = router;
