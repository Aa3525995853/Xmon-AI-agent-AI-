/**
 * @file system_control_handler.js
 * @description 系统控制处理器，处理系统控制命令的确认和执行
 * @module services
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */
const textCleaner = require('./text_cleaner');
const systemControl = require('./system_control');
const { getCurrentTTSProvider } = require('./tts_registry');
const { AUDIO_CONFIG, SYSTEM_CONTROL_CONFIG } = require('../config/streamChatConfig');
const { logger } = require('../utils/logger');

/**
 * @description 获取 TTS 服务实例
 * @returns {Object} TTS 服务提供者
 */
function getTTS() {
    return getCurrentTTSProvider();
}

/**
 * @description 发送 TTS 音频
 * @param {Function} sendSSE - SSE 发送函数
 * @param {string} text - TTS 文本
 * @param {string} userMessage - 用户原始输入
 * @returns {Promise<void>}
 */
async function sendTTSAudio(sendSSE, text, userMessage) {
    const tts = getTTS();
    if (tts.generateVoiceStreamCallback) {
        await tts.generateVoiceStreamCallback(text, (pcmBuffer) => {
            sendSSE('audio', {
                pcm: pcmBuffer.toString('base64'),
                sampleRate: AUDIO_CONFIG.sampleRate,
                format: AUDIO_CONFIG.format
            });
        }, { userMessage, enhance: false });
    }
}

/**
 * @description 处理需要确认的系统控制命令
 * @param {Object} systemResult - 系统控制结果
 * @param {string} text - 用户原始输入
 * @param {Function} sendSSE - SSE 发送函数
 * @returns {Promise<void>}
 */
async function handleSystemControlWithConfirm(systemResult, text, sendSSE) {
    logger.info('[流式] 系统控制需要确认', { intent: systemResult.intent?.type });

    const replyText = textCleaner.clean(systemResult.message) || systemResult.message;
    sendSSE('text', { text: replyText });

    try {
        await sendTTSAudio(sendSSE, replyText, text);
    } catch (e) {
        logger.error('[流式] TTS 生成失败', { error: e.message });
    } finally {
        sendSSE('audio_end', {});
    }

    sendSSE('done', {});
}

/**
 * @description 处理直接执行的系统控制命令
 * @param {Object} systemResult - 系统控制结果
 * @param {string} text - 用户原始输入
 * @param {Function} sendSSE - SSE 发送函数
 * @returns {Promise<void>}
 */
async function handleSystemControlDirect(systemResult, text, sendSSE) {
    logger.info('[流式] 系统控制直接执行', { intent: systemResult.intent?.type });

    try {
        const execResult = await systemControl.executeConfirmed(systemResult.intent);
        const displayName = SYSTEM_CONTROL_CONFIG.toolNames[systemResult.intent.type] || systemResult.intent.type;
        const rawReplyText = execResult.success
            ? SYSTEM_CONTROL_CONFIG.successTemplate(displayName)
            : SYSTEM_CONTROL_CONFIG.errorTemplate(execResult.message);
        const replyText = textCleaner.clean(rawReplyText) || rawReplyText;

        sendSSE('text', { text: replyText });

        try {
            await sendTTSAudio(sendSSE, replyText, text);
        } catch (ttsError) {
            logger.error('[流式] TTS 生成失败', { error: ttsError.message });
        } finally {
            sendSSE('audio_end', {});
        }
    } catch (e) {
        logger.error('[流式] 系统控制执行失败', { error: e.message });
        sendSSE('text', { text: SYSTEM_CONTROL_CONFIG.fallbackError });
        sendSSE('audio_end', {});
    }

    sendSSE('done', {});
}

module.exports = {
    handleSystemControlWithConfirm,
    handleSystemControlDirect
};