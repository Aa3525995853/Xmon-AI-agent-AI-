/**
 * @file stream_processor.js
 * @description 流式数据处理器，处理 LLM SSE 流
 * @module services
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */
const { logger } = require('../utils/logger');
const { LLM_CONFIG } = require('../config/streamChatConfig');
const { createTTSProcessor } = require('./tts_processor');
const { splitBySentence, mergeShortSentences } = require('../utils/sentence_processor');

/**
 * @description 清理文本末尾的垃圾内容
 * 清理重复的结尾句子、不完整的 Markdown 语法等
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function cleanGarbageTail(text) {
    if (!text || text.length < 10) return text;

    let cleaned = text;

    // 移除末尾重复的最后一句话（完全相同或几乎相同）
    // 检测模式：同一内容连续出现2次以上
    const lastSentence = findLastCompleteSentence(cleaned);
    if (lastSentence && lastSentence.length > 5) {
        const escaped = lastSentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(${escaped})\\s*\\1+$`, 'g');
        cleaned = cleaned.replace(pattern, lastSentence);
    }

    // 移除末尾不完整的 Markdown 公式（行内公式 $$...$$ 或单行公式）
    const lines = cleaned.split('\n');
    const lastLine = lines[lines.length - 1] || '';

    // 如果最后一行是不完整的公式行，移除它
    if (lastLine.trim().startsWith('$$') && !lastLine.trim().endsWith('$$') && !lastLine.trim().endsWith('$$')) {
        lines.pop();
        cleaned = lines.join('\n');
    }

    // 移除末尾不完整的 LaTeX 公式（$...$，可能被截断）
    cleaned = cleaned.replace(/\$[^$\n]{1,30}$/gm, '');

    // 移除末尾被截断的公式片段（如 "5 - t =" 后面没有内容）
    cleaned = cleaned.replace(/[=+\-*/^]{2,}\s*$/g, '');
    cleaned = cleaned.replace(/[a-zA-Z0-9_()]{1,3}\s*$/g, '');

    // 移除末尾的垃圾字符（连续重复的标点或无意义字符）
    cleaned = cleaned.replace(/[，。、！？；：""''（）()\s]+$/g, '');
    cleaned = cleaned.replace(/\.{3,}$/g, '');
    cleaned = cleaned.replace(/…{2,}$/g, '');

    // 最后检查：如果文本以不完整的句子结尾，尝试找到最后一个完整句子
    // 但要保护数学公式（$...$ 或 $$...$$ 格式）和 LaTeX 表达式
    const finalLine = cleaned.split('\n').pop() || '';
    const isMathLine = /^\s*(\$\$|\$[a-zA-Z]|\\[a-zA-Z]|∑|∫|∏|∪|∩)/.test(finalLine.trim());
    const isShortSymbolLine = finalLine.length < 3 || /^[=+\-*/^<>]+$/.test(finalLine);

    // 只有非数学公式的短符号行才移除
    if (isShortSymbolLine && !isMathLine) {
        const parts = cleaned.split('\n');
        if (parts.length > 1) {
            parts.pop();
            cleaned = parts.join('\n');
        }
    }

    return cleaned.trim();
}

/**
 * @description 找到最后一个完整句子
 * @param {string} text - 文本
 * @returns {string|null} 最后一个完整句子
 */
function findLastCompleteSentence(text) {
    if (!text) return null;
    // 按句子边界分割，找最后一个非空句子
    const sentences = text.split(/[。！？.!?；;]/);
    // 从后往前找第一个非空句子
    for (let i = sentences.length - 1; i >= 0; i--) {
        const last = sentences[i]?.trim();
        if (last && last.length > 2) {
            return last;
        }
    }
    return null;
}

/**
 * @description 将缓冲区flush到TTS队列
 * @param {string} buffer - 缓冲区
 * @param {Object} tts - TTS处理器
 * @returns {string} 追加的文本
 */
function flushBuffer(buffer, tts) {
    if (!buffer.trim()) return '';
    const sentences = splitBySentence(buffer);
    const merged = mergeShortSentences(sentences);
    tts.enqueueSentences(merged);
    return merged.join('');
}

/**
 * @description 发送文本片段到前端（增量发送）
 * @param {string} text - 文本内容
 * @param {Function} sendSSE - SSE发送函数
 * @param {Object} state - 状态对象
 * @returns {void}
 */
