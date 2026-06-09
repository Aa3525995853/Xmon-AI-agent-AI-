/**
 * @file chatRoutes.js
 * @description 聊天路由模块，处理文本聊天、语音聊天、流式语音/文本聊天、
 *              对话历史查询与清空等核心交互接口
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const chatController = require('../controllers/chatController');
const ttsController = require('../controllers/ttsController');
const { handleStreamChat } = require('../controllers/streamChatController');
const { speechToText } = require('../services/asr_service');
const { requestCache } = require('../middleware/cache');
const { chatTextValidation, chatStreamValidation } = require('../middleware/validator');
const { optionalAuth, authenticateToken } = require('../middleware/auth');

// 运行时路径配置（统一管理 data/logs/uploads）
const { UPLOADS_DIR, ensureDir } = require('../config/runtimePaths');

/** 对话历史默认返回条数 */
const DEFAULT_HISTORY_LIMIT = 6;

/** 文件名随机数上限，用于生成唯一文件名 */
const FILENAME_RANDOM_MAX = 1E9;

const router = express.Router();

// ============================================================
// 模块名称：用户身份与文件上传配置
// 功能说明：获取用户ID、multer 存储配置
// ============================================================

/**
 * @description 获取当前请求的用户 ID。启用多用户认证时从 req.user 获取，
 *              否则返回 'legacy' 作为默认用户标识
 * @param {Object} req - Express 请求对象
 * @returns {string} 用户 ID
 */
function getUserId(req) {
    // 如果启用了多用户认证，从 req.user 获取
    if (process.env.ENABLE_AUTH === 'true' && req.user) {
        return req.user.userId;
    }
    // 否则返回 legacy
    return 'legacy';
}

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 确保上传目录存在
        ensureDir(UPLOADS_DIR);
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * FILENAME_RANDOM_MAX);
        const ext = path.extname(file.originalname) || '.wav';
        cb(null, uniqueName + ext);
    }
});

const upload = multer({ storage: storage });

// ============================================================
// 模块名称：文本聊天 API
// 功能说明：文本消息发送与 LLM 回复
// ============================================================

/**
 * @description 文本聊天接口，接收用户文本消息并返回 LLM 回复（JSON 格式）
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.message - 用户输入的文本消息
 * @param {string} [req.body.personality] - 人格模式（如 normal、gentle、tsundere）
 * @param {string} [req.body.dialect] - 方言设置
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含聊天回复内容
 */
router.post('/text',
    chatTextValidation,
    optionalAuth,  // 可选认证
    async (req, res) => {
        try {
            const { message, personality, dialect } = req.body;
            const userId = getUserId(req);

            console.log(`[路由] /api/chat/text 收到消息: "${message}"`);

            const result = await chatController.handleTextChat(message, personality, dialect, userId);
            res.json(result);

        } catch (error) {
            console.error('[错误] 文本聊天接口错误:', error);
            res.status(500).json({
                error: '小梦系统错误',
                message: error.message
            });
        }
    }
);

// ============================================================
// 模块名称：语音聊天 API
// 功能说明：语音上传→ASR→LLM→TTS 全流程、流式语音/文本聊天
// ============================================================

/**
 * @description 语音聊天接口，上传音频文件后经 ASR 识别→LLM 处理→TTS 合成返回音频。
 *              支持系统控制命令、沉默模式、敏感信息跳过 TTS 等多种场景。
 * @param {Object} req - Express 请求对象
 * @param {Object} req.file - multer 上传的音频文件对象
 * @param {string} [req.body.personality='normal'] - 人格模式
 * @param {string} [req.body.dialect] - 方言设置
 * @param {Object} res - Express 响应对象
 * @returns {Buffer|Object} 音频 Buffer（成功时）或 JSON 响应（异常/特殊场景时）
 */
