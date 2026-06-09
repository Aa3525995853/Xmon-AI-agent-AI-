/**
 * @file excel_writer.js
 * @description Excel 写入器 - 写入Excel文件（带格式化）、追加数据和格式转换
 * @module services/excel_intelligence
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { logger } = require('../../utils/logger');

class ExcelWriter {
    /**
     * @description 写入Excel文件，自动设置列宽和创建目录
     * @param {Array<Array>} data - 二维数据数组
     * @param {string} outputPath - 输出文件路径
     * @param {Object} [options={}] - 写入选项
     * @param {Array} [options.headers] - 表头数组
     * @param {string} [options.format='xlsx'] - 输出格式
     * @param {Object} [options.conditionalFormatting] - 条件格式配置
     * @returns {Promise<{success: boolean, filepath: string, url: string, rowCount: number}>} 写入结果
     */
    async write(data, outputPath, options = {}) {
        const { headers, format = 'xlsx', conditionalFormatting } = options;

        try {
            // 确保目录存在
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // 创建工作簿
            const wb = XLSX.utils.book_new();

            // 准备数据
            const wsData = headers ? [headers, ...data] : data;
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // 设置列宽
            if (headers) {
                ws['!cols'] = headers.map(h => ({ wch: Math.max(10, h.length + 2) }));
            }

            // 添加工作表
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

            // 写入文件
            const ext = path.extname(outputPath).toLowerCase() || '.xlsx';
            const finalPath = ext === '.xlsx' || ext === '.xls' ? outputPath : `${outputPath}.xlsx`;

            XLSX.writeFile(wb, finalPath);

            logger.info(`[Excel写入] 保存成功: ${finalPath}`);

            return {
                success: true,
                filepath: finalPath,
                url: `/uploads/${path.basename(finalPath)}`,
                rowCount: data.length
            };

        } catch (error) {
            logger.error('[Excel写入] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 追加数据到现有Excel文件，读取原有数据后合并写入
     * @param {string} filepath - Excel文件路径
     * @param {Array<Array>} newRows - 要追加的新数据行
     * @returns {Promise<{success: boolean, filepath: string, appended: number}>} 追加结果
     */
    async append(filepath, newRows) {
        try {
            if (!fs.existsSync(filepath)) {
                return { success: false, message: '文件不存在' };
            }

            const workbook = XLSX.readFile(filepath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const existingData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            // 追加新数据
            const allData = [...existingData, ...newRows];
            const ws = XLSX.utils.aoa_to_sheet(allData);

            workbook.Sheets[workbook.SheetNames[0]] = ws;
            XLSX.writeFile(workbook, filepath);

            return {
                success: true,
                filepath,
                appended: newRows.length
            };

        } catch (error) {
            logger.error('[Excel追加] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 将Excel文件转换为其他格式（CSV/JSON）
     * @param {string} inputPath - 源Excel文件路径
     * @param {string} outputPath - 输出文件路径
     * @param {string} [format='csv'] - 目标格式：csv/json
     * @returns {Promise<{success: boolean, input: string, output: string, format: string}>} 转换结果
     */
    async convert(inputPath, outputPath, format = 'csv') {
        try {
            const workbook = XLSX.readFile(inputPath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];

            let output;
            switch (format.toLowerCase()) {
                case 'csv':
                    output = XLSX.utils.sheet_to_csv(sheet);
                    break;
                case 'json':
                    const data = XLSX.utils.sheet_to_json(sheet);
                    output = JSON.stringify(data, null, 2);
                    break;
                default:
                    return { success: false, message: `不支持的格式: ${format}` };
            }

            fs.writeFileSync(outputPath, output, 'utf-8');

            return {
                success: true,
                input: inputPath,
                output: outputPath,
                format
            };

        } catch (error) {
            logger.error('[Excel转换] 失败:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = new ExcelWriter();