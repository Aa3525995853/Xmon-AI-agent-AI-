/**
 * @file streamChatController.js
 * @description 流式聊天控制器，协调系统控制、任务编排和 LLM 对话
 * @module controllers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-09
 */

const textCleaner = require('../services/text_cleaner');
const { legacyMemoryService: memoryService } = require('../services/memory_service');
const { getCurrentTTSProvider } = require('../services/tts_registry');
const { createBackpressureController } = require('../utils/backpressure');
const { logger } = require('../utils/logger');
const { processStreamData } = require('../services/stream_processor');
const { handleSystemControlWithConfirm, handleSystemControlDirect } = require('../services/system_control_handler');
const { buildLLMMessages, createLLMStreamRequest } = require('../services/llm_stream_builder');
const systemControl = require('../services/system_control');

// 导入配置
const {
    BACKPRESSURE_CONFIG,
    AUDIO_CONFIG,
    LLM_CONFIG,
    SYSTEM_CONTROL_CONFIG,
    CONVERSATION_CONFIG,
    getToolInstructions,
    INTENT_PATTERNS
} = require('../config/streamChatConfig');

// ============================================================
// 模块名称：TTS 服务
// ============================================================

/**
 * @description 获取 TTS 服务实例
 * @returns {Object} TTS 服务提供者
 */
function getTTS() {
    return getCurrentTTSProvider();
}

// ============================================================
// 模块名称：背压控制
// ============================================================

/**
 * @description 设置背压控制器
 * @param {Function|Object} sendSSEOrRes - SSE 发送函数或 Express 响应对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} { sendSSE, bpController, res }
 */
function setupBackpressure(sendSSEOrRes, res = null) {
    let bpController = null;
    let sendSSE = sendSSEOrRes;
    let actualRes = res;

    if (sendSSEOrRes?.write && sendSSEOrRes?.end) {
        actualRes = sendSSEOrRes;
        bpController = createBackpressureController(actualRes, {
            highWaterMark: BACKPRESSURE_CONFIG.highWaterMark,
            lowWaterMark: BACKPRESSURE_CONFIG.lowWaterMark,
            maxQueueSize: BACKPRESSURE_CONFIG.maxQueueSize
        });
        sendSSE = bpController.sendSSE;
    } else if (res) {
        bpController = createBackpressureController(res, {
            highWaterMark: BACKPRESSURE_CONFIG.highWaterMark,
            lowWaterMark: BACKPRESSURE_CONFIG.lowWaterMark,
            maxQueueSize: BACKPRESSURE_CONFIG.maxQueueSize
        });
        sendSSE = bpController.sendSSE;
    }

    return { sendSSE, bpController, res: actualRes };
}

// ============================================================
// 模块名称：流式 LLM 处理
// ============================================================

/**
 * @description 处理流式 LLM 对话
 * @param {string} text - 用户输入文本
 * @param {Function} sendSSE - SSE 发送函数
 * @param {string} personality - 性格模式
 * @param {string|null} dialect - 方言模式
 * @param {boolean} needsTools - 是否需要工具调用
 * @returns {Promise<void>}
 */
async function handleStreamLLM(text, sendSSE, personality, dialect = null, needsTools = false) {
    const startTime = Date.now();
    try {
        if (needsTools) {
            await handleToolMode(text, sendSSE, personality, dialect);
        } else {
            await handleStreamMode(text, sendSSE, personality, dialect, startTime);
        }
    } catch (e) {
        logger.error('[流式] LLM流式失败，回退', { error: e.message });
        await handleLLMFallback(text, sendSSE);
    }
}

/**
 * @description 工具调用模式
 * @param {string} text - 用户输入文本
 * @param {Function} sendSSE - SSE 发送函数
 * @param {string} personality - 性格模式
 * @param {string|null} dialect - 方言模式
 * @returns {Promise<void>}
 */
async function handleToolMode(text, sendSSE, personality, dialect) {
    sendSSE('thinking', { text: '正在执行任务...' });
    const heartbeatInterval = setInterval(() => {
        try { sendSSE('heartbeat', {}); } catch (e) {}
    }, 15000);

    try {
        const tools = systemControl.getToolDefinitions();
        const { generateReply } = require('../services/llm_service');
        const customInstructions = getToolInstructions();
        const llmResponse = await generateReply(text, text, tools, personality, dialect, { customInstructions, skipWorkflow: true });

        const responseText = typeof llmResponse === 'object'
            ? (llmResponse.text || llmResponse.content || llmResponse.message || '')
            : String(llmResponse || '');

        const displayText = textCleaner.cleanForDisplay(responseText) || responseText;
        sendSSE('text', { text: displayText });
        memoryService.addConversation('user', text);
        memoryService.addConversation('assistant', displayText);
        logger.info('[流式] 工具调用完成', { length: displayText.length });
    } finally {
        clearInterval(heartbeatInterval);
    }
}

/**
 * @description 流式模式
 * @param {string} text - 用户输入文本
 * @param {Function} sendSSE - SSE 发送函数
 * @param {string} personality - 性格模式
 * @param {string|null} dialect - 方言模式
 * @param {number} startTime - 开始时间戳
 * @returns {Promise<void>}
 */
async function handleStreamMode(text, sendSSE, personality, dialect, startTime) {
    const streamResponse = await createLLMStreamRequest(text, personality);
    const fullText = await processStreamData(streamResponse, startTime, text, sendSSE, personality, dialect);
    logger.info('[流式] LLM完成', { length: fullText.length });

    memoryService.addConversation('user', text);
    const finalText = fullText || SYSTEM_CONTROL_CONFIG.defaultFallback;
    const displayText = textCleaner.cleanForDisplay(finalText) || finalText;
    memoryService.addConversation('assistant', displayText);
    // 注：stream_processor 已在流式过程中发送 text 事件到前端，这里无需重复发送
}

