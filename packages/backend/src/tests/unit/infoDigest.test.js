/**
 * @file infoDigest.test.js
 * @description InfoDigestService 自动化测试 - 验证信息消化能力（v2.0 Tool 2），
 *              包括文件类型检测、文本处理与问答、内容存储、摘要提取和 URL 处理等功能
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const InfoDigestService = require('../../services/info_digest_service');

/** 摘要截取的最大长度，超过此长度会添加省略号 */
const SUMMARY_MAX_LENGTH = 100;

/** 不存在的内容 ID，用于测试错误处理 */
const NON_EXISTENT_CONTENT_ID = 99999;

// ============================================================
// 模块名称：信息消化能力测试
// 功能说明：测试文件类型检测、文本问答、内容存储、摘要提取等核心功能
// ============================================================

describe('InfoDigestService 信息消化能力测试', () => {
    let infoDigest;

    beforeAll(() => {
        infoDigest = new InfoDigestService();
    });

    // ============================================================
    // 类型检测测试
    // ============================================================
    describe('类型检测', () => {
        /**
         * @description 验证能根据 MIME 类型检测图片文件
         */
        test('应该检测图片文件', () => {
            const type = infoDigest.detectType('photo.jpg', 'image/jpeg');
            expect(type).toBe('image');
        });

        /**
         * @description 验证能根据 MIME 类型检测 PDF 文件
         */
        test('应该检测 PDF 文件', () => {
            const type = infoDigest.detectType('document.pdf', 'application/pdf');
            expect(type).toBe('pdf');
        });

        /**
         * @description 验证能根据 MIME 类型检测 Excel 文件
         */
        test('应该检测 Excel 文件', () => {
            const type = infoDigest.detectType('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            expect(type).toBe('excel');
        });

        /**
         * @description 验证能根据 MIME 类型检测 CSV 文件
         */
        test('应该检测 CSV 文件', () => {
            const type = infoDigest.detectType('data.csv', 'text/csv');
            expect(type).toBe('csv');
        });

        /**
         * @description 验证能根据 MIME 类型检测 Word 文件
         */
        test('应该检测 Word 文件', () => {
            const type = infoDigest.detectType('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            expect(type).toBe('word');
        });

        /**
         * @description 验证能根据 MIME 类型检测音频文件
         */
        test('应该检测音频文件', () => {
            const type = infoDigest.detectType('audio.mp3', 'audio/mpeg');
            expect(type).toBe('audio');
        });

        /**
         * @description 验证能根据 MIME 类型检测视频文件
         */
        test('应该检测视频文件', () => {
            const type = infoDigest.detectType('video.mp4', 'video/mp4');
            expect(type).toBe('video');
        });

        /**
         * @description 验证在 MIME 类型缺失时能根据文件扩展名回退检测类型
         */
        test('应该根据扩展名检测类型', () => {
            const type = infoDigest.detectType('image.png', null);
            expect(type).toBe('image');
        });
    });

    // ============================================================
    // 文本处理测试
    // ============================================================
    describe('文本处理', () => {
        /**
         * @description 验证能处理纯文本并返回分析结果
         */
        test('应该能处理纯文本', async () => {
            const result = await infoDigest.processText(
                '这是一段测试文本，用于测试信息消化功能。',
                '这段话的主题是什么？'
            );
            expect(result.success).toBe(true);
            expect(result.content).toBeDefined();
        });

        /**
         * @description 验证能对已存储的内容进行问答交互
         */
        test('应该能对已处理的内容进行问答', async () => {
            // 先存储内容，获取内容 ID
            const contentId = infoDigest.storeContent('text', '小梦是一个智能助手', 'test.txt');
            expect(contentId).toBeGreaterThan(0);

            // 使用内容 ID 进行问答
            const result = await infoDigest.answerAboutContent(contentId, '这是什么？');
            expect(result.success).toBe(true);
            expect(result.answer).toBeDefined();
        });

        /**
         * @description 验证查询不存在的内容 ID 时返回错误而非空数据
         */
        test('不存在的内容应该返回错误', async () => {
            const result = await infoDigest.answerAboutContent(NON_EXISTENT_CONTENT_ID, '问题');
            expect(result.success).toBe(false);
        });
    });

    // ============================================================
    // 内容存储测试
    // ============================================================
    describe('内容存储', () => {
        /**
         * @description 验证能存储不同类型的内容并返回递增的 ID
         */
        test('应该能存储已分析的内容', () => {
            const id1 = infoDigest.storeContent('text', '内容1', 'test1.txt');
            const id2 = infoDigest.storeContent('image', '图片描述', 'test2.jpg');

            expect(id1).toBeGreaterThan(0);
            // 后存储的内容 ID 应大于先存储的
            expect(id2).toBeGreaterThan(id1);
        });

        /**
         * @description 验证能获取已存储的内容列表
         */
        test('应该能获取已存储的内容列表', () => {
            const content = infoDigest.getStoredContent();
            expect(content).toBeInstanceOf(Array);
            expect(content.length).toBeGreaterThan(0);
        });

        /**
         * @description 验证内容列表按时间倒序排列（最新的在前）
         */
        test('应该按时间倒序返回', () => {
            const content = infoDigest.getStoredContent();
            for (let i = 1; i < content.length; i++) {
                expect(content[i - 1].timestamp).toBeGreaterThanOrEqual(content[i].timestamp);
            }
        });
    });

    // ============================================================
    // 摘要提取测试
    // ============================================================
    describe('摘要提取', () => {
        /** 用于测试截取功能的长文本长度 */
        const LONG_TEXT_LENGTH = 300;

        /**
         * @description 验证长文本能被截取到指定长度并添加省略号
         */
        test('应该能截取长文本', () => {
            const longText = 'a'.repeat(LONG_TEXT_LENGTH);
            const summary = infoDigest.extractSummary(longText, SUMMARY_MAX_LENGTH);
            // 截取后长度 = SUMMARY_MAX_LENGTH + '...' 的长度（3个字符）
            expect(summary.length).toBe(SUMMARY_MAX_LENGTH + 3);
            expect(summary.endsWith('...')).toBe(true);
        });

        /**
         * @description 验证短文本不会被截取，原样返回
         */
        test('短文本不应该被截取', () => {
            const shortText = '短文本';
            const summary = infoDigest.extractSummary(shortText, SUMMARY_MAX_LENGTH);
            expect(summary).toBe(shortText);
        });

        /**
         * @description 验证空值输入返回空字符串而非报错
         */
        test('空文本应该返回空字符串', () => {
            const summary = infoDigest.extractSummary(null, SUMMARY_MAX_LENGTH);
            expect(summary).toBe('');
        });
    });

    // ============================================================
    // URL 处理测试
    // ============================================================
    describe('URL 处理', () => {
        /**
         * @description 验证 URL 处理接口能返回结果（不检查成功，因网络可能不可达）
         */
        test('应该能处理 URL 格式', async () => {
            // 这是一个模拟测试，实际网络请求可能失败
            const result = await infoDigest.processURL('https://example.com', '这个网站是关于什么的？');
            // 不检查成功，因为网络可能不可达
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('type');
        });
    });
});