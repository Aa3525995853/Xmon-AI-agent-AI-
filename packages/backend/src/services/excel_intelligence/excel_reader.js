/**
 * @file excel_reader.js
 * @description Excel 读取器 - 读取Excel文件并自动识别表头、分析数据类型、计算统计信息
 * @module services/excel_intelligence
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：数据类型检测正则模式
// ============================================================

/**
 * 数据类型检测模式映射
 * 用于自动识别列的数据类型（数值/日期/邮箱/电话/货币）
 */
const TYPE_PATTERNS = {
    number: /^-?\d+([.,]\d+)?$/,
    date: /^\d{4}[-/]\d{2}[-/]\d{2}|^\d{2}[-/]\d{2}[-/]\d{4}/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^[\d\s()+-]{7,}$/,
    currency: /^[$￥€£]?\s*-?\d+([.,]\d+)?$/
};

class ExcelReader {
    /**
     * @description 读取并分析Excel文件，自动识别表头、数据类型和统计信息
     * @param {string} filepath - Excel文件路径
     * @returns {Promise<Object>} 读取结果 { success, filepath, sheetName, headers, data, schema, stats, rowCount, colCount }
     * @throws 文件不存在时返回 { success: false, message }
     */
    async read(filepath) {
        logger.info(`[Excel读取] 文件: ${filepath}`);

        try {
            if (!fs.existsSync(filepath)) {
                throw new Error(`文件不存在: ${filepath}`);
            }

            const workbook = XLSX.readFile(filepath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            if (rawData.length === 0) {
                return { success: true, headers: [], data: [], schema: {}, stats: {} };
            }

            // 智能表头识别
            const headers = this._detectHeaders(rawData[0]);
            const dataRows = rawData.slice(1).filter(row => row.some(cell => cell !== ''));

            // 数据类型分析
            const schema = this._analyzeSchema(dataRows, headers);

            // 统计分析
            const stats = this._calculateStats(dataRows, schema);

            logger.info(`[Excel读取] 完成: ${dataRows.length} 行, ${headers.length} 列`);

            return {
                success: true,
                filepath,
                sheetName,
                headers,
                data: dataRows,
                schema,
                stats,
                rowCount: dataRows.length,
                colCount: headers.length
            };

        } catch (error) {
            logger.error('[Excel读取] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 检测表头，将第一行数据转为字符串并去除空白
     * @param {Array} firstRow - 第一行数据
     * @returns {Array<string>} 表头字符串数组
     * @private
     */
    _detectHeaders(firstRow) {
        return firstRow.map(cell => {
            if (typeof cell === 'string') {
                return cell.trim();
            }
            return String(cell || '');
        });
    }

    /**
     * @description 分析每列的数据类型，使用正则模式自动检测
     * @param {Array<Array>} dataRows - 数据行数组
     * @param {Array<string>} headers - 表头数组
     * @returns {Object} 列模式映射，key为列名，value包含 type、samples、uniqueCount、nullCount
     * @private
     */
    _analyzeSchema(dataRows, headers) {
        const schema = {};

        headers.forEach((header, colIndex) => {
            const values = dataRows.map(row => row[colIndex]).filter(v => v !== '' && v !== null);

            if (values.length === 0) {
                schema[header] = { type: 'unknown', samples: [] };
                return;
            }

            // 检测类型
            let type = 'text';
            for (const [typeName, pattern] of Object.entries(TYPE_PATTERNS)) {
                if (values.every(v => pattern.test(String(v)))) {
                    type = typeName;
                    break;
                }
            }

            schema[header] = {
                type,
                samples: values.slice(0, 5),
                uniqueCount: new Set(values.map(String)).size,
                nullCount: dataRows.length - values.length
            };
        });

        return schema;
    }

    /**
     * @description 计算列类型统计，按数值/日期/文本分类
     * @param {Array<Array>} dataRows - 数据行数组
     * @param {Object} schema - 列模式映射
     * @returns {{rowCount: number, colCount: number, numericColumns: Array, dateColumns: Array, textColumns: Array}} 统计信息
     * @private
     */
    _calculateStats(dataRows, schema) {
        const stats = {
            rowCount: dataRows.length,
            colCount: Object.keys(schema).length,
            numericColumns: [],
            dateColumns: [],
            textColumns: []
        };

        for (const [header, info] of Object.entries(schema)) {
            if (info.type === 'number') {
                stats.numericColumns.push(header);
            } else if (info.type === 'date') {
                stats.dateColumns.push(header);
            } else {
                stats.textColumns.push(header);
            }
        }

        return stats;
    }

    /**
     * @description 数据整理操作，支持排序和筛选
     * @param {Array<Array>} data - 二维数据数组
     * @param {Object} operations - 整理操作配置
     * @param {string} [operations.sortBy] - 排序列名
     * @param {string} [operations.sortOrder] - 排序方向：asc/desc
     * @param {string} [operations.filterBy] - 筛选列名
     * @param {string} [operations.filterValue] - 筛选值
     * @param {Array} [operations.headers] - 表头数组
     * @returns {{success: boolean, data: Array, rowCount: number}} 整理结果
     */
    organize(data, operations) {
        const { sortBy, sortOrder, filterBy, filterValue, groupBy, headers } = operations;

        let result = [...data];

        // 排序
        if (sortBy !== undefined && headers) {
            const colIndex = headers.indexOf(sortBy);
            if (colIndex >= 0) {
                result.sort((a, b) => {
                    const va = a[colIndex], vb = b[colIndex];
                    const order = sortOrder === 'desc' ? -1 : 1;
                    if (va < vb) return -1 * order;
                    if (va > vb) return 1 * order;
                    return 0;
                });
            }
        }

        // 筛选
        if (filterBy !== undefined && filterValue !== undefined && headers) {
            const colIndex = headers.indexOf(filterBy);
            if (colIndex >= 0) {
                result = result.filter(row => {
                    const cell = String(row[colIndex] || '');
                    return cell.includes(String(filterValue));
                });
            }
        }

        return {
            success: true,
            data: result,
            rowCount: result.length
        };
    }
}

module.exports = new ExcelReader();