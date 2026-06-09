/**
 * @file index.js
 * @description InputLayer 主入口 - 多模态输入理解层，统一处理文字、图片、语音、文件等多种输入
 * @module input_layer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');

// 延迟加载子模块
/** @type {Object|null} 类型检测器实例 */
let _typeDetector = null;
/** @type {Object|null} 预处理器实例 */
let _preprocessor = null;
/** @type {Object|null} 解析器注册表实例 */
let _parsers = null;
/** @type {Object|null} 缓存管理器实例 */
let _cacheManager = null;

/**
 * @description 获取类型检测器单例（延迟加载）
 * @returns {Object} 类型检测器实例
 */
function getTypeDetector() {
    if (!_typeDetector) _typeDetector = require('./type_detector');
    return _typeDetector;
}

function getPreprocessor() {
    if (!_preprocessor) _preprocessor = require('./preprocessor');
    return _preprocessor;
}

function getParsers() {
    if (!_parsers) _parsers = require('./parsers');
    return _parsers;
}

function getCacheManager() {
    if (!_cacheManager) _cacheManager = require('./cache_manager');
    return _cacheManager;
}

/** 输入类型枚举 */
const InputType = {
    TEXT: 'text',
    IMAGE: 'image',
    AUDIO: 'audio',
    FILE: 'file',
    MIXED: 'mixed',
    URL: 'url'
};

class InputLayer extends EventEmitter {
    constructor() {
        super();

        this.typeDetector = getTypeDetector();
        this.preprocessor = getPreprocessor();
        this.parsers = getParsers();
        this.cache = getCacheManager();

        // 注册默认解析器
        this._registerDefaultParsers();

        logger.info('[InputLayer] 多模态输入理解层初始化完成');
    }

    /**
     * @description 注册默认解析器 - 为每种输入类型注册基础解析器
     */
    _registerDefaultParsers() {
        this.parsers.register(InputType.TEXT, { parse: async (input) => ({ type: InputType.TEXT, text: input.content, confidence: 1.0 }), priority: 100 });
        this.parsers.register(InputType.IMAGE, { parse: async (input) => this._parseImage(input), priority: 80 });
        this.parsers.register(InputType.AUDIO, { parse: async (input) => this._parseAudio(input), priority: 90 });
        this.parsers.register(InputType.FILE, { parse: async (input) => this._parseFile(input), priority: 70 });
        this.parsers.register(InputType.URL, { parse: async (input) => this._parseUrl(input), priority: 85 });
    }

    /**
     * @description 处理输入 - 检测类型→预处理→解析→缓存→发射事件
     * @param {*} input - 用户输入
     * @param {Object} options - 处理选项
     * @returns {Promise<Object>} 处理结果 { id, type, original, text, metadata, confidence }
     * @throws {Error} 不支持的输入类型时抛出错误
     */
    async process(input, options = {}) {
        const startTime = Date.now();
        const inputId = this.cache.generateId();
        const inputType = this.typeDetector.detect(input);

        logger.info(`[InputLayer] 处理输入: ${inputId}`, { type: inputType });

        try {
            const preprocessed = await this.preprocessor.preprocess(input, inputType, options);
            const parser = this.parsers.get(inputType);

            if (!parser) {
                throw new Error(`不支持的输入类型: ${inputType}`);
            }

            const parsed = await parser.parse(preprocessed);

            const result = {
                id: inputId,
                type: inputType,
                original: input,
                ...parsed,
                metadata: {
                    timestamp: Date.now(),
                    size: preprocessed.size,
                    mimeType: preprocessed.mimeType,
                    processingTime: Date.now() - startTime
                },
                confidence: parsed.confidence || 0.8
            };

            this.cache.set(inputId, result);
            this.emit('input:processed', result);

            return result;

        } catch (error) {
            logger.error(`[InputLayer] 处理输入失败: ${error.message}`);
            this.emit('input:error', { inputId, error: error.message });
            throw error;
        }
    }

    /**
     * @description 批量处理输入 - 并行处理多个输入，汇总成功和失败数
     * @param {Array} inputs - 输入数组
     * @param {Object} options - 处理选项
     * @returns {Promise<Object>} 批量处理结果 { total, successful, failed, results }
     */
    async processBatch(inputs, options = {}) {
        const results = await Promise.allSettled(inputs.map(input => this.process(input, options)));
        return {
            total: inputs.length,
            successful: results.filter(r => r.status === 'fulfilled').length,
            failed: results.filter(r => r.status === 'rejected').length,
            results: results.map((r, i) => ({
                index: i,
                success: r.status === 'fulfilled',
                data: r.status === 'fulfilled' ? r.value : null,
                error: r.status === 'rejected' ? r.reason?.message : null
            }))
        };
    }

    /**
     * @description 解析图片输入
     * @param {Object} input - 预处理后的图片数据
     * @returns {Promise<Object>} 解析结果
     */
    async _parseImage(input) {
        return this.parsers.parseByType(InputType.IMAGE, input);
    }

    /**
     * @description 解析音频输入
     * @param {Object} input - 预处理后的音频数据
     * @returns {Promise<Object>} 解析结果
     */
    async _parseAudio(input) {
        return this.parsers.parseByType(InputType.AUDIO, input);
    }

    /**
     * @description 解析文件输入
     * @param {Object} input - 预处理后的文件数据
     * @returns {Promise<Object>} 解析结果
     */
    async _parseFile(input) {
        return this.parsers.parseByType(InputType.FILE, input);
    }

    /**
     * @description 解析 URL 输入
     * @param {Object} input - 预处理后的 URL 数据
     * @returns {Promise<Object>} 解析结果
     */
    async _parseUrl(input) {
        return this.parsers.parseByType(InputType.URL, input);
    }

    /**
     * @description 获取输入层统计信息
     * @returns {Object} 统计信息 { cachedInputs, registeredParsers, supportedTypes }
     */
    getStats() {
        return {
            cachedInputs: this.cache.size(),
            registeredParsers: this.parsers.count(),
            supportedTypes: Object.values(InputType)
        };
    }
}

const instance = new InputLayer();
module.exports = instance;
module.exports.InputLayer = InputLayer;
module.exports.InputType = InputType;