/**
 * @file config.test.js
 * @description 配置模块单元测试 - 验证 streamChatConfig、chatConfig、ttsConfig 三个配置模块
 *              导出的配置项完整性、数值类型和合理范围
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：配置模块测试
// 功能说明：验证各配置模块的导出项完整性、类型正确性和参数合理范围
// ============================================================

describe('配置模块测试', () => {
  // ============================================================
  // streamChatConfig 配置测试
  // ============================================================
  describe('streamChatConfig', () => {
    let config;

    beforeEach(() => {
      // 清除模块缓存，确保每次测试获取最新配置
      jest.resetModules();
      config = require('../../config/streamChatConfig');
    });

    /**
     * @description 验证 streamChatConfig 导出所有必需的配置项
     */
    test('应该导出所有必需的配置项', () => {
      expect(config).toHaveProperty('BACKPRESSURE_CONFIG');
      expect(config).toHaveProperty('AUDIO_CONFIG');
      expect(config).toHaveProperty('LLM_CONFIG');
      expect(config).toHaveProperty('SENTENCE_CONFIG');
      expect(config).toHaveProperty('EMOTION_CONFIG');
      expect(config).toHaveProperty('SYSTEM_CONTROL_CONFIG');
      expect(config).toHaveProperty('CONVERSATION_CONFIG');
      expect(config).toHaveProperty('SSE_EVENTS');
      expect(config).toHaveProperty('LOG_PREFIX');
      expect(config).toHaveProperty('PERSONALITY_MODES');
    });

    /**
     * @description 验证背压配置的数值参数类型正确
     */
    test('BACKPRESSURE_CONFIG 应该有正确的数值类型', () => {
      expect(typeof config.BACKPRESSURE_CONFIG.highWaterMark).toBe('number');
      expect(typeof config.BACKPRESSURE_CONFIG.lowWaterMark).toBe('number');
      expect(typeof config.BACKPRESSURE_CONFIG.maxQueueSize).toBe('number');
    });

    /**
     * @description 验证音频配置的采样率大于0，格式和编码非空
     */
    test('AUDIO_CONFIG 应该有正确的配置', () => {
      expect(config.AUDIO_CONFIG.sampleRate).toBeGreaterThan(0);
      expect(config.AUDIO_CONFIG.format).toBeTruthy();
      expect(config.AUDIO_CONFIG.encoding).toBeTruthy();
    });

    /**
     * @description 验证 LLM 配置的 temperature 在 [0, 2] 范围内，topP 在 [0, 1] 范围内
     */
    test('LLM_CONFIG 应该有合理的参数范围', () => {
      expect(config.LLM_CONFIG.temperature).toBeGreaterThanOrEqual(0);
      expect(config.LLM_CONFIG.temperature).toBeLessThanOrEqual(2);
      expect(config.LLM_CONFIG.topP).toBeGreaterThanOrEqual(0);
      expect(config.LLM_CONFIG.topP).toBeLessThanOrEqual(1);
    });

    /**
     * @description 验证句子分割边界配置是正则表达式类型
     */
    test('SENTENCE_CONFIG.boundary 应该是正则表达式', () => {
      expect(config.SENTENCE_CONFIG.boundary).toBeInstanceOf(RegExp);
    });

    /**
     * @description 验证情绪配置包含情绪映射、关键词和默认情绪
     */
    test('EMOTION_CONFIG 应该有情绪映射和关键词', () => {
      expect(config.EMOTION_CONFIG.emotionMap).toBeDefined();
      expect(config.EMOTION_CONFIG.keywords).toBeDefined();
      expect(config.EMOTION_CONFIG.defaultEmotion).toBeTruthy();
    });

    /**
     * @description 验证系统控制配置包含成功和错误模板函数，且模板能正确替换占位符
     */
    test('SYSTEM_CONTROL_CONFIG 应该有模板函数', () => {
      expect(typeof config.SYSTEM_CONTROL_CONFIG.successTemplate).toBe('function');
      expect(typeof config.SYSTEM_CONTROL_CONFIG.errorTemplate).toBe('function');

      // 验证成功模板能替换参数
      const successMsg = config.SYSTEM_CONTROL_CONFIG.successTemplate('测试');
      expect(successMsg).toContain('测试');

      // 验证错误模板能替换参数
      const errorMsg = config.SYSTEM_CONTROL_CONFIG.errorTemplate('错误');
      expect(errorMsg).toContain('错误');
    });
  });

  // ============================================================
  // chatConfig 配置测试
  // ============================================================
  describe('chatConfig', () => {
    let config;

    beforeEach(() => {
      jest.resetModules();
      config = require('../../config/chatConfig');
    });

    /**
     * @description 验证 chatConfig 导出所有必需的配置项
     */
    test('应该导出所有必需的配置项', () => {
      expect(config).toHaveProperty('DEFAULT_RESPONSE');
      expect(config).toHaveProperty('INTENT_TYPES');
      expect(config).toHaveProperty('SYSTEM_CONTROL_TYPES');
      expect(config).toHaveProperty('SHORT_TERM_MEMORY');
      expect(config).toHaveProperty('LOG_CONFIG');
      expect(config).toHaveProperty('ERROR_MESSAGES');
    });

    /**
     * @description 验证默认响应参数在合理范围内（语速 >0 且 ≤2，音量 >0 且 ≤1）
     */
    test('DEFAULT_RESPONSE 应该有合理的默认值', () => {
      expect(config.DEFAULT_RESPONSE.speechRate).toBeGreaterThan(0);
      expect(config.DEFAULT_RESPONSE.speechRate).toBeLessThanOrEqual(2);
      expect(config.DEFAULT_RESPONSE.volume).toBeGreaterThan(0);
      expect(config.DEFAULT_RESPONSE.volume).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================
  // ttsConfig 配置测试
  // ============================================================
  describe('ttsConfig', () => {
    let config;

    beforeEach(() => {
      jest.resetModules();
      config = require('../../config/ttsConfig');
    });

    /**
     * @description 验证 ttsConfig 导出所有必需的配置项
     */
    test('应该导出所有必需的配置项', () => {
      expect(config).toHaveProperty('AUDIO_CONFIG');
      expect(config).toHaveProperty('STREAMING_CONFIG');
      expect(config).toHaveProperty('DEFAULT_OPTIONS');
      expect(config).toHaveProperty('FALLBACK_TEXT');
      expect(config).toHaveProperty('LOG_CONFIG');
    });

    /**
     * @description 验证流式配置的块大小参数大于0
     */
    test('STREAMING_CONFIG 应该有合理的块大小', () => {
      expect(config.STREAMING_CONFIG.chunkSize).toBeGreaterThan(0);
      expect(config.STREAMING_CONFIG.fallbackChunkSize).toBeGreaterThan(0);
    });
  });
});
