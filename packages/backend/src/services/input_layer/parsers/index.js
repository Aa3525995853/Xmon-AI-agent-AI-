/**
 * @file parsers/index.js
 * @description 解析器注册表 - 管理各类型输入解析器的注册、获取和调用
 * @module input_layer/parsers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../../utils/logger');

class ParserRegistry {
    constructor() {
        /** @type {Map<string, Object>} 已注册的解析器映射表 */
        this.parsers = new Map();
    }

    /**
     * @description 注册解析器 - 将解析器与输入类型绑定
     * @param {string} type - 输入类型标识（text/image/audio/file/url）
     * @param {Object} parser - 解析器对象，需实现 parse() 方法
     */
    register(type, parser) {
        this.parsers.set(type, parser);
        logger.info(`[InputLayer] 注册解析器: ${type}`);
    }

    /**
     * @description 获取指定类型的解析器
     * @param {string} type - 输入类型标识
     * @returns {Object|undefined} 解析器对象
     */
    get(type) {
        return this.parsers.get(type);
    }

    /**
     * @description 获取已注册的解析器数量
     * @returns {number} 解析器数量
     */
    count() {
        return this.parsers.size;
    }

    /**
     * @description 按类型调用解析器解析输入
     * @param {string} type - 输入类型标识
     * @param {*} input - 待解析的输入数据
     * @returns {Promise<Object>} 解析结果
     * @throws {Error} 当指定类型的解析器未注册时抛出错误
     */
    async parseByType(type, input) {
        const parser = this.parsers.get(type);
        if (!parser) {
            throw new Error(`解析器未注册: ${type}`);
        }
        return parser.parse(input);
    }
}

module.exports = new ParserRegistry();