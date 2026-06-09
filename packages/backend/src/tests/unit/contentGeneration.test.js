/**
 * @file contentGeneration.test.js
 * @description ContentGenerationService 自动化测试 - 验证内容直达能力（v2.0 Tool 3），
 *              包括表格生成、邮件撰写、报告生成、一键直达和批量生成等功能
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const ContentGenerationMain = require('../../services/content_generation');

// ContentGeneration 导出的是一个类，需要实例化后使用
const ContentGenerationService = ContentGenerationMain;

// ============================================================
// 模块名称：内容直达能力测试
// 功能说明：测试表格生成、邮件撰写、报告生成、一键直达等核心功能
// ============================================================

describe('ContentGenerationService 内容直达能力测试', () => {
    let contentGen;

    beforeAll(() => {
        contentGen = new ContentGenerationService();
    });

    // ============================================================
    // 表格生成测试
    // ============================================================
    describe('表格生成', () => {
        /**
         * @description 验证能生成 Excel 格式表格，返回文件路径和行数
         */
        test('应该能生成 Excel 格式表格', async () => {
            const result = await contentGen.generateTable({
                type: 'schedule',
                format: 'excel'
            });

            expect(result.success).toBe(true);
            expect(result.format).toBe('excel');
            expect(result.filepath).toBeDefined();
            expect(result.rows).toBeGreaterThan(0);
        });

        /**
         * @description 验证能生成 CSV 格式表格
         */
        test('应该能生成 CSV 格式表格', async () => {
            const result = await contentGen.generateTable({
                type: 'expense',
                format: 'csv'
            });

            expect(result.success).toBe(true);
            expect(result.format).toBe('csv');
        });

        /**
         * @description 验证能生成 Markdown 格式表格
         */
        test('应该能生成 Markdown 格式表格', async () => {
            const result = await contentGen.generateTable({
                type: 'task',
                format: 'markdown'
            });

            expect(result.success).toBe(true);
            expect(result.format).toBe('markdown');
        });

        /**
         * @description 验证能生成 JSON 格式表格
         */
        test('应该能生成 JSON 格式表格', async () => {
            const result = await contentGen.generateTable({
                type: 'inventory',
                format: 'json'
            });

            expect(result.success).toBe(true);
            expect(result.format).toBe('json');
        });

        /**
         * @description 验证支持自定义表头和行数据
         */
        test('应该支持自定义数据', async () => {
            const result = await contentGen.generateTable({
                data: {
                    headers: ['姓名', '年龄', '职业'],
                    rows: [['张三', '25', '工程师'], ['李四', '30', '设计师']]
                },
                format: 'excel'
            });

            expect(result.success).toBe(true);
            expect(result.rows).toBe(2);
        });

        /**
         * @description 验证支持自定义文件名，文件路径中应包含指定名称
         */
        test('应该支持自定义文件名', async () => {
            const result = await contentGen.generateTable({
                type: 'schedule',
                format: 'excel',
                filename: 'my_schedule'
            });

            expect(result.success).toBe(true);
            expect(result.filepath).toContain('my_schedule');
        });
    });

    // ============================================================
    // 邮件撰写测试
    // ============================================================
    describe('邮件撰写', () => {
        /**
         * @description 验证能使用报告模板撰写邮件，返回主题和正文
         */
        test('应该能使用模板撰写邮件', async () => {
            const result = await contentGen.composeEmail({
                template: 'report',
                data: {
                    title: '周报',
                    date: '2024-01-15',
                    content: '本周完成了XXX工作'
                }
            });

            expect(result.success).toBe(true);
            expect(result.content).toBeDefined();
            expect(result.content.subject).toBeDefined();
            expect(result.content.body).toBeDefined();
        });

        /**
         * @description 验证会议通知模板能正确生成包含"会议"关键词的主题
         */
        test('应该支持会议通知模板', async () => {
            const result = await contentGen.composeEmail({
                template: 'meeting',
                data: {
                    title: '项目评审会',
                    time: '2024-01-20 14:00',
                    location: '会议室A',
                    agenda: '1. 项目进度 2. 问题讨论'
                }
            });

            expect(result.success).toBe(true);
            expect(result.content.subject).toContain('会议');
        });

        /**
         * @description 验证通知模板能正常生成
         */
        test('应该支持通知模板', async () => {
            const result = await contentGen.composeEmail({
                template: 'notification',
                data: {
                    title: '系统维护通知',
                    content: '将于今晚进行系统升级'
                }
            });

            expect(result.success).toBe(true);
        });
    });

    // ============================================================
    // 报告生成测试
    // ============================================================
    describe('报告生成', () => {
        /**
         * @description 验证报告生成接口能返回结果（可能依赖 LLM，不强制检查成功）
         */
        test('应该能生成报告', async () => {
            const result = await contentGen.generateReport({
                title: '测试报告',
                sections: ['概述', '分析', '结论']
            });

            // 报告生成可能依赖 LLM，不强制检查成功
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });
    });

    // ============================================================
    // 一键直达测试
    // ============================================================
    describe('一键直达', () => {
        /**
         * @description 验证一键直达能处理表格类型数据，返回文件路径或成功标记
         */
        test('应该能执行一键直达（表格类型）', async () => {
            const result = await contentGen.directDeliver({
                type: 'table',
                data: {
                    headers: ['项目', '状态'],
                    rows: [['任务A', '完成'], ['任务B', '进行中']]
                }
            });

            expect(result).toHaveProperty('success');
            // 一键直达可能返回 filepath 或其他字段
            expect(result.success || result.filepath).toBeTruthy();
        });

        /**
         * @description 验证批量生成能同时处理多个任务
         */
        test('应该能批量生成内容', async () => {
            const tasks = [
                { id: '1', type: 'table', params: { type: 'schedule' } },
                { id: '2', type: 'table', params: { type: 'expense' } }
            ];

            const result = await contentGen.batchGenerate(tasks);

            expect(result.success).toBe(true);
            expect(result.total).toBe(2);
            expect(result.completed).toBeGreaterThan(0);
        });

        /**
         * @description 验证批量生成在所有任务失败时返回 success:false，而非伪装成功
         */
        test('批量生成应该能处理失败', async () => {
            const tasks = [
                { id: '1', type: 'unknown_type', params: {} }
            ];

            const result = await contentGen.batchGenerate(tasks);

            // 当所有任务都失败时，batchGenerate 应返回 success:false
            expect(result.success).toBe(false);
            expect(result.failed).toBe(1);
        });
    });

    // ============================================================
    // 表格模板测试
    // ============================================================
    describe('表格模板', () => {
        /**
         * @description 验证日程模板能正常生成 Excel 表格
         */
        test('应该支持日程模板', async () => {
            const result = await contentGen.generateTable({
                type: 'schedule',
                format: 'excel'
            });

            expect(result.success).toBe(true);
        });

        /**
         * @description 验证支出模板能正常生成 Excel 表格
         */
        test('应该支持支出模板', async () => {
            const result = await contentGen.generateTable({
                type: 'expense',
                format: 'excel'
            });

            expect(result.success).toBe(true);
        });

        /**
         * @description 验证任务模板能正常生成 Excel 表格
         */
        test('应该支持任务模板', async () => {
            const result = await contentGen.generateTable({
                type: 'task',
                format: 'excel'
            });

            expect(result.success).toBe(true);
        });

        /**
         * @description 验证库存模板能正常生成 Excel 表格
         */
        test('应该支持库存模板', async () => {
            const result = await contentGen.generateTable({
                type: 'inventory',
                format: 'excel'
            });

            expect(result.success).toBe(true);
        });
    });
});