/**
 * @file validator.js
 * @description 输入验证中间件，使用express-validator进行请求参数的验证、清理和类型转换
 * @module middleware
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { body, query, param, validationResult } = require('express-validator');
const personalityManager = require('../config/personalities');

/** 获取所有可用的性格ID */
const getAvailablePersonalities = () => personalityManager.getIds();

// ============================================================
// 验证结果处理：统一格式化验证错误
// ============================================================

/**
 * @description 处理验证结果的中间件，验证失败时返回400错误
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express next函数
 * @returns {void}
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: '输入验证失败',
            code: 'VALIDATION_ERROR',
            details: errors.array().map(err => ({
                field: err.path,
                error: err.msg
            }))
        });
    }
    next();
};

/**
 * @description 清理文本内容，防止XSS攻击（移除尖括号、javascript协议和事件处理器）
 * @param {string} value - 输入文本
 * @returns {string} 清理后的文本
 */
const sanitizeText = (value) => {
    if (!value) return value;
    return value
        .replace(/[<>]/g, '')  // 移除尖括号
        .replace(/javascript:/gi, '')  // 移除javascript协议
        .replace(/on\w+=/gi, '');  // 移除事件处理器
};

// ============================================================
// 验证规则定义：各API端点的参数验证规则
// ============================================================

/**
 * 聊天文本请求验证
 * POST /api/chat/text
 */
const chatTextValidation = [
    body('message')
        .trim()
        .notEmpty().withMessage('消息内容不能为空')
        .isLength({ min: 1, max: 2000 }).withMessage('消息长度必须在1-2000字符之间')
     .customSanitizer(sanitizeText),
    body('personality')
        .optional()
          .isIn(getAvailablePersonalities()).withMessage(`personality必须是${getAvailablePersonalities().join('/')}之一`)
        .default('normal'),
    body('dialect')
      .optional()
     .isIn(['taiwan', 'dongbei', 'sichuan', 'henan', 'cantonese'])
        .withMessage('dialect必须是taiwan/dongbei/sichuan/henan/cantonese之一'),
    handleValidationErrors
];

/**
 * TTS合成请求验证
 * POST /api/tts/synthesize
 */
const ttsSynthesizeValidation = [
    body('text')
        .trim()
        .notEmpty().withMessage('文本内容不能为空')
        .isLength({ min: 1, max: 5000 }).withMessage('文本长度必须在1-5000字符之间')
        .customSanitizer(sanitizeText),
    body('emotion')
        .optional()
        .isIn(['neutral', 'happy', 'sad', 'angry', 'calm', 'excited']).withMessage('emotion参数不合法')
        .default('neutral'),
    body('speech_rate')
        .optional()
        .isFloat({ min: 0.5, max: 2.0 }).withMessage('语速必须在0.5-2.0之间')
        .default(1.0),
    body('volume')
        .optional()
        .isFloat({ min: 0.0, max: 1.0 }).withMessage('音量必须在0.0-1.0之间')
        .default(0.8),
    handleValidationErrors
];

/**
 * TTS流式请求验证
 * POST /api/tts/stream
 */
const ttsStreamValidation = [
    body('text')
        .trim()
        .notEmpty().withMessage('文本内容不能为空')
      .isLength({ min: 1, max: 5000 }).withMessage('文本长度必须在1-5000字符之间')
        .customSanitizer(sanitizeText),
    body('emotion')
        .optional()
     .isIn(['neutral', 'happy', 'sad', 'angry', 'calm', 'excited']).withMessage('emotion参数不合法')
        .default('neutral'),
    body('dialect')
        .optional()
        .isIn(['taiwan', 'dongbei', 'sichuan', 'henan', 'cantonese'])
        .withMessage('dialect必须是taiwan/dongbei/sichuan/henan/cantonese之一'),
    handleValidationErrors
];

/**
 * 流式聊天请求验证
 * POST /api/chat/stream, /api/chat/text-stream
 */
const chatStreamValidation = [
    body('personality')
        .optional()
          .isIn(getAvailablePersonalities()).withMessage(`personality必须是${getAvailablePersonalities().join('/')}之一`)
        .default('normal'),
    body('dialect')
        .optional()
        .isIn(['taiwan', 'dongbei', 'sichuan', 'henan', 'cantonese'])
        .withMessage('dialect必须是taiwan/dongbei/sichuan/henan/cantonese之一'),
    handleValidationErrors
];

/**
 * 记忆查询请求验证
 * GET /api/memory/*
 */
