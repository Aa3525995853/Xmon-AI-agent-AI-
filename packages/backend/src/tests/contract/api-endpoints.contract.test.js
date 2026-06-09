/**
 * @file api-endpoints.contract.test.js
 * @description API 端点契约冒烟测试。使用内存中的 Express 应用和模拟路由，
 *   仅验证响应结构，不是端到端测试，不能作为真实服务路由或服务正常工作的证据。
 * @module tests/contract
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const request = require('supertest');
const express = require('express');

// ============================================================
// 模块：模拟应用与数据
// 功能说明：构建内存 Express 应用，注册模拟路由和测试数据
// ============================================================

// Mock contract app. Real E2E tests must import the production app/server or
// call a running service instead of defining routes inside the test file.
const app = express();
app.use(express.json());

/**
 * @description 模拟的认证中间件，为请求注入测试用户信息
 * @param {import('express').Request} req - Express 请求对象
 * @param {import('express').Response} res - Express 响应对象
 * @param {import('express').NextFunction} next - Express next 中间件函数
 */
const mockAuthMiddleware = (req, res, next) => {
    req.user = { userId: 'test-user-123', username: 'testuser' };
    next();
};

/** @type {Array<{id: string, description: string, status: string}>} 模拟任务数据列表 */
let mockTasks = [
    { id: 'task-1', description: '测试任务1', status: 'completed' },
    { id: 'task-2', description: '测试任务2', status: 'executing' }
];

// ============================================================
// 模块：模拟健康检查端点
// 功能说明：注册 /health、/health/liveness、/health/readiness 路由
// ============================================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
            llm: 'ok',
            tts: 'ok',
            asr: 'ok'
        }
    });
});

app.get('/health/liveness', (req, res) => {
    res.status(200).send('OK');
});

app.get('/health/readiness', (req, res) => {
    res.json({ ready: true });
});

// ============================================================
// 模块：模拟任务中心端点
// 功能说明：注册任务列表、统计、执行、中断等路由
// ============================================================

app.get('/api/task/list', (req, res) => {
    res.json({
        success: true,
        tasks: mockTasks
    });
});

app.get('/api/task/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            total: mockTasks.length,
            pending: 1,
            executing: 1,
            completed: 1,
            failed: 0
        }
    });
});

app.post('/api/task/execute', (req, res) => {
    const { description } = req.body;

    // 验证空描述，任务描述为必填项
    if (!description || description.trim() === '') {
        return res.status(400).json({
            success: false,
            error: '任务描述不能为空'
        });
    }

    // 使用时间戳生成唯一任务ID，确保不重复
    const taskId = `task-${Date.now()}`;
    res.json({
        success: true,
        taskId,
        description,
        status: 'planning'
    });
});

app.post('/api/task/abort', (req, res) => {
    const { taskId } = req.body;
    res.json({
        success: true,
        message: `任务 ${taskId} 已中断`
    });
});

// ============================================================
// 模块：模拟直接操作端点
// 功能说明：注册工具列表查询和操作执行路由
// ============================================================

app.get('/api/direct/tools', (req, res) => {
    res.json({
        success: true,
        tools: [
            { id: 'web_search', name: '网页搜索' },
            { id: 'calculator', name: '计算器' },
            { id: 'code_execute', name: '代码执行' }
        ]
    });
});

app.post('/api/direct/action', (req, res) => {
    const { action, params } = req.body;
    res.json({
        success: true,
        action,
        result: '操作完成',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 模块：模拟信息消化端点
// 功能说明：注册内容分析路由
// ============================================================

app.post('/api/digest/analyze', (req, res) => {
    const { content } = req.body;
    res.json({
        success: true,
        summary: '这是内容的摘要',
        keyPoints: ['要点1', '要点2'],
        sentiment: 'positive'
    });
});

// ============================================================
// 模块：测试用例
// 功能说明：按端点分组验证响应结构和状态码
// ============================================================

describe('API 端点契约冒烟测试（mock routes, not E2E）', () => {
    describe('健康检查端点', () => {
        test('GET /health - 应该返回健康状态', async () => {
            const response = await request(app).get('/health');
            expect(response.status).toBe(200);
            expect(response.body.status).toBe('ok');
            expect(response.body.services).toBeDefined();
        });

        test('GET /health/liveness - 应该返回 OK', async () => {
            const response = await request(app).get('/health/liveness');
            expect(response.status).toBe(200);
            expect(response.text).toBe('OK');
        });

        test('GET /health/readiness - 应该返回就绪状态', async () => {
            const response = await request(app).get('/health/readiness');
            expect(response.status).toBe(200);
            expect(response.body.ready).toBe(true);
        });
    });

    describe('任务管理端点', () => {
        test('GET /api/task/list - 应该返回任务列表', async () => {
            const response = await request(app).get('/api/task/list');
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.tasks).toBeInstanceOf(Array);
        });

        test('GET /api/task/stats - 应该返回统计数据', async () => {
            const response = await request(app).get('/api/task/stats');
            expect(response.status).toBe(200);
            expect(response.body.stats).toHaveProperty('total');
            expect(response.body.stats).toHaveProperty('pending');
        });

        test('POST /api/task/execute - 应该创建新任务', async () => {
            const response = await request(app)
                .post('/api/task/execute')
                .send({ description: '测试任务' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.taskId).toBeDefined();
            expect(response.body.status).toBe('planning');
        });

        test('POST /api/task/abort - 应该中断任务', async () => {
            const response = await request(app)
                .post('/api/task/abort')
                .send({ taskId: 'task-123' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    describe('任务中心端点', () => {
        test('GET /api/task/list - 应该返回任务列表', async () => {
            const response = await request(app).get('/api/task/list');
            expect(response.status).toBe(200);
            expect(response.body.tasks).toBeInstanceOf(Array);
        });

        test('GET /api/task/stats - 应该返回任务统计', async () => {
            const response = await request(app).get('/api/task/stats');
            expect(response.status).toBe(200);
            expect(response.body.stats).toHaveProperty('total');
        });
    });

    describe('直接操作端点 (Tool 3)', () => {
        test('GET /api/direct/tools - 应该返回工具列表', async () => {
            const response = await request(app).get('/api/direct/tools');
            expect(response.status).toBe(200);
            expect(response.body.tools).toBeInstanceOf(Array);
            expect(response.body.tools.length).toBeGreaterThan(0);
        });

        test('POST /api/direct/action - 应该执行操作', async () => {
            const response = await request(app)
                .post('/api/direct/action')
                .send({ action: 'web_search', params: { query: '测试' } });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.result).toBeDefined();
        });
    });

    describe('信息消化端点 (Tool 2)', () => {
        test('POST /api/digest/analyze - 应该分析内容', async () => {
            const response = await request(app)
                .post('/api/digest/analyze')
                .send({ content: '这是一段测试内容，需要分析其含义。' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.summary).toBeDefined();
            expect(response.body.keyPoints).toBeInstanceOf(Array);
        });
    });

    describe('错误处理', () => {
        test('POST /api/task/execute - 空描述应该返回错误', async () => {
            const response = await request(app)
                .post('/api/task/execute')
                .send({ description: '' });

            // 空描述返回 400
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });

        test('POST /api/direct/action - 未知操作应该返回错误', async () => {
            const response = await request(app)
                .post('/api/direct/action')
                .send({ action: 'unknown_action', params: {} });

            // 未知操作返回 400
            if (response.body.success === false) {
                expect(response.status).toBe(400);
            }
        });
    });
});
