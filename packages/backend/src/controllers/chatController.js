/**
 * @file chatController.js
 * @description 聊天业务逻辑控制器，处理文本聊天和语音聊天的核心业务逻辑，
 *              包括意图识别、系统控制、任务编排、LLM 对话、记忆管理等
 * @module controllers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { generateReply, generateReplyWithStyle } = require('../services/llm_service');
const textProcessor = require('../utils/textProcessor');
const textCleaner = require('../services/text_cleaner');
const systemControl = require('../services/system_control');
const { getMemoryService } = require('../services/memory_service');
const { legacyUserProfileLearner: userProfileLearner } = require('../services/user_profile_learner');
const path = require('path');
const fs = require('fs');

// ============================================================
// 模块名称：工具函数
// 功能说明：桌面路径获取、字符串安全转换、编码检测修复
// ============================================================

/**
 * @description 获取用户桌面路径，优先检测 OneDrive 桌面，回退到普通桌面
 * @returns {string} 桌面路径的绝对路径
 */
function _getDesktopPath() {
    const home = require('os').homedir();
    const onedriveDesktop = path.join(home, 'OneDrive', 'Desktop');
    const normalDesktop = path.join(home, 'Desktop');
    // 优先使用 OneDrive 桌面（企业用户常见配置）
    if (fs.existsSync(onedriveDesktop)) return onedriveDesktop;
    if (fs.existsSync(normalDesktop)) return normalDesktop;
    return normalDesktop;
}

// XMON 新增服务
const { legacySmartMemory: smartMemory } = require('../services/smart_memory');
const { legacyProactiveService: proactiveService } = require('../services/proactive_service');
const { legacyOnboardingService: onboardingService } = require('../services/onboarding_service');
const characterEvolution = require('../services/character_evolution');

// 自主学习服务
const skillLearner = require('../services/skill_learner');
const behaviorPredictor = require('../services/behavior_predictor');
const knowledgeGraph = require('../services/knowledge_graph');
const llmExtractor = require('../services/llm_extractor');

// 工作流引擎 - 统一使用 TaskOrchestrator
const taskOrchestrator = require('../services/task_orchestrator');

// 导入配置
const {
    DEFAULT_RESPONSE,
    INTENT_TYPES,
    SYSTEM_CONTROL_TYPES,
  SHORT_TERM_MEMORY,
    LOG_CONFIG,
    ERROR_MESSAGES
} = require('../config/chatConfig');

/**
 * @description 安全地将任意值转换为字符串，支持对象类型的智能提取
 * @param {*} val - 待转换的值
 * @param {string} fallback - 转换失败时的回退值，默认为空字符串
 * @returns {string} 转换后的字符串
 */
function ensureString(val, fallback = '') {
    if (typeof val === 'string') return val;
    if (val == null) return fallback;
    // 对象类型按优先级提取 content、message、text 字段
    if (typeof val === 'object') {
        return val.content || val.message || val.text || JSON.stringify(val);
    }
    return String(val);
}

/**
 * @description 文件扩展名白名单 - 这些格式的文本不应触发乱码检测
 *              因为它们可能包含路径、JSON、CSV 等结构化数据
 */
const SAFE_EXTENSIONS = [
    '.csv', '.json', '.xml', '.txt', '.md',
    '.xlsx', '.xls', '.log', '.yaml', '.yml'
];

/**
 * @description 检测是否为安全格式文本（不应触发乱码检测）
 *              包括文件路径、JSON 数组、CSV 表格数据等
 * @param {string} text - 待检测文本
 * @returns {boolean} true 表示是安全格式，不应检测乱码
 */
function isSafeFormatText(text) {
    if (!text || typeof text !== 'string') return false;

    // 检测是否像文件路径（Windows/Unix 路径、带扩展名的路径、常见文件夹路径）
    const filePathPatterns = [
        /^[A-Za-z]:\\[\w\\\-./]+/,           // Windows 路径 C:\Users\...
        /^\/[\w\/~.]+/,                      // Unix 路径 /home/...
        /\.\w{2,4}$/,                        // 末尾有扩展名
        /(Desktop|Downloads|Documents|data)\\\?[\w\-./]+/,  // 常见文件夹路径
    ];

    for (const pattern of filePathPatterns) {
        if (pattern.test(text.trim())) {
            return true;
        }
    }

    // 检测是否像 JSON 数组（常见于 CSV 或 JSON 数据）
    if (text.trim().startsWith('[') && text.trim().endsWith(']')) {
        return true;
    }

    // 检测是否像表格数据（逗号分隔的多行文本）
    const lines = text.trim().split('\n');
    if (lines.length > 1 && lines.every(line => line.includes(','))) {
        return true;
    }

    return false;
}

/**
 * @description 检测并修复文本编码问题，采用保守策略避免误判
 *              修复场景：高字节序列占比过高（可能是 UTF-8 被错误解码为 Latin1）
 *              以及连续问号序列（可能是 ASCII 解码错误）
 * @param {string} text - 待检测修复的文本
 * @returns {string} 修复后的文本，若无需修复则返回原文
 */