router.post('/', upload.single('audio'), optionalAuth, async (req, res) => {
    const audioFile = req.file;
    let audioPath = null;

    try {
        if (!audioFile) {
            return res.status(400).send('主人，你没说话呀！');
        }

        audioPath = audioFile.path;
        console.log('[上传] 收到音频文件:', audioFile.size, 'bytes');

        // 1. 语音转文字
        const userText = await speechToText(audioPath);
        console.log(`[ASR] 识别结果: ${userText}`);

        // 2. 处理聊天逻辑
        const personality = req.body && req.body.personality ? req.body.personality : 'normal';
        const dialect = req.body && req.body.dialect ? req.body.dialect : null;
        const userId = getUserId(req);
        const result = await chatController.handleVoiceChat(userText, personality, dialect, userId);

        // 3. 如果是系统控制命令，直接返回文本
        if (result.isSystemControl) {
            try {
                 const ttsContent = result.ttsText || result.text;
                 const { buffer: audioBuffer, format } = await ttsController.textToSpeech(ttsContent, {
              userMessage: userText,
                  dialect: result.dialect
                });
                const contentType = format === 'wav' ? 'audio/wav' : 'audio/mp3';
                res.set('Content-Type', contentType);
                return res.send(audioBuffer);
            } catch (ttsError) {
                console.error('[TTS] 语音生成失败，回退返回文本:', ttsError.message);
                return res.json({ message: result.text, ttsError: ttsError.message });
            }
        }

        // 4. 如果选择沉默
        if (result.silence) {
            return res.json({ 
                message: '', 
                emotion: result.emotion,
                speech_rate: result.speech_rate,
                volume: result.volume,
                action: result.action,
                silence: true
            });
        }

        // 5. 生成语音回复（如果包含敏感信息，跳过TTS）
        if (!result.ttsText) {
            console.log('[TTS] 内容包含敏感信息，跳过语音合成');
            return res.json({
                message: result.text,
                emotion: result.emotion,
                speech_rate: result.speech_rate,
                volume: result.volume,
                action: result.action,
                silence: true,
                skipTTS: true,
                reason: '包含敏感信息'
            });
        }

        try {
            const { buffer: audioBuffer, format } = await ttsController.textToSpeech(result.ttsText, {
                userMessage: userText,
                emotion: result.emotion,
                speech_rate: result.speech_rate,
              volume: result.volume,
                dialect: result.dialect
            });
            const contentType = format === 'wav' ? 'audio/wav' : 'audio/mp3';
            res.set('Content-Type', contentType);
            res.send(audioBuffer);
        } catch (ttsError) {
            console.error('[TTS] 语音生成失败，回退返回文本:', ttsError.message);
            res.json({ 
                message: result.text, 
                emotion: result.emotion,
                speech_rate: result.speech_rate,
                volume: result.volume,
                action: result.action,
                silence: result.silence,
                ttsError: ttsError.message 
            });
        }

    } catch (error) {
        console.error('[错误] 语音聊天接口错误:', error);
        res.status(500).json({ 
            error: '小梦系统错误', 
            message: error.message 
        });
    } finally {
        // 清理临时音频文件
        if (audioPath) {
            fs.unlink(audioPath, (err) => {
                if (err) {
                    console.error('[清理] 删除临时文件失败:', audioPath, err.message);
                } else {
                    console.log('[清理] 已删除临时音频文件:', audioPath);
                }
            });
        }
    }
});

/**
 * @description 流式语音聊天接口（SSE），上传音频后以 Server-Sent Events 逐步推送处理结果，
 *              内置背压控制防止客户端过载
 * @param {Object} req - Express 请求对象
 * @param {Object} req.file - multer 上传的音频文件对象
 * @param {string} [req.body.personality='normal'] - 人格模式
 * @param {string} [req.body.dialect] - 方言设置
 * @param {Object} res - Express 响应对象（SSE 流）
 * @returns {void} 通过 SSE 事件流推送结果
 */