function sendTextDelta(text, sendSSE, state) {
    if (!text) return;
    // 发送文本增量，前端会累积显示
    sendSSE('text', { text });
    // 记录已发送的文本长度
    state.sentTextLength = (state.sentTextLength || 0) + text.length;
    logger.debug('[流式] 发送文本增量', { length: text.length, totalSent: state.sentTextLength });
}

/**
 * @description 解析SSE行，提取delta内容
 * MiMo API 流式响应包含两个字段：
 * - content: 实际回复内容
 * - reasoning_content: 思考/推理过程
 * 两者都需要拼接才能获得完整内容
 * @param {string} line - SSE行
 * @returns {string|null} delta内容或null
 */
function extractDelta(line) {
    if (!line.startsWith('data: ')) return null;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') return null;
    try {
        const delta = JSON.parse(data).choices?.[0]?.delta;
        // 拼接两个字段获取完整内容
        const content = delta?.content || '';
        const reasoning = delta?.reasoning_content || '';
        const combined = content + reasoning;
        if (combined) {
            logger.debug('[流式] extractDelta', {
                contentLen: content.length,
                reasoningLen: reasoning.length,
                combinedLen: combined.length,
                preview: combined.substring(0, 20)
            });
        }
        return combined || null;
    } catch (e) {
        logger.error('[流式] extractDelta解析失败', { error: e.message, line: line.substring(0, 100) });
        return null;
    }
}

/**
 * @description 处理缓冲区，分割句子并入队TTS，同时发送文本到前端
 * @param {string} buffer - 缓冲区
 * @param {Object} tts - TTS处理器
 * @param {Function} sendSSE - SSE发送函数
 * @param {Object} state - 状态对象
 * @returns {string} 剩余内容
 */
function processBufferChunk(buffer, tts, sendSSE, state) {
    const sentences = splitBySentence(buffer);
    const sentenceCount = sentences.length;
    if (sentenceCount > 1) {
        const flushed = sentences.slice(0, -1);
        const remaining = sentences[sentenceCount - 1];
        const merged = mergeShortSentences(flushed);
        tts.enqueueSentences(merged);
        // 发送已完成的句子到前端
        const flushedText = merged.join('');
        if (flushedText) {
            sendTextDelta(flushedText, sendSSE, state);
            // 注意：不要在这里更新 state.fullText，因为 extractDelta 已经更新了
            // 如果重复添加，会导致内容重复
        }
        logger.debug('[流式] processBufferChunk flush', {
            flushedCount: sentences.length - 1,
            remainingLength: remaining.length,
            bufferLength: buffer.length
        });
        return remaining;
    }
    return buffer;
}

/**
 * @description 完成流处理，刷新剩余缓冲区并发送最终文本
 * @param {Object} state - 状态对象
 * @param {Object} tts - TTS处理器
 * @param {string} reason - 结束原因
 */
function finalizeStream(state, tts, reason) {
    if (state.finalized) return null;
    state.finalized = true;
    clearTimeout(state.timeoutId);

    // 处理可能残留的不完整 SSE 行
    if (state.sseBuffer.trim()) {
        const delta = extractDelta(state.sseBuffer);
        if (delta) {
            state.fullText += delta;
            state.buffer += delta;
            logger.debug('[流式] 处理残留buffer', { sseBuffer: state.sseBuffer.substring(0, 100), delta: delta.substring(0, 50) });
        }
    }

    // flush 剩余缓冲区
    const flushed = flushBuffer(state.buffer, tts);
    // 注意：flushed 内容已在流式过程中通过 processBufferChunk 添加到 fullText
    // 此处不再重复添加，避免句子重复

    logger.info('[流式] 结束', { reason, fullTextLength: state.fullText.length, flushedLength: flushed.length, bufferLeft: state.buffer.length });
    tts.markAllQueued();

    // 发送剩余的文本（未在流式过程中发送的部分）
    if (flushed) {
        sendTextDelta(flushed, state.sendSSE, state);
    }

    // 清理垃圾内容（用于记录日志，不发送清理后的文本避免重复）
    const cleanedText = cleanGarbageTail(state.fullText);
    logger.debug('[流式] 垃圾清理', {
        beforeLength: state.fullText.length,
        afterLength: cleanedText.length,
        diff: state.fullText.length - cleanedText.length
    });

    // 详细日志：追踪每个处理步骤的文本长度（stripMarkdown 已移除，仅用于调试）
    const textCleaner = require('./text_cleaner');
    const displayText = textCleaner.cleanForDisplay(cleanedText) || cleanedText;
    logger.debug('[流式] cleanForDisplay', {
        beforeLength: cleanedText.length,
        afterLength: displayText.length,
        diff: cleanedText.length - displayText.length
    });

    // 最终发送：只发送清理后的文本长度摘要，不发送完整文本（避免重复）
    // 前端已经在流式过程中接收并显示了所有文本
    const finalTextLength = displayText.length > 0 ? displayText.length : cleanedText.length;
    logger.info('[流式] 发送最终文本', {
        finalTextLength,
        preview: (displayText || cleanedText).substring(0, 50),
        originalFullTextLength: state.fullText.length,
        sentTextLength: state.sentTextLength || 0
    });

    return state.fullText;  // 返回原始完整文本而非清理后的
}

