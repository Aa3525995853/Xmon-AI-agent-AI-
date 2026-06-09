/**
 * @file index.js
 * @description ExcelIntelligenceService 主入口 - Excel智能操作引擎，整合读取、分析、整理和写入能力
 * @module services/excel_intelligence
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心能力：
 * 1. 智能读取 - 自动识别表头、数据类型、空白行
 * 2. 数据分析 - 统计分析、分类汇总、趋势识别
 * 3. 数据整理 - 排序、筛选、去重、添加汇总列
 * 4. 智能写入 - 自动格式化输出（条件格式）
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 子模块：延迟加载，避免循环依赖
// ============================================================

let _reader = null;
let _analyzer = null;
let _writer = null;

/**
 * @description 延迟加载Excel读取器
 * @returns {Object} ExcelReader 实例
 */
function getReader() {
    if (!_reader) _reader = require('./excel_reader');
    return _reader;
}

/**
 * @description 延迟加载Excel分析器
 * @returns {Object} ExcelAnalyzer 实例
 */
function getAnalyzer() {
    if (!_analyzer) _analyzer = require('./excel_analyzer');
    return _analyzer;
}

/**
 * @description 延迟加载Excel写入器
 * @returns {Object} ExcelWriter 实例
 */
function getWriter() {
    if (!_writer) _writer = require('./excel_writer');
    return _writer;
}

class ExcelIntelligenceService {
    /**
     * @description 构造函数，初始化LLM服务引用
     */
    constructor() {
        /** @type {Object|null} LLM服务实例，延迟加载 */
        this.llmService = null;
    }

    /**
     * @description 延迟加载LLM服务
     * @returns {Object|null} LLM服务实例，加载失败返回 null
     * @private
     */
    _getLLMService() {
        if (!this.llmService) {
            try {
                this.llmService = require('../llm_service');
            } catch (e) {
                logger.warn('[Excel智能] LLM服务未加载');
            }
        }
        return this.llmService;
    }

    /**
     * @description 智能读取Excel文件，自动识别表头和数据类型
     * @param {string} filepath - Excel文件路径
     * @returns {Promise<Object>} 读取结果 { success, filepath, headers, data, schema, stats, rowCount, colCount }
     */
    async readAndAnalyze(filepath) {
        return getReader().read(filepath);
    }

    /**
     * @description 数据分析，支持统计摘要、分组分析和自定义操作
     * @param {Array<Array>} data - 二维数据数组
     * @param {Object} [options={}] - 分析选项
     * @param {Array} [options.headers] - 表头数组
     * @param {string} [options.groupBy] - 分组列名
     * @param {Array} [options.metrics] - 聚合指标列名数组
     * @param {Array} [options.operations] - 操作列表
     * @returns {Object} 分析结果 { success, summary, stats, grouped?, operations? }
     */
    async analyzeData(data, options = {}) {
        return getAnalyzer().analyze(data, options);
    }

    /**
     * @description 数据整理，支持排序、筛选等操作
     * @param {Array<Array>} data - 二维数据数组
     * @param {Object} [operations={}] - 整理操作配置
     * @param {string} [operations.sortBy] - 排序列名
     * @param {string} [operations.sortOrder] - 排序方向：asc/desc
     * @param {string} [operations.filterBy] - 筛选列名
     * @param {string} [operations.filterValue] - 筛选值
     * @param {Array} [operations.headers] - 表头数组
     * @returns {Object} 整理结果 { success, data, rowCount }
     */
    async organizeData(data, operations = {}) {
        const reader = getReader();
        return reader.organize(data, operations);
    }

    /**
     * @description 智能写入Excel文件，带格式化和列宽自适应
     * @param {Array<Array>} data - 二维数据数组
     * @param {string} outputPath - 输出文件路径
     * @param {Object} [options={}] - 写入选项
     * @param {Array} [options.headers] - 表头数组
     * @param {string} [options.format='xlsx'] - 输出格式
     * @param {Object} [options.conditionalFormatting] - 条件格式配置
     * @returns {Promise<Object>} 写入结果 { success, filepath, url, rowCount }
     */
    async writeWithFormat(data, outputPath, options = {}) {
        return getWriter().write(data, outputPath, options);
    }

    /**
     * @description 执行Excel操作，先读取文件再根据操作类型路由到分析或整理
     * @param {string} filepath - Excel文件路径
     * @param {string} operation - 操作类型：analyze/sort/filter/summarize
     * @param {Object} [params={}] - 操作参数
     * @returns {Promise<Object>} 操作结果
     */
    async execute(filepath, operation, params = {}) {
        try {
            // 读取数据
            const analysis = await this.readAndAnalyze(filepath);
            if (!analysis.success) {
                return analysis;
            }

            // 根据操作类型执行
            switch (operation) {
                case 'analyze':
                    return await this.analyzeData(analysis.data, params);

                case 'sort':
                    return await this.organizeData(analysis.data, {
                        ...params,
                        headers: analysis.headers
                    });

                case 'filter':
                    return await this.organizeData(analysis.data, {
                        ...params,
                        headers: analysis.headers
                    });

                case 'summarize':
                    return await this.analyzeData(analysis.data, {
                        ...params,
                        headers: analysis.headers
                    });

                default:
                    return { success: false, message: `未知操作: ${operation}` };
            }

        } catch (error) {
            logger.error('[Excel智能] 执行失败:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = ExcelIntelligenceService;