router.post('/stream', upload.single('audio'), optionalAuth, async (req, res) => {
    const audioFile = req.file;
    let audioPath = null;

    try {
        if (!audioFile) {
            return res.status(400).json({ error: '没有音频文件' });
        }

        audioPath = audioFile.path;
        console.log('[流式] 收到音频文件:', audioFile.size, 'bytes');

        // 设置 SSE 响应头
        res.set('Content-Type', 'text/event-stream');
        res.set('Cache-Control', 'no-cache');
        res.set('Connection', 'keep-alive');
        res.set('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // 语音转文字
        const userText = await speechToText(audioPath);
        console.log(`[流式] 识别结果: ${userText}`);

        // 处理流式聊天（传入res启用背压控制）
        console.log('[流式调试] req.body:', req.body);
        const personality = req.body && req.body.personality ? req.body.personality : 'normal';
        const dialect = req.body && req.body.dialect ? req.body.dialect : null;
        const userId = getUserId(req);
        console.log(`[流式] 性格: ${personality}, 方言: ${dialect || '普通话'}, userId: ${userId}`);
        await handleStreamChat(userText, res, personality, dialect, userId);

    } catch (error) {
        console.error('[流式] 错误:', error);
        try {
            res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        } catch (e) {}
    } finally {
        if (audioPath) {
            fs.unlink(audioPath, (err) => {
                if (!err) console.log('[清理] 已删除临时音频文件:', audioPath);
            });
        }
    }
});

/**
 * @description 文本输入 + 流式语音回复接口，用户发送文本消息后以 SSE 流式返回语音片段，
 *              支持图片输入（base64 编码）
 * @param {Object} req - Express 请求对象
 * @param {string} req.body.message - 用户输入的文本消息
 * @param {string} [req.body.image] - base64 编码的图片数据（可选）
 * @param {string} [req.body.imageMimeType='image/png'] - 图片 MIME 类型
 * @param {string} [req.body.personality='normal'] - 人格模式
 * @param {string} [req.body.dialect] - 方言设置
 * @param {Object} res - Express 响应对象（SSE 流）
 * @returns {void} 通过 SSE 事件流推送结果
 */
router.post('/text-stream', upload.none(), optionalAuth, async (req, res) => {
    const message = req.body.message || (typeof req.body === 'string' ? req.body : null);
    const image = req.body.image || null;
    const imageMimeType = req.body.imageMimeType || 'image/png';
    console.log('[流式接口] 收到请求:', { message: message?.substring(0, 50) || '空', hasImage: !!image });

    if (!message && !image) {
        return res.status(400).json({ error: '没有消息内容' });
    }

    try {
        res.set('Content-Type', 'text/event-stream');
        res.set('Cache-Control', 'no-cache');
        res.set('Connection', 'keep-alive');
        res.set('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const personality = req.body && req.body.personality ? req.body.personality : 'normal';
        const dialect = req.body && req.body.dialect ? req.body.dialect : null;
        const userId = getUserId(req);
        const imageData = image ? { base64: image, mimeType: imageMimeType } : null;
        console.log(`[文本流式] 性格: ${personality}, 方言: ${dialect || '普通话'}, userId: ${userId}, 图片: ${!!imageData}`);
        await handleStreamChat(message || '请分析这张图片', res, personality, dialect, userId, imageData);

    } catch (error) {
        console.error('[文本流式] 错误:', error);
        try {
            res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        } catch (e) {}
    }
});

// ============================================================
// 模块名称：对话历史 API
// 功能说明：清空/获取对话历史记录
// ============================================================

/**
 * @description 清空当前用户的对话历史记录
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success: true 和确认消息
 */
router.post('/clear', optionalAuth, (req, res) => {
    try {
        const userId = getUserId(req);
        chatController.clearChatHistory(userId);
        res.json({ success: true, message: '对话历史已清空' });
    } catch (error) {
        console.error('[错误] 清空历史失败:', error);
        res.status(500).json({ error: '清空历史失败', message: error.message });
    }
});

/**
 * @description 获取当前用户的对话历史记录
 * @param {Object} req - Express 请求对象
 * @param {number} [req.query.limit=6] - 返回的历史消息条数上限
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 success 和 history 数组
 */
router.get('/history', optionalAuth, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || DEFAULT_HISTORY_LIMIT;
        const userId = getUserId(req);
        const history = chatController.getChatHistory(limit, userId);
        res.json({ success: true, history });
    } catch (error) {
        console.error('[错误] 获取历史失败:', error);
        res.status(500).json({ error: '获取历史失败', message: error.message });
    }
});



module.exports = router;