/**
 * @description LLM 回退处理
 * @param {string} text - 用户输入文本
 * @param {Function} sendSSE - SSE 发送函数
 * @returns {Promise<void>}
 */
async function handleLLMFallback(text, sendSSE) {
    try {
        const { generateReply } = require('../services/llm_service');
        const llmResponse = await generateReply(text, text, null);
        const replyText = typeof llmResponse === 'object' ? llmResponse.content : llmResponse;

        const displayText = textCleaner.cleanForDisplay(replyText) || replyText;
        const ttsText = textCleaner.clean(replyText) || replyText;

        sendSSE('text', { text: displayText });

        const tts = getTTS();
        if (tts.generateVoiceStreamCallback) {
            await tts.generateVoiceStreamCallback(ttsText, (pcmBuffer) => {
                sendSSE('audio', {
                    pcm: pcmBuffer.toString('base64'),
                    sampleRate: AUDIO_CONFIG.sampleRate,
                    format: AUDIO_CONFIG.format
                });
            }, { userMessage: text, enhance: false });
        }
        sendSSE('audio_end', {});
    } catch (e2) {
        logger.error('[流式] 回退也失败', { error: e2.message });
        sendSSE('text', { text: SYSTEM_CONTROL_CONFIG.networkError });
    }
}

// ============================================================
// 模块名称：意图检测
// ============================================================

/**
 * @description 检测用户意图
 * @param {string} text - 用户输入文本
 * @returns {Object} { route, taskType, isDataAnalysis, isComplexTask }
 */
function detectIntent(text) {
    const intentRouter = require('../services/intentRouter');
    const intentResult = intentRouter.route(text, { imageData: null });
    const isDataAnalysis = intentResult.taskType === 'data_analysis' || INTENT_PATTERNS.dataAnalysis.test(text);
    const isComplexTask = (intentResult.route === 'task' || intentResult.route === 'system_control') && !isDataAnalysis;
    return { route: intentResult.route, taskType: intentResult.taskType, isDataAnalysis, isComplexTask };
}

// ============================================================
// 模块名称：任务编排
// ============================================================

/**
 * @description 处理复杂任务编排
 * @param {string} text - 用户输入文本
 * @param {Function} sendSSE - SSE 发送函数
 * @param {string} userId - 用户ID
 * @returns {Promise<Object|null>} 任务结果
 */
async function handleTaskOrchestration(text, sendSSE, userId) {
    logger.info('[流式] 检测到复杂任务，尝试任务编排...');
    sendSSE('thinking', { text: '正在分析任务...' });
    const taskHeartbeat = setInterval(() => { try { sendSSE('heartbeat', {}); } catch (e) {} }, 15000);

    try {
        const taskOrchestrator = require('../services/task_orchestrator');
        const workflowResult = await taskOrchestrator.execute(text, { sessionId: userId || 'stream' });

        if (workflowResult.status === 'completed' && workflowResult.response) {
            if (workflowResult.pptGenerated) {
                sendSSE('text', { text: workflowResult.response });
                sendSSE('action', { type: 'ppt', filePath: workflowResult.filePath, downloadUrl: workflowResult.downloadUrl || workflowResult.filePath });
                return workflowResult;
            }
            const displayText = textCleaner.cleanForDisplay(workflowResult.response) || workflowResult.response;
            sendSSE('text', { text: displayText });
            return workflowResult;
        }
    } catch (taskErr) {
        logger.error('[流式] 任务编排失败，回退到LLM', { error: taskErr.message });
    } finally {
        clearInterval(taskHeartbeat);
    }
    return null;
}

// ============================================================
// 模块名称：主函数
// ============================================================

/**
 * @description 处理流式聊天
 * @param {string} text - 用户输入文本
 * @param {Function|Object} sendSSEOrRes - SSE 发送函数或 Express 响应对象
 * @param {string} personality - 性格模式
 * @param {string|null} dialect - 方言模式
 * @param {string|null} userId - 用户ID
 * @returns {Promise<void>}
 */
async function handleStreamChat(text, sendSSEOrRes, personality = 'normal', dialect = null, userId = null) {
    const { sendSSE, bpController } = setupBackpressure(sendSSEOrRes);

    try {
        // 系统控制拦截
        const systemResult = systemControl.fallbackRuleMatch(text);
        if (systemResult) {
            logger.info('[流式] 系统控制匹配', { intent: systemResult.intent?.type });
            systemResult.requireConfirm
                ? await handleSystemControlWithConfirm(systemResult, text, sendSSE)
                : await handleSystemControlDirect(systemResult, text, sendSSE);
            return;
        }

        // 意图检测
        const { route, isDataAnalysis, isComplexTask } = detectIntent(text);
        logger.info('[流式] 意图识别', { route, isDataAnalysis, isComplexTask });

        // 任务编排
        if (isComplexTask) {
            const result = await handleTaskOrchestration(text, sendSSE, userId);
            if (result) return;
        }

        // 工具调用检测
        const needsTools = route === 'task' || route === 'system_control' || INTENT_PATTERNS.chartOrCode.test(text) || isDataAnalysis;
        await handleStreamLLM(text, sendSSE, personality, dialect, needsTools);
    } finally {
        sendSSE('done', {});
        if (bpController) await bpController.flush();
    }
}

module.exports = {
    handleStreamChat
};