function detectAndFixEncoding(text) {
    if (!text || typeof text !== 'string') return text;

    // 排除安全格式，不对这些格式进行乱码检测
    if (isSafeFormatText(text)) {
        return text;
    }

    // 只有中文字符，直接返回（避免误判纯中文为乱码）
    const cjkPattern = /[一-鿿㐀-䶿　-〿＀-￯]/;
    if (cjkPattern.test(text)) return text;

    // 高字节序列占比超过 30% 才认为是乱码（保守策略，避免误判正常文本）
    const HIGH_BYTE_RATIO_THRESHOLD = 0.3;
    const highBytePattern = /[\xc0-\xff][\x80-\xbf]/g;
    const highByteMatches = text.match(highBytePattern);
    if (highByteMatches && highByteMatches.length > text.length * HIGH_BYTE_RATIO_THRESHOLD) {
        try {
            const buffer = Buffer.from(text, 'latin1');
            const fixed = buffer.toString('utf-8');
            // 只有修复后 CJK 字符明显增加（2 倍以上且超过 3 个）才认为是真正的乱码
            const originalCJK = (text.match(cjkPattern) || []).length;
            const fixedCJK = (fixed.match(cjkPattern) || []).length;
            const CJK_IMPROVEMENT_RATIO = 2;
            const CJK_MIN_COUNT = 3;
            if (fixedCJK > originalCJK * CJK_IMPROVEMENT_RATIO && fixedCJK > CJK_MIN_COUNT) {
                console.log('[编码修复] 检测到编码损坏，已自动修复UTF-8');
                return fixed;
            }
        } catch (e) {}
    }

    // 问号序列占比超过 50% 且文本较短时才检测（避免误判正常问句）
    const QUESTION_MARK_RATIO_THRESHOLD = 0.5;
    const QUESTION_MARK_MAX_TEXT_LENGTH = 50;
    const questionMarks = (text.match(/\?{3,}/g) || []).join('').length;
    if (questionMarks > text.length * QUESTION_MARK_RATIO_THRESHOLD && text.length < QUESTION_MARK_MAX_TEXT_LENGTH) {
        try {
            const buffer = Buffer.from(text, 'ascii');
            const fixed = buffer.toString('utf-8');
            if (cjkPattern.test(fixed)) {
                console.log('[编码修复] 问号乱码修复成功');
                return fixed;
            }
        } catch (e) {}
    }

    return text;
}

// ============================================================
// 模块名称：文本聊天处理
// 功能说明：处理文本聊天请求，包括反讽检测、安全审核、意图识别、任务编排等
// ============================================================

/**
 * @description 处理文本聊天请求，核心业务流程：
 *              1. 编码修复与反讽检测
 *              2. 安全审核拦截
 *              3. Onboarding 引导
 *              4. 意图识别与系统控制
 *              5. 任务编排或 LLM 对话
 *              6. 异步后处理（记忆、关系、学习等）
 * @param {string} message - 用户消息
 * @param {string} personality - 性格模式 (normal | cute | bad)
 * @param {string|null} dialect - 方言模式 (null | taiwan | dongbei | sichuan | henan | cantonese)
 * @param {string} userId - 用户 ID（多用户模式），默认 'legacy'
 * @returns {Promise<Object>} 处理结果，包含 message、ttsText、emotion、relationship 等字段
 * @throws {Error} 消息为空时抛出异常
 */
