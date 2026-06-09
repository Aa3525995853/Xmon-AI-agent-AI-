/**
 * @file excel_analyzer.js
 * @description Excel 数据分析器 - 提供统计摘要、分组分析、数据操作（添加列/去重/填充）功能
 * @module services/excel_intelligence
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：支持的统计函数列表
// ============================================================

/** 支持的统计函数名称列表 */
const STAT_FUNCTIONS = ['sum', 'avg', 'count', 'max', 'min', 'median'];

class ExcelAnalyzer {
    /**
     * @description 分析数据，生成统计摘要、列统计和可选的分组分析
     * @param {Array<Array>} data - 二维数据数组
     * @param {Object} [options={}] - 分析选项
     * @param {Array} [options.headers] - 表头数组
     * @param {string} [options.groupBy] - 分组列名
     * @param {Array} [options.metrics] - 聚合指标列名数组
     * @param {Array} [options.operations] - 操作列表
     * @returns {Object} 分析结果 { success, summary, stats, grouped?, operations? }
     */
    analyze(data, options = {}) {
        const { headers, groupBy, metrics, operations } = options;

        try {
            const results = {
                summary: this._generateSummary(data, headers),
                stats: this._calculateAllStats(data, headers)
            };

            // 分组分析
            if (groupBy && headers) {
                results.grouped = this._groupAnalysis(data, headers, groupBy, metrics);
            }

            // 执行操作
            if (operations && operations.length > 0) {
                results.operations = this._executeOperations(data, headers, operations);
            }

            return {
                success: true,
                ...results
            };

        } catch (error) {
            logger.error('[Excel分析] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 生成数据摘要，包含行数、列数和表头
     * @param {Array<Array>} data - 二维数据数组
     * @param {Array} [headers] - 表头数组
     * @returns {{totalRows: number, totalCols: number, headers: Array}} 数据摘要
     * @private
     */
    _generateSummary(data, headers) {
        return {
            totalRows: data.length,
            totalCols: headers ? headers.length : (data[0]?.length || 0),
            headers: headers || []
        };
    }

    /**
     * @description 计算所有列的统计信息，数值列额外计算 sum/avg/min/max
     * @param {Array<Array>} data - 二维数据数组
     * @param {Array} [headers] - 表头数组
     * @returns {Object} 列统计映射，key为列名，value为统计对象
     * @private
     */
    _calculateAllStats(data, headers) {
        if (!headers) return {};

        const stats = {};

        headers.forEach((header, colIndex) => {
            const values = data.map(row => row[colIndex]).filter(v => v !== '' && v !== null);

            stats[header] = {
                count: values.length,
                unique: new Set(values.map(String)).size
            };

            // 数值列统计
            const numbers = values.filter(v => !isNaN(parseFloat(v))).map(Number);
            if (numbers.length > 0) {
                stats[header].sum = numbers.reduce((a, b) => a + b, 0);
                stats[header].avg = stats[header].sum / numbers.length;
                stats[header].min = Math.min(...numbers);
                stats[header].max = Math.max(...numbers);
            }
        });

        return stats;
    }

    /**
     * @description 分组分析，按指定列分组并计算每组的指标
     * @param {Array<Array>} data - 二维数据数组
     * @param {Array} headers - 表头数组
     * @param {string} groupBy - 分组列名
     * @param {Array} [metrics] - 聚合指标列名数组
     * @returns {Object} 分组结果，key为分组值，value为统计对象
     * @private
     */
    _groupAnalysis(data, headers, groupBy, metrics) {
        const groupIndex = headers.indexOf(groupBy);
        if (groupIndex < 0) return {};

        const groups = {};

        // 分组
        data.forEach(row => {
            const key = String(row[groupIndex] || 'Unknown');
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        });

        // 计算每个组的指标
        const results = {};
        for (const [key, rows] of Object.entries(groups)) {
            results[key] = {
                count: rows.length
            };

            if (metrics) {
                for (const metric of metrics) {
                    const colIndex = headers.indexOf(metric);
                    if (colIndex >= 0) {
                        const values = rows.map(r => parseFloat(r[colIndex])).filter(v => !isNaN(v));
                        if (values.length > 0) {
                            results[key][metric] = {
                                sum: values.reduce((a, b) => a + b, 0),
                                avg: values.reduce((a, b) => a + b, 0) / values.length
                            };
                        }
                    }
                }
            }
        }

        return results;
    }

    /**
     * @description 执行数据操作列表（添加列/去重/填充空值）
     * @param {Array<Array>} data - 二维数据数组
     * @param {Array} headers - 表头数组
     * @param {Array<Object>} operations - 操作列表
     * @param {string} operations[].type - 操作类型：add_column/remove_duplicates/fill_empty
     * @param {string} [operations[].column] - 目标列名
     * @param {*} [operations[].value] - 操作值
     * @returns {Array<Object>} 操作结果列表
     * @private
     */
    _executeOperations(data, headers, operations) {
        const results = [];

        for (const op of operations) {
            const { type, column, value } = op;

            switch (type) {
                case 'add_column':
                    results.push(this._addColumn(data, headers, column, value));
                    break;
                case 'remove_duplicates':
                    results.push(this._removeDuplicates(data));
                    break;
                case 'fill_empty':
                    results.push(this._fillEmpty(data, column, value));
                    break;
            }
        }

        return results;
    }

    /**
     * @description 添加新列，所有行填充相同值
     * @param {Array<Array>} data - 二维数据数组
     * @param {Array} headers - 表头数组
     * @param {string} column - 新列名
     * @param {*} value - 填充值
     * @returns {{action: string, column: string}} 操作结果
     * @private
     */
    _addColumn(data, headers, column, value) {
        const colIndex = headers.length;
        headers.push(column);
        data.forEach(row => row.push(value));
        return { action: 'add_column', column };
    }

    /**
     * @description 去除重复行，基于整行JSON序列化判断重复
     * @param {Array<Array>} data - 二维数据数组
     * @returns {{action: string, original: number, unique: number}} 操作结果
     * @private
     */
    _removeDuplicates(data) {
        const original = data.length;
        const unique = [...new Map(data.map(r => [JSON.stringify(r), r])).values()];
        return { action: 'remove_duplicates', original, unique: unique.length };
    }

    /**
     * @description 填充指定列的空值
     * @param {Array<Array>} data - 二维数据数组
     * @param {string} column - 目标列名
     * @param {*} value - 填充值
     * @returns {{action: string, column?: string, filled: number}} 操作结果
     * @private
     */
    _fillEmpty(data, column, value) {
        if (!column) return { action: 'fill_empty', filled: 0 };
        const colIndex = headers.indexOf(column);
        let filled = 0;
        data.forEach(row => {
            if (row[colIndex] === '' || row[colIndex] === null) {
                row[colIndex] = value;
                filled++;
            }
        });
        return { action: 'fill_empty', column, filled };
    }
}

module.exports = new ExcelAnalyzer();