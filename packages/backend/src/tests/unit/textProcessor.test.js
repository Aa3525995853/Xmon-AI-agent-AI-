/**
 * @file textProcessor.test.js
 * @description 工具函数单元测试 - 验证 textProcessor 模块的文本清洗（TTS 专用）、
 *              意图检测、Token 上限计算和情绪提取等功能
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const textProcessor = require('../../utils/textProcessor');

/** 故事类请求的 Token 下限阈值 */
const STORY_MIN_TOKENS = 400;

/** 简单对话的 Token 上限阈值 */
const SIMPLE_CHAT_MAX_TOKENS = 200;

/** 摘要截取测试用的长文本长度 */
const LONG_TEXT_LENGTH = 300;

/** 摘要截取的最大长度限制 */
const SUMMARY_MAX_LENGTH = 100;

// ============================================================
// 模块名称：文本处理工具测试
// 功能说明：测试 TTS 文本清洗、意图检测、Token 计算、情绪提取等功能
// ============================================================

describe('textProcessor 工具测试', () => {
  // ============================================================
  // TTS 文本清洗测试
  // ============================================================
  describe('cleanForTTS', () => {
    /**
     * @description 验证能移除 TTS 不需要朗读的 style 情感标签
     */
    test('应该移除 style 标签', () => {
      const input = '<style>开心</style>你好';
      const result = textProcessor.cleanForTTS(input);
      expect(result).not.toContain('<style>');
      expect(result).not.toContain('</style>');
    });

    /**
     * @description 验证能移除括号内的动作描述（如"轻笑"），TTS 不应朗读动作提示
     */
    test('应该移除括号内的动作描述', () => {
      const input = '你好（轻笑）世界';
      const result = textProcessor.cleanForTTS(input);
      expect(result).not.toContain('（轻笑）');
    });

    /**
     * @description 验证空字符串输入返回空字符串
     */
    test('应该处理空字符串', () => {
      const result = textProcessor.cleanForTTS('');
      expect(result).toBe('');
    });

    /**
     * @description 验证 null 和 undefined 输入返回空字符串而非报错
     */
    test('应该处理 null 和 undefined', () => {
      expect(textProcessor.cleanForTTS(null)).toBe('');
      expect(textProcessor.cleanForTTS(undefined)).toBe('');
    });

    /**
     * @description 验证能移除命令行风格的斜杠符号，同时保留语义信息
     */
    test('应该移除命令行斜杠符号', () => {
      // 实际场景：车次信息中的斜杠在语音中不应朗读
      const input = '帮你查到了 G2/G6 两班车次';
      const result = textProcessor.cleanForTTS(input);
      expect(result).not.toContain('/');
      // 确认语义被保留，G2 和 G6 仍可朗读
      expect(result).toContain('G2');
      expect(result).toContain('G6');
      expect(result).toContain('两班车次');
    });

    /**
     * @description 验证能移除代码风格的反引号标记
     */
    test('应该移除反引号', () => {
      const input = '这是 `代码` 测试';
      const result = textProcessor.cleanForTTS(input);
      expect(result).not.toContain('`');
    });

    /**
     * @description 验证能移除 URL 地址，TTS 不应朗读网址
     */
    test('应该移除 URL', () => {
      const input = '链接是 https://example.com/test 请查看';
      const result = textProcessor.cleanForTTS(input);
      expect(result).not.toContain('https://');
      expect(result).not.toContain('example.com');
    });

    /**
     * @description 验证能移除连续的逻辑符号（如 ||），TTS 不应朗读编程符号
     */
    test('应该移除连续符号', () => {
      const input = '操作结果：成功 || 失败 || 未知';
      const result = textProcessor.cleanForTTS(input);
      expect(result).not.toContain('||');
    });
  });

  // ============================================================
  // 意图检测测试
  // ============================================================
  describe('detectIntent', () => {
    /**
     * @description 验证能识别编程相关意图（写函数、代码问题、算法实现）
     */
    test('应该识别编程相关意图', () => {
      const codingTexts = [
        '帮我写一个函数',
        '这段代码有什么问题',
        '如何实现排序算法'
      ];

      codingTexts.forEach(text => {
        const intent = textProcessor.detectIntent(text);
        expect(intent).toBe('coding');
      });
    });

    /**
     * @description 验证能识别日常聊天意图（问候、天气、笑话）
     */
    test('应该识别日常聊天意图', () => {
      const chatTexts = [
        '你好',
        '今天天气怎么样',
        '讲个笑话'
      ];

      chatTexts.forEach(text => {
        const intent = textProcessor.detectIntent(text);
        expect(intent).toBe('chat');
      });
  });
  });

  // ============================================================
  // Token 上限计算测试
  // ============================================================
  describe('getMaxTokens', () => {
    /**
     * @description 验证故事类请求返回较多的 Token 数量，确保长文本生成不被截断
     */
    test('应该为故事类请求返回更多 tokens', () => {
      const storyText = '给我讲一个童话故事';
      const tokens = textProcessor.getMaxTokens(storyText);
      expect(tokens).toBeGreaterThan(STORY_MIN_TOKENS);
    });

    /**
     * @description 验证简单对话返回较少的 Token 数量，避免浪费计算资源
     */
    test('应该为简单对话返回较少 tokens', () => {
      const simpleText = '你好';
      const tokens = textProcessor.getMaxTokens(simpleText);
      expect(tokens).toBeLessThanOrEqual(SIMPLE_CHAT_MAX_TOKENS);
    });
  });

  // ============================================================
  // 情绪提取测试
  // ============================================================
  describe('extractEmotion', () => {
    /**
     * @description 验证能从 style 标签中提取情绪标签
     */
    test('应该从 style 标签提取情绪', () => {
      const text = '<style>开心</style>你好';
      const emotion = textProcessor.extractEmotion(text);
      expect(emotion).toBeTruthy();
    });

    /**
     * @description 验证能从文本关键词中推断情绪（无 style 标签时）
     */
    test('应该从关键词推断情绪', () => {
      const happyText = '太棒了！我很开心';
      const emotion = textProcessor.extractEmotion(happyText);
      expect(emotion).toBeTruthy();
    });
  });
});