/**
 * @description 注册流数据事件处理器
 * @param {Object} streamData - 流数据对象
 * @param {Object} state - 状态对象
 * @param {Object} tts - TTS处理器
 * @param {number} startTime - 开始时间戳
 */
function registerStreamHandlers(streamData, state, tts, startTime) {
    let lastLogTime = Date.now();
    let lastLogLength = 0;
    let deltaTotal = 0;
    let totalLines = 0;
    let dataLines = 0;
    let nullDeltas = 0;

    streamData.on('data', (chunk) => {
        const rawData = chunk.toString();
        state.sseBuffer += rawData;
        const lines = state.sseBuffer.split('\n');
        state.sseBuffer = lines.pop();
        totalLines += lines.length;

        for (const line of lines) {
            const isDataLine = line.startsWith('data: ');
            if (isDataLine) dataLines++;

            const delta = extractDelta(line);
            if (delta) {
                deltaTotal++;
                state.fullText += delta;
                state.buffer += delta;
            } else if (isDataLine) {
                nullDeltas++;
            }

            const now = Date.now();
            // 每秒打印一次进度
            if (now - lastLogTime > 1000) {
                logger.info('[流式] 进度', {
                    deltaTotal,
                    nullDeltas,
                    totalLines,
                    dataLines,
                    fullTextLength: state.fullText.length,
                    deltaCharsThisSec: state.fullText.length - lastLogLength,
                    elapsed: now - startTime
                });
                lastLogTime = now;
                lastLogLength = state.fullText.length;
            }

            if (!state.firstChunk && delta) {
                logger.info('[流式] 首字延迟', { latency: Date.now() - startTime });
                state.firstChunk = true;
            }

            if (delta) {
                state.buffer = processBufferChunk(state.buffer, tts, state.sendSSE, state);
            }
        }
    });

    streamData.on('end', () => {
        const fullText = finalizeStream(state, tts, 'end');
        tts.waitForDrain().then(() => {
            state.sendSSE('audio_end', {});
            state.resolve(fullText);
        }).catch(state.reject);
    });

    streamData.on('error', (err) => {
        if (state.finalized) return;
        clearTimeout(state.timeoutId);
        logger.error('[流式] 流错误', { error: err.message, length: state.fullText.length });
        tts.stopProcessing();
        const fullText = finalizeStream(state, tts, 'error');
        if (fullText?.trim()) state.resolve(fullText);
        else state.reject(err);
    });

    streamData.on('close', () => {
        if (state.finalized) return;
        logger.warn('[流式] 连接关闭', { length: state.fullText.length });
        const fullText = finalizeStream(state, tts, 'close');
        if (fullText?.trim()) state.resolve(fullText);
    });
}

/**
 * @description 处理流式响应数据
 * @param {Object} streamResponse - axios流式响应
 * @param {number} startTime - 开始时间戳
 * @param {string} text - 用户原始输入
 * @param {Function} sendSSE - SSE发送函数
 * @param {string} personality - 性格模式
 * @param {string|null} dialect - 方言模式
 * @returns {Promise<string>} 完整文本
 */
function processStreamData(streamResponse, startTime, text, sendSSE, personality = 'normal', dialect = null) {
    return new Promise((resolve, reject) => {
        const state = {
            fullText: '',
            buffer: '',
            firstChunk: false,
            sseBuffer: '',
            timeoutId: setTimeout(() => reject(new Error('LLM 超时')), LLM_CONFIG.streamTimeout),
            sendSSE,
            resolve,
            reject,
            finalized: false
        };
        const tts = createTTSProcessor(text, sendSSE, personality, dialect);
        registerStreamHandlers(streamResponse.data, state, tts, startTime);
    });
}

module.exports = { processStreamData };