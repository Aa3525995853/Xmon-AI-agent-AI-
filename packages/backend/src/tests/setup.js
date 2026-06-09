/**
 * @file setup.js
 * @description Jest 测试全局设置文件，在所有测试运行前执行，
 *   配置测试环境变量、模拟 API 密钥、设置全局超时和生命周期钩子
 * @module tests
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块：环境变量配置
// 功能说明：设置测试专用环境变量和模拟 API 密钥
// ============================================================

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';  // 测试时只显示错误日志，减少噪音

// Mock 环境变量（使用测试专用密钥，不会影响真实服务）
process.env.KIMI_API_KEY = 'test-kimi-key';
process.env.KIMI_API_URL = 'https://test-api.moonshot.cn/v1/chat/completions';
process.env.KIMI_MODEL = 'moonshot-v1-8k';

process.env.MIMO_API_KEY = 'test-mimo-key';
process.env.MIMO_API_URL = 'https://test-api.xiaomimimo.com/v1/chat/completions';
process.env.MIMO_MODEL = 'mimo-v2.5';

process.env.MIMO_TTS_API_KEY = 'test-tts-key';
process.env.MIMO_TTS_API_URL = 'https://test-api.xiaomimimo.com/v1';

// TTS 提供商设为 mock，避免测试时调用真实 TTS 服务
process.env.TTS_PROVIDER = 'mock';

/** @constant {number} JEST_TIMEOUT_MS - Jest 全局测试超时时间（毫秒） */
const JEST_TIMEOUT_MS = 10000;

// 全局测试超时
jest.setTimeout(JEST_TIMEOUT_MS);

/**
 * @description Jest 全局前置钩子，在所有测试套件开始前执行
 */
beforeAll(() => {
  console.log('🧪 开始测试...\n');
});

/**
 * @description Jest 全局后置钩子，在所有测试套件结束后执行
 */
afterAll(() => {
  console.log('\n✅ 测试完成！');
});

/**
 * @description 全局未处理 Promise 拒绝的兜底处理，
 *   防止测试进程中因未捕获的异步异常而静默崩溃
 * @param {Error} error - 未处理的拒绝错误对象
 */
process.on('unhandledRejection', (error) => {
  console.error('未处理的 Promise 拒绝:', error);
});
