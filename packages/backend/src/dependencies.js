/**
 * 依赖管理模块
 * 统一管理所有外部服务和内部模块的初始化
 */

// ==================== 外部依赖 ====================
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const helmet = require('helmet');

// ==================== 工具模块 ====================
const logger = require('./utils/logger');
const fileCleaner = require('./utils/fileCleaner');
const textProcessor = require('./utils/textProcessor');
const backpressure = require('./utils/backpressure');

// ==================== 服务模块 ====================
const services = require('./services/tts_registry');
const { getCurrentTTSProvider } = require('./services/tts_registry');
const textCleaner = require('./services/text_cleaner');
const systemControl = require('./services/system_control');
const {
    getMemoryService,
    clearMemoryCache,
    legacyMemoryService,
    MemoryService
} = require('./services/memory_service');
const asrService = require('./services/asr_service');
const { generateReply, generateReplyWithStyle } = require('./services/llm_service');

// ==================== 控制器模块 ====================
const chatController = require('./controllers/chatController');
const ttsController = require('./controllers/ttsController');
const { handleStreamChat } = require('./controllers/streamChatController');

// ==================== 路由模块 ====================
const chatRoutes = require('./routes/chatRoutes');
const ttsRoutes = require('./routes/ttsRoutes');

// ==================== 中间件模块 ====================
const {
    AppError,
    ErrorTypes,
    createError,
    globalErrorHandler,
    asyncHandler,
    logError
} = require('./middleware/errorHandler');

const {
    generalLimiter,
    chatLimiter,
    ttsLimiter,
    strictLimiter,
    createCustomLimiter
} = require('./middleware/rateLimiter');

const {
    requestCache,
    clearCache,
    getCacheStats,
    getCacheContent
} = require('./middleware/cache');

const {
    handleValidationErrors,
    chatTextValidation,
    ttsSynthesizeValidation,
    ttsStreamValidation,
    chatStreamValidation,
    memoryQueryValidation,
    cacheClearValidation,
    systemControlValidation,
    createValidation,
    textValidation,
    numberValidation,
    enumValidation,
    body,
    query,
    param,
    validationResult
} = require('./middleware/validator');

// ==================== 导出所有依赖 ====================
module.exports = {
    // 外部依赖
    express,
    cors,
    multer,
    axios,
    path,
    fs,
    os,
    helmet,
    
    // 工具模块
    logger,
    fileCleaner,
    textProcessor,
    backpressure,
    
    // 服务模块
    services,
    getCurrentTTSProvider,
    textCleaner,
    systemControl,
    getMemoryService,
    clearMemoryCache,
    legacyMemoryService,
    MemoryService,
    asrService,
    generateReply,
    generateReplyWithStyle,
    
    // 控制器模块
    chatController,
    ttsController,
    handleStreamChat,
    
    // 路由模块
    chatRoutes,
    ttsRoutes,
    
    // 错误处理模块
    AppError,
    ErrorTypes,
    createError,
    globalErrorHandler,
    asyncHandler,
    logError,
    
    // 限流中间件
    generalLimiter,
    chatLimiter,
    ttsLimiter,
    strictLimiter,
    createCustomLimiter,
    
    // 缓存中间件
    requestCache,
    clearCache,
    getCacheStats,
    getCacheContent,

    // 验证中间件
    handleValidationErrors,
    chatTextValidation,
    ttsSynthesizeValidation,
    ttsStreamValidation,
    chatStreamValidation,
    memoryQueryValidation,
    cacheClearValidation,
    systemControlValidation,
    createValidation,
    textValidation,
    numberValidation,
    enumValidation,
    body,
    query,
    param,
    validationResult
};