async function handleTextChat(message, personality = 'normal', dialect = null, userId = 'legacy') {
    const _t0 = Date.now();
    if (!message) {
        throw new Error(ERROR_MESSAGES.EMPTY_MESSAGE);
    }

    message = detectAndFixEncoding(message);

    // 反讽检测：识别用户表面夸奖实际抱怨的表达，避免 LLM 误解用户意图
    const sarcasmPatterns = [
        { regex: /(哈哈|太棒了|真好|不错).*太好用了.*(卡了|崩了|挂了|坏了)/, label: '【用户在抱怨功能卡顿，不是真的觉得好用】' },
        { regex: /太好用了.*(卡了|崩了|挂了|坏了)/, label: '【用户在抱怨功能卡顿，不是真的觉得好用】' },
        { regex: /(真厉害|真棒|真行|可以啊).*(又|还|还是|总是|这么)/, label: '【用户在吐槽功能问题，不是真的夸奖】' },
        { regex: /(服了|绝了|无语|受够了|崩溃).*(又|还|根本|完全|总是)/, label: '【用户在表达无奈或生气】' },
        { regex: /(哈哈|呵呵).*(又崩了|又挂了|又卡了|又坏了)/, label: '【用户在苦笑或反讽，实际在抱怨】' },
        { regex: /(太棒了|真好|不错).*(又崩了|又挂了|又卡了|崩溃了|挂了)/, label: '【用户在反讽，实际在抱怨功能故障】' },
        { regex: /无语了.*(根本|完全|一点也|怎么|总是)/, label: '【用户在表达无奈或生气】' }
    ];
    for (const pattern of sarcasmPatterns) {
        if (pattern.regex.test(message)) {
            message = message + '\n' + pattern.label;
            console.log(`[反讽检测] 检测到反讽/讽刺，已标注: ${message.substring(0, 50)}`);
            break;
        }
    }

    const memoryService = getMemoryService(userId);

    // 安全审核：拦截敏感内容，防止 LLM 生成不当回复
    const securityAudit = require('../services/security_audit');
    const securityCheck = securityAudit.checkSensitiveContent(message);
    if (securityCheck.isSensitive) {
        console.log(`[安全审核] 控制器层拦截敏感内容，类型: ${securityCheck.type}`);
        return {
            message: securityCheck.response,
            emotion: 'warm',
            speech_rate: 0.9,
            volume: 0.7,
            action: 'none',
            silence: false,
            isSecurityBlocked: true,
            blockType: securityCheck.type
        };
    }

    console.log(`[主人说]: ${message} [性格: ${personality}] [方言: ${dialect || '普通话'}] [userId: ${userId}]`);

    // Onboarding 引导：首次对话时引导用户完成画像收集
    if (!onboardingService.isCompleted()) {
        const onboardingResponse = onboardingService.processResponse(message);
        if (onboardingResponse) {
            console.log(`[Onboarding] 返回: ${onboardingResponse.text}`);
            return {
                message: onboardingResponse.text,
                emotion: 'happy',
                speech_rate: 0.9,
                volume: 0.7,
                action: 'tilt',
                silence: false,
                isOnboarding: true,
                onboardingCompleted: onboardingResponse.completed
            };
        }
    }

    // 意图识别：判断用户消息属于聊天、任务还是系统控制
    const _t1 = Date.now();
    const intentResult = require('../services/intentRouter').route(message, { imageData: null });
    // intentRouter 返回 zone 字段（不是 route）
    const intent = intentResult.zone;
    console.log(`[意图识别] zone=${intentResult.zone}, taskType=${intentResult.taskType}, reason=${intentResult.reason} [${Date.now() - _t1}ms]`);

    // 系统控制拦截：检查是否为系统操作命令
    const _t2 = Date.now();
    const controlResult = await trySystemControl(message, userId, intentResult);
    console.log(`[耗时] trySystemControl: ${Date.now() - _t2}ms`);
    
    if (controlResult.handled) {
        console.log(`[系统控制] 已处理，类型：${controlResult.type}`);

        let cleanControlMessage;
        if (controlResult.type === 'system_control_confirm') {
            cleanControlMessage = controlResult.result.message || '这涉及到敏感操作，确定要执行吗？请说"确认"。';
        } else {
            cleanControlMessage = ensureString(textCleaner.clean(ensureString(controlResult.result.message)) || controlResult.result.message);
        }

        // 系统控制已处理，生成简短的 TTS 文本（长文本用"搞定啦"代替，避免冗长播报）
        const isSuccess = controlResult.result.success !== false && !/^1\.\s*无标题/.test(cleanControlMessage.trim());
        let briefTTS;
        if (!isSuccess) {
            briefTTS = '抱歉，出了点问题';
        } else if (cleanControlMessage.length > 30) {
            briefTTS = '搞定啦~';
        } else {
            briefTTS = cleanControlMessage;
        }
        const relationship = memoryService.getFullState().relationship;

        memoryService.addConversation('user', message);
        memoryService.addConversation('assistant', cleanControlMessage);
        smartMemory.recordConversation(message, cleanControlMessage);
        proactiveService.recordInteraction();

        return {
            message: cleanControlMessage,
            ttsText: briefTTS,
            emotion: DEFAULT_RESPONSE.emotion,
            speech_rate: DEFAULT_RESPONSE.speechRate,
            volume: DEFAULT_RESPONSE.volume,
            action: DEFAULT_RESPONSE.action,
            type: controlResult.type,
            relationship: {
                stage: relationship.relationshipStage,
                intimacy: relationship.intimacy,
                trust: relationship.trust
            }
        };
    }

    // 判断是否为复杂任务（排除数据分析和代码审查，这两类走 LLM 工具调用效果更好）
    // 注意：intentRouter 返回 zone 字段，不是 route 字段
    const isComplexTask = intentResult.zone === 'work' && !['data_analysis', 'code_review'].includes(intentResult.taskType);
    const hasInlineDataChat = intentResult.taskType === 'data_analysis';
    const taskKeywords = message.match(/(?:帮我做|生成|整理|分析)(.{5,30}?)(?:好吗|吧|呢|～)?$/);
    const taskName = taskKeywords ? taskKeywords[1] : message.substring(0, 30);

    // 调试日志
    console.log('[chatController] === 路由决策 ===');
    console.log('[chatController] zone:', intentResult.zone);
    console.log('[chatController] taskType:', intentResult.taskType);
    console.log('[chatController] isComplexTask:', isComplexTask);
    console.log('[chatController] hasInlineDataChat:', hasInlineDataChat);
    console.log('[chatController] shouldEnterWorkflow:', isComplexTask && !hasInlineDataChat);

    const systemTools = systemControl.getToolDefinitions();
    let llmResponse;
    const _t3 = Date.now();

    if (controlResult.llmResponse) {
        console.log('[chatController] 复用trySystemControl的LLM响应');
        llmResponse = controlResult.llmResponse;
    } else if (isComplexTask && !hasInlineDataChat) {
        console.log('[chatController] 检测到工作任务，尝试 taskOrchestrator...', { taskType: intentResult.taskType });

        // 记录待完成任务到记忆服务（用于任务追踪和上下文恢复）
        if (isComplexTask) {
            const existingTasks = memoryService.getPendingTasks();
            const taskAlreadyPending = existingTasks.some(t =>
                t.text.toLowerCase().includes(taskName.toLowerCase().substring(0, 10))
            );
            if (!taskAlreadyPending) {
                memoryService.addPendingTask(taskName, message);
                console.log(`[记忆服务] 记录待完成任务: ${taskName}`);
            }
        }

        try {
            // 构建带上下文的消息，帮助任务编排器理解用户真实意图
            const recentHistory = memoryService.getConversationHistory(4);
            let contextualMessage = message;
            if (recentHistory.length >= 2) {
                const historyText = recentHistory.map(m => `${m.role === 'user' ? '用户' : '小梦'}: ${m.content.substring(0, 80)}`).join('\n');
                contextualMessage = `【对话上下文】\n${historyText}\n\n【当前请求】${message}\n\n注意：以上是对话历史，请基于上下文理解用户的真实意图。`;
            }
            const workflowResult = await taskOrchestrator.execute(contextualMessage, { sessionId: userId });
            if (workflowResult.status === 'completed' && workflowResult.response && workflowResult.response.trim().length > 5) {
                console.log('[chatController] taskOrchestrator 执行成功');
                // 任务完成后标记为已完成
                if (isComplexTask) {
                    memoryService.completeTask(taskName);
                }
                // 确保 response 是字符串类型（工作流可能返回对象）
                let responseText = workflowResult.response;
                if (typeof responseText === 'object') {
                    // 如果是对象，提取可显示的内容
                    responseText = responseText.content || responseText.message || JSON.stringify(responseText, null, 2);
                }
                llmResponse = {
                    content: responseText,
                    tool_calls: null,
                    emotion: 'calm',
                    speech_rate: 0.9,
                    volume: 0.7,
                    action: 'none',
                    silence: false,
                    provider: 'workflow'
                };
            } else {
                console.log('[chatController] taskOrchestrator 返回不完整，降级到Mimo');
                llmResponse = await generateReply(message, message, systemTools, personality, dialect);
            }
        } catch (workflowErr) {
            console.error('[chatController] taskOrchestrator 执行失败，降级到Mimo:', workflowErr.message);
            llmResponse = await generateReply(message, message, systemTools, personality, dialect);
        }
    } else {
        // 普通聊天场景不传工具定义，减少 LLM token 消耗
        const toolsForChat = (intent === 'chat') ? null : systemTools;
        llmResponse = await generateReply(message, message, toolsForChat, personality, dialect);
    }

    console.log(`[耗时] LLM调用: ${Date.now() - _t3}ms`);

    let replyText;
    let emotion = DEFAULT_RESPONSE.emotion;
    let speechRate = DEFAULT_RESPONSE.speechRate;
    let volume = DEFAULT_RESPONSE.volume;
    let action = DEFAULT_RESPONSE.action;
    let silence = false;

    if (typeof llmResponse === 'object') {
        const responseText = llmResponse.content || llmResponse.text || llmResponse.message;
        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
            // LLM 返回了工具调用，执行对应的系统控制工具
            console.log('[LLM] 发现工具调用，执行工具...');
            const toolResult = await systemControl.execute(message, llmResponse);
            replyText = ensureString(toolResult.message) || responseText || '好的，已经处理了~';
        } else if (responseText) {
            replyText = ensureString(responseText);
            emotion = llmResponse.emotion || 'calm';
            speechRate = llmResponse.speech_rate || 0.9;
            volume = llmResponse.volume || 0.7;
            action = llmResponse.action || 'none';
            silence = llmResponse.silence || false;
        } else {
            replyText = '嗯，让我想想...';
        }
    } else {
        replyText = ensureString(llmResponse);
    }

    console.log(`[小梦说]: ${replyText} [情绪: ${emotion}] [语速: ${speechRate}] [音量: ${volume}]`);

    // 获取关系状态
    const relationship = memoryService.getFullState().relationship;

    // 显示文本：保留括号情绪标签（用于前端展示）
    const displayText = textCleaner.cleanForDisplay(replyText) || replyText;
    // TTS文本：删除所有情绪标签（避免语音播报标签文本）
    const ttsText = textProcessor.cleanForTTS(replyText) || replyText;

    // 记录对话历史（同步，必须完成后再返回）
    memoryService.addConversation('user', message);
    memoryService.addConversation('assistant', displayText);

    // 情绪检测与关怀（同步但很快，结果需要返回给前端）
    const emotionKeyword = proactiveService.detectEmotion(message);
    let emotionCareMessage = null;
    if (emotionKeyword) {
        emotionCareMessage = proactiveService.triggerEmotionCare(emotionKeyword);
    }

    // 所有后处理服务异步执行，不阻塞响应（使用 setImmediate 确保不阻塞当前事件循环）
    setImmediate(() => {
        try {
            const userEmotion = memoryService.data?.state?.emotion?.current || 'neutral';
            memoryService.updateRelationship(message, displayText, userEmotion);
        } catch (e) { console.error('[关系更新] updateRelationship失败:', e.message); }

        try { userProfileLearner.learnFromConversation(message, displayText); } catch (e) {}
        try { smartMemory.updateWikiAsync(message, displayText); } catch (e) {}
        try { smartMemory.recordConversation(message, displayText); } catch (e) {}
        try { proactiveService.recordInteraction(); } catch (e) {}
        try { characterEvolution.recordInteraction(message, displayText); } catch (e) {}

        try {
            if (typeof skillLearner.learn === 'function') {
                skillLearner.learn(message, intent || 'chat', {});
            }
        } catch (e) {}

        try {
            behaviorPredictor.recordAction({
                type: intent || 'chat',
                intent: intent || 'chat',
                tools: [],
                topic: '',
                emotion: emotion || 'neutral'
            });
        } catch (e) {}

        try { knowledgeGraph.extractFromConversation(message, displayText); } catch (e) {}

        try {
            const currentProfile = userProfileLearner.getProfileSummary();
            llmExtractor.extractDeepInsights(message, displayText, currentProfile).then(extraction => {
                if (extraction && Object.keys(extraction).length > 0) {
                    const profile = userProfileLearner.profile;
                    const merged = llmExtractor.mergeExtractionIntoProfile(extraction, profile);
                    if (merged !== profile) {
                        userProfileLearner.profile = merged;
                        userProfileLearner.saveProfile();
                    }
                }
            }).catch(e => {});
        } catch (e) {}
    });

    return {
        message: displayText,
        ttsText: ttsText,
        emotion,
        speech_rate: speechRate,
        volume,
        action,
        silence,
        dialect,
        relationship: {
            stage: relationship.relationshipStage,
            intimacy: relationship.intimacy,
            trust: relationship.trust
        },
        proactiveMessage: emotionCareMessage,
        recallText: typeof smartMemory.generateRecallText === 'function' ? smartMemory.generateRecallText() : '',
        characterDescription: typeof characterEvolution.getPersonalityDescription === 'function' ? characterEvolution.getPersonalityDescription() : '',
        _timing: { total: Date.now() - _t0 }
    };
}

