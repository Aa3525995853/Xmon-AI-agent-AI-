/**
 * @file word_parser.js
 * @description Word 解析器 - 使用 mammoth 库从 .docx/.doc 文件中提取纯文本内容
 * @module services/document_pipeline/parsers
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const mammoth = require('mammoth');
const path = require('path');
const { logger } = require('../../../utils/logger');

class WordParser {
    /**
     * @description 解析 Word 文件，提取纯文本内容
     * @param {string} filepath - Word 文件路径
     * @returns {Promise<{content: string, metadata: {type: string, name: string, size: number, error?: string}}>} 解析结果
     */
    async parse(filepath) {
        try {
            const buffer = fs.readFileSync(filepath);
            const result = await mammoth.extractRawText({ buffer });

            return {
                content: result.value,
                metadata: {
                    type: 'word',
                    name: path.basename(filepath),
                    size: buffer.length
                }
            };

        } catch (error) {
            logger.error('[Word解析] 失败:', error);
            return { content: '', metadata: { error: error.message } };
        }
    }

    /**
     * @description 解析 Word 文件 Buffer，提取纯文本内容
     * @param {Buffer} buffer - Word 文件 Buffer
     * @returns {Promise<{content: string, metadata: {type: string, messages?: Array, error?: string}}>} 解析结果
     */
    async parseBuffer(buffer) {
        try {
            const result = await mammoth.extractRawText({ buffer });
            return {
                content: result.value,
                metadata: {
                    type: 'word',
                    messages: result.messages
                }
            };
        } catch (error) {
            logger.error('[Word解析] 失败:', error);
            return { content: '', metadata: { error: error.message } };
        }
    }
}

module.exports = new WordParser();