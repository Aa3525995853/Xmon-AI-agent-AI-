/**
 * @file image_processor.js
 * @description 图片处理器 - 使用 LLM Vision API 分析图片内容，
 *              支持图片描述、OCR 文字提取和图片压缩
 * @module info_digest
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../../utils/logger');

// ============================================================
// 常量定义
// ============================================================

/** 图片压缩的最大字节数（1MB），超出此大小应压缩 */
const MAX_IMAGE_SIZE_BYTES = 1024 * 1024;

/**
 * 图片文件头魔数映射表 - 用于根据文件头字节检测真实图片格式
 * 键为魔数特征（十六进制），值为对应的 MIME 类型
 */
const IMAGE_MAGIC_NUMBERS = [
    { bytes: [0xFF, 0xD8], mime: 'image/jpeg' },       // JPEG: FF D8
    { bytes: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },  // PNG: 89 50 4E 47
    { bytes: [0x47, 0x49, 0x46], mime: 'image/gif' },   // GIF: 47 49 46
    { bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' }, // WebP: 52 49 46 46 (RIFF)
    { bytes: [0x42, 0x4D], mime: 'image/bmp' },          // BMP: 42 4D
];

/** 无法识别图片格式时的默认 MIME 类型 */
const DEFAULT_IMAGE_MIME = 'image/jpeg';

// ============================================================
// 核心类：ImageProcessor
// 功能说明：图片 Vision 分析、OCR 和压缩
// ============================================================

class ImageProcessor {

    /**
     * @description 根据文件头魔数检测图片的真实 MIME 类型
     * @param {Buffer} buffer - 图片 Buffer 数据
     * @returns {string} 检测到的 MIME 类型，无法识别时返回默认值
     */
    _detectMimeType(buffer) {
        if (!buffer || buffer.length < 4) {
            return DEFAULT_IMAGE_MIME;
        }

        for (const { bytes, mime } of IMAGE_MAGIC_NUMBERS) {
            let match = true;
            for (let i = 0; i < bytes.length; i++) {
                if (buffer[i] !== bytes[i]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return mime;
            }
        }

        // 无法识别格式时返回默认值
        return DEFAULT_IMAGE_MIME;
    }

    /**
     * @description 处理图片，使用 LLM Vision API 进行内容分析
     * @param {Buffer} buffer - 图片文件的 Buffer 数据
     * @param {string} question - 用户问题
     * @param {string} [context=''] - 上下文信息
     * @param {Object} llmService - LLM 服务实例，需支持 callVisionAPI 方法
     * @returns {Promise<{success: boolean, type: string, content?: string, raw?: Object, message?: string}>} 处理结果
     */
    async process(buffer, question, context = '', llmService) {
        try {
            // 将 Buffer 转换为 base64 编码供 Vision API 使用
            const base64 = buffer.toString('base64');
            // 【修复】根据文件头魔数检测真实 MIME 类型，而非硬编码为 JPEG
            const mimeType = this._detectMimeType(buffer);

            // 构建提示词
            const prompt = this._buildPrompt(question, context);

            // 优先使用 Vision API 进行图片理解
            if (llmService.callVisionAPI) {
                const result = await llmService.callVisionAPI(base64, prompt, mimeType);
                return {
                    success: true,
                    type: 'image',
                    content: result.text || result,
                    raw: result
                };
            }

            // Vision API 不可用时返回失败
            return {
                success: false,
                message: 'Vision API 不可用'
            };

        } catch (error) {
            logger.error('[图片处理] 失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * @description 构建 LLM Vision 分析图片用的提示词
     * @param {string} question - 用户问题，为空时生成描述提示
     * @param {string} context - 上下文信息
     * @returns {string} 构建好的提示词
     * @private
     */
    _buildPrompt(question, context) {
        let prompt = '请描述这张图片的内容。';

        // 有具体问题时替换默认描述提示
        if (question) {
            prompt = `请根据这张图片回答问题：${question}`;
        }

        // 附加背景信息帮助 LLM 理解上下文
        if (context) {
            prompt += `\n\n背景信息：${context}`;
        }

        prompt += '\n\n请用简洁、易懂的语言回答。';

        return prompt;
    }

    /**
     * @description 压缩图片，超过 maxSize 时应进行压缩（当前为简化实现）
     * @param {Buffer} buffer - 图片 Buffer 数据
     * @param {number} [maxSize=1048576] - 最大字节数，默认 1MB
     * @returns {Promise<Buffer>} 压缩后的图片 Buffer（当前未实际压缩）
     */
    async compress(buffer, maxSize = MAX_IMAGE_SIZE_BYTES) {
        // 未超出大小限制时直接返回原图
        if (buffer.length <= maxSize) {
            return buffer;
        }

        // TODO: 实际应使用 sharp 等库进行压缩，当前返回原图
        return buffer;
    }

    /**
     * @description 提取图片中的文字（OCR），通过 Vision API 实现
     * @param {Buffer} buffer - 图片 Buffer 数据
     * @param {Object} llmService - LLM 服务实例
     * @returns {Promise<string>} 提取的文字内容，失败返回空字符串
     */
    async extractText(buffer, llmService) {
        const result = await this.process(buffer, '请提取图片中的所有文字', '', llmService);
        return result.success ? result.content : '';
    }
}

module.exports = new ImageProcessor();