// ============================================================
// 模块名称：语音聊天处理
// 功能说明：处理语音聊天请求，与文本聊天类似但更简化
// ============================================================

/**
 * @description 处理语音聊天请求，流程简化版：
 *              1. 系统控制拦截
 *              2. 意图识别
 *              3. LLM 生成回复
 *              4. 异步后处理
 * @param {string} userText - 语音识别后的文本
 * @param {string} personality - 性格模式，默认 'normal'
 * @param {string|null} dialect - 方言模式，默认 null
 * @param {string} userId - 用户 ID（多用户模式），默认 'legacy'
 * @returns {Promise<Object>} 处理结果，包含 text、ttsText、emotion 等字段
 * @throws {Error} 语音文本为空时抛出异常
 */
async function handleVoiceChat(userText, personality = 'normal', dialect = null, userId = 'legacy') {
    if (!userText) {
        throw new Error('主人，你没说话呀！');
    }

    // 获取用户专属的记忆服务
    const memoryService = getMemoryService(userId);

    console.log(`[主人说]: ${userText} [性格: ${personality}] [方言: ${dialect || '普通话'}] [userId: ${userId}]`);

    // 1. 系统控制拦截
    const controlResult = await trySystemControl(userText, userId);
    
    if (controlResult.handled) {
        console.log(`[系统控制] 已处理，类型：${controlResult.type}`);
        // 确保 cleanControlMessage 是字符串类型
        const cleanControlMessage = String(textCleaner.clean(controlResult.result.message) || controlResult.result.message || '');
        const briefTTS = cleanControlMessage.length > 30 ? '搞定啦~' : cleanControlMessage;
        
        return {
            text: cleanControlMessage,
            ttsText: briefTTS,
            emotion: DEFAULT_RESPONSE.emotion,
            speech_rate: DEFAULT_RESPONSE.speechRate,
            volume: DEFAULT_RESPONSE.volume,
            action: DEFAULT_RESPONSE.action,
            silence: false,
            type: controlResult.type,
            isSystemControl: true
        };
    }

    // 2. 意图识别
    const intent = textProcessor.detectIntent(userText);
    console.log(`[意图识别]: ${intent === INTENT_TYPES.CODING ? '📝 写代码' : '💬 日常闲聊'}`);

    // 3. LLM 生成回复（传入性格参数和系统工具）
    const systemTools = systemControl.getToolDefinitions();
    let llmResponse;
    if (intent === INTENT_TYPES.CODING) {
        llmResponse = await generateReplyWithStyle(userText, 'coding', systemTools, personality, dialect);
    } else {
        llmResponse = await generateReply(userText, userText, systemTools, personality, dialect);
    }

    // 4. 处理结构化返回格式
    let replyText;
    let emotion = DEFAULT_RESPONSE.emotion;
    let speechRate = DEFAULT_RESPONSE.speechRate;
    let volume = DEFAULT_RESPONSE.volume;
    let action = DEFAULT_RESPONSE.action;
    let silence = false;

    if (typeof llmResponse === 'object') {
        const responseText = llmResponse.content || llmResponse.text || llmResponse.message;
        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
            console.log('[LLM] 发现工具调用，执行工具...');
            const toolResult = await systemControl.execute(userText, llmResponse);
            replyText = ensureString(toolResult.message) || responseText;
        } else if (responseText) {
            replyText = ensureString(responseText);
            emotion = llmResponse.emotion || 'calm';
            speechRate = llmResponse.speech_rate || 0.9;
            volume = llmResponse.volume || 0.7;
            action = llmResponse.action || 'none';
            silence = llmResponse.silence || false;
        }
    } else {
        replyText = ensureString(llmResponse);
    }

    console.log(`[小梦说]: ${replyText} [情绪: ${emotion}] [语速: ${speechRate}] [音量: ${volume}]`);

    if (silence) {
        console.log('[小梦] 选择沉默');
        return {
            text: '',
            emotion,
            speech_rate: speechRate,
            volume,
            action,
            silence: true
        };
    }

    // 显示文本：保留括号情绪标签
    const displayText = textCleaner.cleanForDisplay(replyText) || replyText;
    // TTS文本：删除所有情绪标签（使用更高效的textProcessor）
    const ttsText = textProcessor.cleanForTTS(replyText) || '嗯……';

    // 记录对话历史
    memoryService.addConversation('user', userText);
    memoryService.addConversation('assistant', displayText);

    const emotionKeyword = proactiveService.detectEmotion(userText);
    let emotionCareMessage = null;
    if (emotionKeyword) {
        emotionCareMessage = proactiveService.triggerEmotionCare(emotionKeyword);
    }

    setImmediate(() => {
        try {
            const userEmotion = memoryService.data?.state?.emotion?.current || 'neutral';
            memoryService.updateRelationship(userText, displayText, userEmotion);
        } catch (e) {}

        try { userProfileLearner.learnFromConversation(userText, displayText); } catch (e) {}
        try { smartMemory.updateWikiAsync(userText, displayText); } catch (e) {}
        try { smartMemory.recordConversation(userText, displayText); } catch (e) {}
        try { proactiveService.recordInteraction(); } catch (e) {}
        try { characterEvolution.recordInteraction(userText, displayText); } catch (e) {}

        try {
            if (typeof skillLearner.learn === 'function') {
                skillLearner.learn(userText, 'chat', {});
            }
        } catch (e) {}

        try { behaviorPredictor.recordAction({ type: 'chat', intent: 'chat', tools: [], emotion: emotion || 'neutral' }); } catch (e) {}
        try { knowledgeGraph.extractFromConversation(userText, displayText); } catch (e) {}

        try {
            llmExtractor.extractDeepInsights(userText, displayText, userProfileLearner.getProfileSummary())
                .then(extraction => {
                    if (extraction && Object.keys(extraction).length > 0) {
                        const merged = llmExtractor.mergeExtractionIntoProfile(extraction, userProfileLearner.profile);
                        if (merged !== userProfileLearner.profile) {
                            userProfileLearner.profile = merged;
                            userProfileLearner.saveProfile();
                        }
                    }
                }).catch(() => {});
        } catch (e) {}
    });

    return {
        text: displayText,
        ttsText: ttsText,
        emotion,
        speech_rate: speechRate,
        volume,
        action,
        silence: false,
        dialect,
        proactiveMessage: emotionCareMessage,
        recallText: typeof smartMemory.generateRecallText === 'function' ? smartMemory.generateRecallText() : '',
        characterDescription: typeof characterEvolution.getPersonalityDescription === 'function' ? characterEvolution.getPersonalityDescription() : ''
    };
}

