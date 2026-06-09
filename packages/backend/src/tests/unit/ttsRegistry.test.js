/**
 * @file ttsRegistry.test.js
 * @description TTS 注册表真实提供商防护测试 - 验证 TTS 注册表默认使用真实提供商（MiMo），
 *              在生产环境拒绝 mock 提供商，以及正确报告未配置提供商的不可用状态
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const ttsRegistry = require('../../services/tts_registry');

// ============================================================
// 模块名称：TTS 注册表防护测试
// 功能说明：确保 TTS 注册表不会在缺少配置时回退到空 mock 提供商
// ============================================================

describe('TTS registry real-provider guardrails', () => {
  /** 保存原始环境变量快照，测试结束后恢复 */
  const originalEnv = { ...process.env };

  afterEach(() => {
    // 恢复环境变量并重置模块缓存，确保测试隔离
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  /**
   * @description 验证未指定 TTS_PROVIDER 时默认使用 MiMo 而非空的 mock 提供商
   */
  test('defaults to Mimo instead of the empty mock provider', () => {
    // 删除 TTS_PROVIDER 环境变量，模拟未配置场景
    delete process.env.TTS_PROVIDER;

    const provider = ttsRegistry.getCurrentTTSProvider();

    // 默认提供商应为 mimo，而非 mock
    expect(ttsRegistry.DEFAULT_PROVIDER).toBe('mimo');
    expect(provider.name).toBe('MiMo TTS');
  });

  /**
   * @description 验证在生产环境下加载 mock TTS 提供商会抛出异常，
   *              防止生产环境意外使用无音频输出的 mock 提供商
   */
  test('rejects mock TTS outside test mode', () => {
    // 模拟生产环境
    process.env.NODE_ENV = 'production';

    expect(() => ttsRegistry.loadTTSProvider('mock')).toThrow(
      /Mock provider is only allowed/
    );
  });

  /**
   * @description 验证健康检查在 MiMo TTS 未配置 API Key 时正确报告不可用状态，
   *              而非假装提供商正常工作
   */
  test('health check reports missing Mimo configuration as unavailable', async () => {
    // 删除 TTS 提供商和 API Key 配置，模拟完全未配置场景
    delete process.env.TTS_PROVIDER;
    delete process.env.MIMO_TTS_API_KEY;

    // 重置模块缓存以获取全新的注册表实例
    jest.resetModules();
    const freshRegistry = require('../../services/tts_registry');
    const health = await freshRegistry.checkTTSHealth();

    expect(health.provider).toBe('mimo');
    expect(health.available).toBe(false);
    // 错误信息应明确说明 MiMo TTS 未配置
    expect(health.error).toMatch(/Mimo TTS is not configured/);
  });
});
