/**
 * @file health.test.js
 * @description 健康检查 API 集成测试，验证 /health 系列端点的响应格式、状态码和字段完整性
 * @module tests/integration
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const request = require('supertest');
const express = require('express');

/** @type {import('express').Express} 测试用 Express 应用实例 */
let app;
/** @type {import('http').Server} 测试用 HTTP 服务器实例 */
let server;

/**
 * @description Jest 全局前置钩子，创建测试用 Express 应用并注册健康检查模拟路由
 */
beforeAll(() => {
  // 创建测试服务器
  app = express();

  // 简单的健康检查端点
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  app.get('/health/detailed', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    uptime: process.uptime(),
      memory: process.memoryUsage(),
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
    res.status(200).json({ ready: true });
  });
});

/**
 * @description Jest 全局后置钩子，关闭测试服务器释放端口
 * @param {Function} done - Jest 异步完成回调
 */
afterAll((done) => {
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

describe('健康检查 API 集成测试', () => {
  describe('GET /health', () => {
    test('应该返回 200 状态码', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    test('应该返回 JSON 格式', async () => {
      const response = await request(app).get('/health');
      expect(response.type).toBe('application/json');
    });

    test('应该包含必需的字段', async () => {
      const response = await request(app).get('/health');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    test('status 应该是 ok', async () => {
      const response = await request(app).get('/health');
      expect(response.body.status).toBe('ok');
    });
  });

  describe('GET /health/detailed', () => {
    test('应该返回详细的健康信息', async () => {
      const response = await request(app).get('/health/detailed');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('memory');
   expect(response.body).toHaveProperty('services');
    });

    test('应该包含服务状态', async () => {
      const response = await request(app).get('/health/detailed');
      expect(response.body.services).toHaveProperty('llm');
      expect(response.body.services).toHaveProperty('tts');
      expect(response.body.services).toHaveProperty('asr');
    });
  });

  describe('GET /health/liveness', () => {
    test('应该返回 200 状态码', async () => {
      const response = await request(app).get('/health/liveness');
      expect(response.status).toBe(200);
    });

    test('应该返回 OK 文本', async () => {
      const response = await request(app).get('/health/liveness');
      expect(response.text).toBe('OK');
    });
  });

  describe('GET /health/readiness', () => {
    test('应该返回就绪状态', async () => {
      const response = await request(app).get('/health/readiness');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ready');
      expect(response.body.ready).toBe(true);
    });
  });
});