// ============================================================
// 模块名称：系统控制拦截器
// 功能说明：拦截系统控制命令，支持确认、直接执行、链式操作等
// ============================================================

/**
 * @description 系统控制拦截器，处理流程：
 *              1. 检查待确认命令
 *              2. 快速规则匹配（简单操作直接执行）
 *              3. LLM 工具调用（复杂操作）
 *              4. 任务编排（复杂任务）
 * @param {string} userText - 用户输入文本
 * @param {string} userId - 用户 ID，默认 'legacy'
 * @param {Object|null} intentResult - 意图识别结果，默认 null
 * @returns {Promise<Object>} 处理结果，包含 handled（是否已处理）、type、result 等字段
 */
async function trySystemControl(userText, userId = 'legacy', intentResult = null) {
    try {
        const memoryService = getMemoryService(userId);
        const systemTools = systemControl.getToolDefinitions();
        // 1. 检查是否有待确认的命令（用户之前触发了需要确认的操作）
        const pendingCommand = memoryService.getShortTerm(SHORT_TERM_MEMORY.namespace, SHORT_TERM_MEMORY.pendingCommandKey);

        if (pendingCommand) {
            // 用户确认执行
            const confirmWords = /确认|好的|行|可以|执行|确定|是|对/;
            if (confirmWords.test(userText)) {
                memoryService.setShortTerm(SHORT_TERM_MEMORY.namespace, SHORT_TERM_MEMORY.pendingCommandKey, null);
                console.log('[系统控制] 用户确认执行命令:', pendingCommand.type);
                
                const result = await systemControl.executeToolCalls([pendingCommand.toolCall], userText);
                return { 
                    handled: true, 
                    type: 'system_control', 
                    result 
                };
            } else {
                // 用户拒绝执行，清除待确认命令
                memoryService.setShortTerm(SHORT_TERM_MEMORY.namespace, SHORT_TERM_MEMORY.pendingCommandKey, null);
                return {
                    handled: true,
                    type: 'system_control_cancelled',
                    result: { success: true, message: '好的，已取消操作。' }
                };
            }
        }

        // 2. 快速规则匹配（简单操作直接执行，不走 LLM，响应更快）
        const quickMatch = systemControl.fallbackRuleMatch(userText);
        console.log(`[trySystemControl] input="${userText.substring(0,30)}" quickMatch=${quickMatch ? quickMatch.intent?.type : 'null'}`);
        if (quickMatch && quickMatch.intent) {
            if (quickMatch.requireConfirm) {
                memoryService.setShortTerm(SHORT_TERM_MEMORY.namespace, SHORT_TERM_MEMORY.pendingCommandKey, {
                    toolCall: { function: { name: quickMatch.intent.type, arguments: JSON.stringify(quickMatch.intent.match || {}) } },
                    timestamp: Date.now()
                }, SHORT_TERM_MEMORY.commandTimeout);

                return {
                    handled: true,
                    type: 'system_control_confirm',
                    result: quickMatch
                };
            }

            const execResult = await systemControl.executeConfirmed(quickMatch.intent);
            if (execResult) {
                if (execResult.success) {
                    console.log(`[系统控制] 规则快速匹配执行成功：${execResult.message}`);
                } else {
                    console.log(`[系统控制] 规则快速匹配执行失败：${execResult.message}`);
                }

                // 链式操作检测：用户在系统控制命令后还要求执行其他操作（如保存、打开等）
                const chainPatterns = [
                    { regex: /(然后|接着|再|之后|还有|并|且|同时|顺便).*(保存|写到|写入|存|记录|导出)/, type: 'save' },
                    { regex: /(保存|写到|写入|存|导出).*(文件|桌面|文档|周报|报告)/, type: 'save_to_file' },
                    { regex: /(保存|存下来|保存下来|存到)/, type: 'save' },
                    { regex: /(然后|接着|再|之后|还有|并|且).*(打开|启动|运行)/, type: 'launch' },
                    { regex: /(然后|接着|再|之后|还有|并|且).*(搜索|搜|查一下)/, type: 'search' },
                    { regex: /(然后|接着|再|之后|还有|并|且).*(发|发送|发给)/, type: 'send' },
                ];

                let chainResult = null;
                if (execResult.success) {
                    for (const chain of chainPatterns) {
                        if (chain.regex.test(userText)) {
                            console.log(`[系统控制] 检测到链式操作: ${chain.type}`);
                            if (chain.type === 'save_to_file' || chain.type === 'save') {
                                // 将系统控制结果保存到桌面文件
                                const homeDir = require('os').homedir();
                                const saveContent = execResult.message || execResult.content || '';
                                if (saveContent.length < 5) {
                                    chainResult = `，但内容为空，未保存`;
                                } else {
                                    const filename = `小梦保存_${Date.now()}.txt`;
                                    const savePath = path.join(_getDesktopPath(), filename);
                                    try {
                                        require('fs').writeFileSync(savePath, saveContent, 'utf-8');
                                        chainResult = `，内容已保存到桌面：${filename}`;
                                    } catch(e) {
                                        chainResult = `，但保存文件失败：${e.message}`;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }

                const finalMessage = chainResult ? execResult.message + chainResult : execResult.message;
                const finalResult = { ...execResult, message: finalMessage };

                memoryService.recordInteraction(userText, finalMessage, 'system_control', 'neutral');
                return { handled: true, type: 'system_control', result: finalResult };
            }
        }

        // 3. 如果意图路由结果是 system_control，走 LLM 工具调用（让 LLM 决定调用哪个工具）
        if (intentResult && intentResult.route === 'system_control') {
            const systemTools = systemControl.getToolDefinitions();
            const llmResponse = await generateReply(userText, userText, systemTools, 'normal', null, { skipWorkflow: true });
            
            if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
                const toolName = llmResponse.tool_calls[0]?.function?.name || '';
                // 工具相关性校验：检查 LLM 选择的工具是否与用户意图匹配，
                // 防止 LLM 幻觉导致调用不相关的工具
                const toolRelevanceMap = {
                    weather: /天气|气温|温度|下雨|下雪|刮风/,
                    search_web: /搜索|搜一下|查一下|查找|查询/,
                    read_file: /读取|读一下|打开.*文件|看看.*文件|内容|数据/,
                    list_directory: /列出|查看|显示.*文件|桌面|目录/,
                    launch_app: /打开|启动|运行.*应用/,
                    play_music: /播放|听.*音乐|放.*歌/,
                    set_reminder: /提醒|闹钟|定时|记得/,
                    take_screenshot: /截图|截屏/,
                    list_memos: /备忘|笔记|记了什么/,
                    manage_todo: /待办|任务.*清单/,
                    translate: /翻译/,
                };
                const relevanceRegex = toolRelevanceMap[toolName];
                const isRelevant = relevanceRegex ? relevanceRegex.test(userText) : true;
                
                if (!isRelevant) {
                    console.log(`[系统控制] LLM工具调用不相关: ${toolName}，忽略`);
                    return { handled: false, llmResponse };
                }
                
                console.log('[系统控制] LLM 决定调用工具:', JSON.stringify(llmResponse.tool_calls));
                const result = await systemControl.execute(userText, llmResponse);
                
                if (result.requireConfirm) {
                    memoryService.setShortTerm(SHORT_TERM_MEMORY.namespace, SHORT_TERM_MEMORY.pendingCommandKey, {
                        toolCall: result.pendingToolCall,
                        timestamp: Date.now()
                    }, SHORT_TERM_MEMORY.commandTimeout);
                    return { handled: true, type: 'system_control_confirm', result };
                }
                
                if (result.success) {
                    console.log(`[系统控制] 执行成功：${result.message}`);
                    memoryService.recordInteraction(userText, result.message, 'system_control', 'neutral');
                    return { handled: true, type: 'system_control', result };
                }
            }

            const fallbackResult = await systemControl.execute(userText, null);
            if (fallbackResult && fallbackResult.success) {
                memoryService.recordInteraction(userText, fallbackResult.message, 'system_control', 'neutral');
                return { handled: true, type: 'system_control', result: fallbackResult };
            }

            return { handled: false, llmResponse };
        }

        // 4. 如果意图路由结果是 work（复杂任务），走工作流编排
        if (intentResult) {
            const isComplexTask = intentResult.zone === 'work' &&
                                  !['data_analysis', 'code_review'].includes(intentResult.taskType);

            if (isComplexTask) {
                console.log('[工作流] 检测到工作任务，启动任务编排器', { taskType: intentResult.taskType });
                try {
                    const workflowResult = await taskOrchestrator.execute(userText, { sessionId: userId });

                    if (workflowResult.status === 'completed') {
                        let workflowMessage = workflowResult.response || workflowResult.result || '任务已完成';
                        workflowMessage = ensureString(workflowMessage);
                        // 检测无效的工作流结果（如无标题列表、Cheat Engine 等无关内容）
                        const isBadResult = typeof workflowMessage === 'string' && (
                            /^1\.\s*无标题/.test(workflowMessage.trim()) ||
                            /Desktop\s+Cheat Engine/.test(workflowMessage) ||
                            /已整理\s*\d+\s*个文件/.test(workflowMessage) ||
                            workflowMessage.trim().length < 10
                        );
                        if (isBadResult) {
                            console.log('[工作流] 检测到无效结果，降级到LLM对话');
                            const fallbackResponse = await generateReply(userText, userText, systemTools, 'normal', null, { skipWorkflow: true, customInstructions: '用户需要你执行任务，请使用提供的工具函数（search_web、file_write等）来完成任务，不要说自己做不到。' });
                            const fallbackMessage = (typeof fallbackResponse === 'object' ? (fallbackResponse.content || fallbackResponse.text) : fallbackResponse) || workflowMessage;
                            memoryService.addConversation('user', userText);
                            memoryService.addConversation('assistant', fallbackMessage);
                            smartMemory.recordConversation(userText, fallbackMessage);
                            proactiveService.recordInteraction();
                            return {
                                handled: true,
                                type: 'workflow_fallback',
                                result: { success: true, message: fallbackMessage }
                            };
                        }
                        memoryService.recordInteraction(userText, workflowMessage, 'workflow', 'neutral');
                        memoryService.addConversation('user', userText);
                        memoryService.addConversation('assistant', workflowMessage);
                        smartMemory.recordConversation(userText, workflowMessage);
                        proactiveService.recordInteraction();

                        return {
                            handled: true,
                            type: 'workflow',
                            result: { success: true, message: workflowMessage }
                        };
                    }

                    if (workflowResult.needsClarification) {
                        return {
                            handled: true,
                            type: 'workflow_clarify',
                            result: { success: true, message: workflowResult.question }
                        };
                    }

                    return {
                        handled: true,
                        type: 'workflow',
                        result: { success: false, message: workflowResult.error || '任务执行失败，请稍后重试' }
                    };
                } catch (workflowError) {
                    console.error('[工作流] 任务启动失败，降级到Mimo闲聊:', workflowError.message);
                    const fallbackResponse = await generateReply(userText, userText, systemTools, 'normal', null, { skipWorkflow: true, customInstructions: '用户需要你执行任务，请使用提供的工具函数（search_web、file_write等）来完成任务，不要说自己做不到。' });
                    const fallbackMessage = (typeof fallbackResponse === 'object' ? (fallbackResponse.content || fallbackResponse.text) : fallbackResponse) || '抱歉，这个任务小梦暂时处理不了，不过我可以帮你想想其他办法~';
                    memoryService.addConversation('user', userText);
                    memoryService.addConversation('assistant', fallbackMessage);
                    smartMemory.recordConversation(userText, fallbackMessage);
                    proactiveService.recordInteraction();
                    return {
                        handled: true,
                        type: 'workflow_fallback',
                        result: { success: true, message: fallbackMessage }
                    };
                }
            }
        }

        // 5. 普通聊天，不做额外 LLM 调用，直接返回
        return { handled: false };
        
    } catch (error) {
        console.error('[系统控制] 拦截器错误:', error.message);
        return { handled: false };
    }
}

// ============================================================
// 模块名称：对话历史管理
// 功能说明：清空和获取对话历史
// ============================================================

/**
 * @description 清空指定用户的对话历史
 * @param {string} userId - 用户 ID，默认 'legacy'
 * @returns {void}
 */
function clearChatHistory(userId = 'legacy') {
    const memoryService = getMemoryService(userId);
    memoryService.clearConversationHistory();
    console.log(`[聊天] 对话历史已清空 (userId: ${userId})`);
}

/**
 * @description 获取指定用户的对话历史
 * @param {number} limit - 限制返回的对话条数，默认 6
 * @param {string} userId - 用户 ID，默认 'legacy'
 * @returns {Array<Object>} 对话历史数组
 */
function getChatHistory(limit = 6, userId = 'legacy') {
    const memoryService = getMemoryService(userId);
    return memoryService.getConversationHistory(limit);
}

module.exports = {
    handleTextChat,
    handleVoiceChat,
    trySystemControl,
    clearChatHistory,
    getChatHistory
};