const memoryQueryValidation = [
    query('category')
        .optional()
        .isString().withMessage('category必须是字符串')
        .default('all'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('limit必须在1-100之间')
        .default(10),
    query('userId')
        .optional()
        .isString().isLength({ max: 100 }).withMessage('userId长度不能超过100')
        .default('default'),
    handleValidationErrors
];

/**
 * 缓存清除请求验证
 * POST /api/cache/clear
 */
const cacheClearValidation = [
    body('pattern')
        .optional()
        .isString().isLength({ max: 200 }).withMessage('pattern长度不能超过200')
        .default(null),
    handleValidationErrors
];

/**
 * 系统控制请求验证
 */
const systemControlValidation = [
    body('action')
        .notEmpty().withMessage('action不能为空')
        .isIn([
            'open_app', 'close_app', 'volume_up', 'volume_down', 
            'mute', 'unmute', 'shutdown', 'restart', 'sleep', 
            'screenshot', 'set_timer', 'set_alarm', 'weather', 
            'news', 'joke', 'time'
        ]).withMessage('action参数不合法'),
    body('params')
        .optional()
        .isObject().withMessage('params必须是对象')
        .default({}),
    handleValidationErrors
];

/**
 * 创建自定义验证规则数组（包含错误处理）
 * @param {Array} validations - 验证规则数组
 * @returns {Array} 包含错误处理的验证规则数组
 */
const createValidation = (validations) => {
    return [...validations, handleValidationErrors];
};

/**
 * 通用文本验证（用于简单文本输入）
 * 返回完整的验证规则数组（包含错误处理）
 */
const textValidation = (fieldName, options = {}) => {
    const { required = true, minLength = 1, maxLength = 5000 } = options;

    const validations = [];

    let chain = body(fieldName)
        .trim()
        .customSanitizer(sanitizeText);

    if (required) {
        chain = chain.notEmpty().withMessage(`${fieldName}不能为空`);
    }

    chain = chain
        .isLength({ min: minLength, max: maxLength })
        .withMessage(`${fieldName}长度必须在${minLength}-${maxLength}字符之间`);

    validations.push(chain);
    validations.push(handleValidationErrors);

    return validations;
};

/**
 * 通用数字验证（用于简单数字输入）
 * 返回完整的验证规则数组（包含错误处理）
 */
const numberValidation = (fieldName, options = {}) => {
    const { required = false, min, max, default: defaultValue } = options;

    const validations = [];
    let chain = body(fieldName);

    if (required) {
        chain = chain.notEmpty().withMessage(`${fieldName}不能为空`);
    }

    // 使用 isFloat 替代 isNumeric，支持数字和数字字符串
    chain = chain.isFloat().withMessage(`${fieldName}必须是数字`);

    if (min !== undefined) {
        chain = chain.isFloat({ min }).withMessage(`${fieldName}不能小于${min}`);
    }

    if (max !== undefined) {
        chain = chain.isFloat({ max }).withMessage(`${fieldName}不能大于${max}`);
    }

    validations.push(chain);

    // 添加默认值处理中间件
    if (defaultValue !== undefined) {
        validations.push((req, res, next) => {
            if (req.body[fieldName] === undefined || req.body[fieldName] === null) {
                req.body[fieldName] = defaultValue;
            }
            next();
        });
    }

    validations.push(handleValidationErrors);

    return validations;
};

/**
 * 通用枚举验证（用于枚举值输入）
 * 返回完整的验证规则数组（包含错误处理）
 */
const enumValidation = (fieldName, allowedValues, options = {}) => {
    const { required = false, default: defaultValue } = options;

    const validations = [];
    let chain = body(fieldName);

    if (required) {
        chain = chain.notEmpty().withMessage(`${fieldName}不能为空`);
    }

    chain = chain.isIn(allowedValues).withMessage(`${fieldName}必须是${allowedValues.join('/')}之一`);

    validations.push(chain);

    // 添加默认值处理中间件
    if (defaultValue !== undefined) {
        validations.push((req, res, next) => {
            if (req.body[fieldName] === undefined || req.body[fieldName] === null) {
                req.body[fieldName] = defaultValue;
            }
            next();
        });
    }

    validations.push(handleValidationErrors);

    return validations;
};

// ============================================================
// 导出
// ============================================================

module.exports = {
    // 验证结果处理
    handleValidationErrors,

    // 预定义的验证规则组
    chatTextValidation,
    ttsSynthesizeValidation,
    ttsStreamValidation,
    chatStreamValidation,
    memoryQueryValidation,
    cacheClearValidation,
    systemControlValidation,

    // 通用验证构建器
    createValidation,
    textValidation,
    numberValidation,
    enumValidation,

    // express-validator 原始方法
    body,
    query,
    param,
    validationResult
};
