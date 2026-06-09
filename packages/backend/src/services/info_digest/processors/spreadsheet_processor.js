/**
 * @file spreadsheet_processor.js
 * @description 表格处理器 - 解析 Excel 和 CSV 文件内容，
 *              提取工作表数据并使用 LLM 进行智能分析
 * @module info_digest
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const XLSX = require('xlsx');
const { logger } = require('../../../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** 单个工作表最大保留行数，超出部分截断以控制 LLM 输入长度 */
const MAX_ROWS_PER_SHEET = 500;

/** 工作表数据预览显示的行数 */
const PREVIEW_ROW_COUNT = 10;

// ============================================================
// 核心类：SpreadsheetProcessor
// 功能说明：Excel/CSV 解析、数据截断和 LLM 分析
// ============================================================

class SpreadsheetProcessor {

    /**
     * @description 处理 Excel/CSV 文件，解析后由 LLM 分析
     * @param {Buffer} buffer - 表格文件的 Buffer 数据
     * @param {string} question - 用户问题
     * @param {string} filename - 文件名
     * @param {Object} llmService - LLM 服务实例
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object, message?: string}>} 处理结果
     */
    async process(buffer, question, filename, llmService) {
        try {
            // 解析表格工作簿
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetData = this._extractSheetData(workbook);

            // 构建表格描述（用于日志/调试）
            const tableDesc = this._formatSheets(workbook.SheetNames, sheetData);

            // 截取数据，避免过长超出 LLM 上下文
            const truncatedData = this._truncateData(sheetData, MAX_ROWS_PER_SHEET);

            // 构建提示词
            const prompt = this._buildPrompt(truncatedData, question, {
                filename,
                sheets: workbook.SheetNames,
                totalRows: Object.values(sheetData).reduce((sum, s) => sum + (s.data?.length || 0), 0)
            });

            // 调用 LLM 分析
            const result = await llmService.generateReply(prompt, '');

            return {
                success: true,
                type: 'spreadsheet',
                content: result.text || result,
                metadata: {
                    sheets: workbook.SheetNames,
                    totalRows: Object.values(sheetData).reduce((sum, s) => sum + (s.data?.length || 0), 0)
                }
            };

        } catch (error) {
            logger.error('[表格处理] 失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * @description 从工作簿中提取所有工作表的数据
     * @param {Object} workbook - XLSX 解析后的工作簿对象
     * @returns {Object<string, {name: string, data: Array, rowCount: number}>} 工作表名到数据的映射
     * @private
     */
    _extractSheetData(workbook) {
        const result = {};

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            // header: 1 表示按行输出为二维数组
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            result[sheetName] = {
                name: sheetName,
                data: data,
                rowCount: data.length
            };
        }

        return result;
    }

    /**
     * @description 格式化所有工作表为可读文本
     * @param {string[]} sheetNames - 工作表名称列表
     * @param {Object} sheetData - 工作表数据映射
     * @returns {string} 格式化后的文本
     * @private
     */
    _formatSheets(sheetNames, sheetData) {
        return sheetNames.map(name => {
            const sheet = sheetData[name];
            return this._formatSheet(name, sheet);
        }).join('\n\n');
    }

    /**
     * @description 格式化单个工作表为可读文本，包含表头和前 PREVIEW_ROW_COUNT 行数据预览
     * @param {string} sheetName - 工作表名称
     * @param {Object} sheet - 工作表数据对象
     * @param {Array} sheet.data - 行数据数组
     * @returns {string} 格式化后的文本
     * @private
     */
    _formatSheet(sheetName, sheet) {
        const lines = [`【工作表: ${sheetName}】`];

        if (sheet.data && sheet.data.length > 0) {
            // 第一行作为表头
            const headers = sheet.data[0] || [];
            lines.push('表头: ' + headers.join(' | '));

            // 添加前 PREVIEW_ROW_COUNT 行数据预览
            const previewRows = sheet.data.slice(1, 1 + PREVIEW_ROW_COUNT);
            lines.push('数据预览:');

            for (const row of previewRows) {
                lines.push('  ' + (row || []).join(' | '));
            }

            // 超出预览行数时显示总行数提示
            if (sheet.data.length > 1 + PREVIEW_ROW_COUNT) {
                lines.push(`  ... 共 ${sheet.data.length - 1} 行数据`);
            }
        }

        return lines.join('\n');
    }

    /**
     * @description 截断工作表数据，每个工作表只保留前 maxRows 行
     * @param {Object} sheetData - 工作表数据映射
     * @param {number} maxRows - 每个工作表最大保留行数
     * @returns {Object} 截断后的工作表数据，包含 truncated 标记
     * @private
     */
    _truncateData(sheetData, maxRows) {
        const result = {};

        for (const [name, sheet] of Object.entries(sheetData)) {
            result[name] = {
                ...sheet,
                data: sheet.data?.slice(0, maxRows) || [],
                truncated: (sheet.data?.length || 0) > maxRows
            };
        }

        return result;
    }

    /**
     * @description 构建 LLM 分析表格数据用的提示词
     * @param {Object} sheetData - 工作表数据映射
     * @param {string} question - 用户问题，为空时生成分析提示
     * @param {Object} metadata - 附加元数据
     * @param {string} [metadata.filename] - 文件名
     * @param {string[]} [metadata.sheets] - 工作表名称列表
     * @param {number} [metadata.totalRows] - 总行数
     * @returns {string} 构建好的提示词
     * @private
     */
    _buildPrompt(sheetData, question, metadata = {}) {
        let prompt = '以下是表格数据：\n\n';

        prompt += this._formatSheets(Object.keys(sheetData), sheetData);

        // 添加文件名信息
        if (metadata.filename) {
            prompt = `文件: ${metadata.filename}\n\n` + prompt;
        }

        // 添加统计摘要
        prompt += `\n\n共有 ${metadata.sheets?.length || 0} 个工作表，${metadata.totalRows || 0} 行数据。`;

        // 根据是否有问题决定提示词方向
        if (question) {
            prompt += '\n\n请根据以上表格数据回答问题：' + question;
        } else {
            prompt += '\n\n请分析这份表格数据的特点和关键信息。';
        }

        return prompt;
    }
}

module.exports = new SpreadsheetProcessor();
