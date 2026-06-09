/**
 * @file document_processor.js
 * @description 文档处理器 - 解析 PDF 和 Word 文档内容，
 *              使用 LLM 进行智能分析和摘要
 * @module info_digest
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { logger } = require('../../../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** 文档内容最大截取字符数，避免超出 LLM 上下文限制 */
const DOCUMENT_MAX_CONTENT_LENGTH = 10000;

// ============================================================
// 核心类：DocumentProcessor
// 功能说明：PDF/Word 文档解析与 LLM 分析
// ============================================================

class DocumentProcessor {

    /**
     * @description 处理 PDF 文档，解析文本后由 LLM 分析
     * @param {Buffer} buffer - PDF 文件的 Buffer 数据
     * @param {string} question - 用户问题
     * @param {string} filename - 文件名
     * @param {Object} llmService - LLM 服务实例
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object, message?: string}>} 处理结果
     */
    async processPDF(buffer, question, filename, llmService) {
        try {
            // 解析 PDF 提取文本
            const data = await pdfParse(buffer);
            const text = data.text;

            // 截取前 DOCUMENT_MAX_CONTENT_LENGTH 字符，避免超出 LLM 上下文限制
            const truncatedText = text.substring(0, DOCUMENT_MAX_CONTENT_LENGTH);
            const wasTruncated = text.length > DOCUMENT_MAX_CONTENT_LENGTH;

            // 构建提示词
            const prompt = this._buildPrompt(truncatedText, question, {
                filename,
                totalPages: data.numpages,
                wasTruncated
            });

            // 调用 LLM 分析
            const result = await llmService.generateReply(prompt, '');

            return {
                success: true,
                type: 'pdf',
                content: result.text || result,
                metadata: {
                    pages: data.numpages,
                    wasTruncated
                }
            };

        } catch (error) {
            logger.error('[PDF处理] 失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * @description 处理 Word 文档，解析文本后由 LLM 分析
     * @param {Buffer} buffer - Word 文件的 Buffer 数据
     * @param {string} question - 用户问题
     * @param {string} filename - 文件名
     * @param {Object} llmService - LLM 服务实例
     * @returns {Promise<{success: boolean, type: string, content?: string, metadata?: Object, message?: string}>} 处理结果
     */
    async processWord(buffer, question, filename, llmService) {
        try {
            // 使用 mammoth 提取 Word 文档纯文本
            const result = await mammoth.extractRawText({ buffer });
            const text = result.value;

            // 截取前 DOCUMENT_MAX_CONTENT_LENGTH 字符
            const truncatedText = text.substring(0, DOCUMENT_MAX_CONTENT_LENGTH);
            const wasTruncated = text.length > DOCUMENT_MAX_CONTENT_LENGTH;

            // 构建提示词
            const prompt = this._buildPrompt(truncatedText, question, {
                filename,
                wasTruncated
            });

            // 调用 LLM 分析
            const llmResult = await llmService.generateReply(prompt, '');

            return {
                success: true,
                type: 'word',
                content: llmResult.text || llmResult,
                metadata: { wasTruncated }
            };

        } catch (error) {
            logger.error('[Word处理] 失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * @description 构建 LLM 分析文档用的提示词
     * @param {string} text - 文档文本内容
     * @param {string} question - 用户问题，为空时生成总结提示
     * @param {Object} metadata - 附加元数据
     * @param {string} [metadata.filename] - 文件名
     * @param {number} [metadata.totalPages] - PDF 总页数
     * @param {boolean} [metadata.wasTruncated] - 内容是否被截断
     * @returns {string} 构建好的提示词
     * @private
     */
    _buildPrompt(text, question, metadata = {}) {
        let prompt = '以下是文档内容：\n\n' + text;

        // 添加文件名信息
        if (metadata.filename) {
            prompt = `文件: ${metadata.filename}\n\n` + prompt;
        }

        // 根据是否有问题决定提示词方向
        if (question) {
            prompt += '\n\n请回答以下问题：' + question;
        } else {
            prompt += '\n\n请总结这份文档的主要内容。';
        }

        // 截断时提醒 LLM 注意信息不完整
        if (metadata.wasTruncated) {
            prompt += '\n\n注意：文档内容已被截断，仅显示前 ' + DOCUMENT_MAX_CONTENT_LENGTH + ' 字符。';
        }

        return prompt;
    }

    /**
     * @description 提取文档摘要，返回前 maxLength 字符作为摘要
     * @param {Buffer} buffer - 文档 Buffer 数据
     * @param {string} type - 文档类型（'pdf' 或其他为 Word）
     * @param {number} [maxLength=500] - 摘要最大字符数
     * @returns {Promise<string>} 文档摘要文本
     * @throws {Error} 文档解析失败时抛出异常
     */
    async extractSummary(buffer, type, maxLength = 500) {
        let text = '';

        if (type === 'pdf') {
            const data = await pdfParse(buffer);
            text = data.text;
        } else {
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
        }

        // 返回前 maxLength 字符作为摘要
        return text.substring(0, maxLength);
    }
}

module.exports = new DocumentProcessor();
