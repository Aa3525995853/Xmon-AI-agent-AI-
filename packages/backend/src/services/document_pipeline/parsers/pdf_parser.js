/**
 * @file pdf_parser.js
 * @description PDF 解析器 - 使用 pdf-parse 库从 PDF 文件中提取纯文本内容
 * @module services/document_pipeline/parsers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');
const { logger } = require('../../../utils/logger');

class PdfParser {
    /**
     * @description 解析 PDF 文件，提取纯文本内容
     * @param {string} filepath - PDF 文件路径
     * @returns {Promise<{content: string, metadata: {type: string, name: string, pages: number, size: number, error?: string}}>} 解析结果
     */
    async parse(filepath) {
        try {
            const buffer = fs.readFileSync(filepath);
            const data = await pdfParse(buffer);

            return {
                content: data.text,
                metadata: {
                    type: 'pdf',
                    name: path.basename(filepath),
                    pages: data.numpages,
                    size: buffer.length
                }
            };

        } catch (error) {
            logger.error('[PDF解析] 失败:', error);
            return { content: '', metadata: { error: error.message } };
        }
    }

    /**
     * @description 解析 PDF Buffer，提取纯文本内容
     * @param {Buffer} buffer - PDF 文件 Buffer
     * @returns {Promise<{content: string, metadata: {type: string, pages: number, error?: string}}>} 解析结果
     */
    async parseBuffer(buffer) {
        try {
            const data = await pdfParse(buffer);
            return {
                content: data.text,
                metadata: {
                    type: 'pdf',
                    pages: data.numpages
                }
            };
        } catch (error) {
            logger.error('[PDF解析] 失败:', error);
            return { content: '', metadata: { error: error.message } };
        }
    }
}

module.exports = new PdfParser();