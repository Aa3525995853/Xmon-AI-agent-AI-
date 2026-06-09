/**
 * @file directActionService.test.js
 * @description DirectActionService 单元测试 - 验证直达动作服务的快捷工具列表、
 *              快捷搜索列表、历史记录管理等功能
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const DirectActionService = require('../../services/direct_action_service');

// 模拟 llmService，返回固定的动作分类 JSON，避免依赖真实 LLM 服务
const mockLlmService = {
    /**
     * @description 模拟 LLM 聊天接口，返回预设的动作分类结果
     * @returns {Promise<string>} 模拟的 JSON 格式动作分类结果
     */
    chat: async () => '{"actionType":"search","action":"web","confidence":0.8}'
};

// 使用模拟 LLM 服务创建 DirectActionService 实例
const directActionService = new DirectActionService(mockLlmService);

/** 快捷工具列表应包含的最少工具数量 */
const MIN_QUICK_TOOLS_COUNT = 10;

// ============================================================
// 模块名称：直达动作服务测试
// 功能说明：测试快捷工具、快捷搜索、历史记录管理等核心功能
// ============================================================

describe('DirectActionService 服务测试', () => {
  // ============================================================
  // 静态导出的快捷工具测试
  // ============================================================
  describe('getQuickTools (静态导出)', () => {
    /**
     * @description 验证 QUICK_TOOLS 静态属性返回非空的快捷工具列表
     */
    test('应该返回快捷工具列表', () => {
      const tools = DirectActionService.QUICK_TOOLS;
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
    });

    /**
     * @description 验证每个快捷工具包含 id、name、prompt 三个必要字段
     */
    test('工具应该包含必要字段', () => {
      const tools = DirectActionService.QUICK_TOOLS;
      const tool = tools[0];
      expect(tool).toHaveProperty('id');
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('prompt');
    });
  });

  // ============================================================
  // 实例方法的快捷工具测试
  // ============================================================
  describe('getQuickTools (实例方法)', () => {
    /**
     * @description 验证实例方法 getQuickTools 返回非空的快捷工具列表
     */
    test('应该返回快捷工具列表', () => {
      const tools = directActionService.getQuickTools();
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
    });

    /**
     * @description 验证快捷工具数量不少于最低要求
     */
    test('应该返回正确的工具数量', () => {
      const tools = directActionService.getQuickTools();
      expect(tools.length).toBeGreaterThanOrEqual(MIN_QUICK_TOOLS_COUNT);
    });
  });

  // ============================================================
  // 快捷搜索测试
  // ============================================================
  describe('getQuickSearches (实例方法)', () => {
    /**
     * @description 验证 getQuickSearches 返回非空的快捷搜索列表
     */
    test('应该返回快捷搜索列表', () => {
      const searches = directActionService.getQuickSearches();
      expect(searches).toBeInstanceOf(Array);
      expect(searches.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 实例方法测试
  // ============================================================
  describe('实例方法', () => {
    /**
     * @description 验证能获取搜索历史记录（返回数组）
     */
    test('应该能获取搜索历史', () => {
      const history = directActionService.getSearchHistory();
      expect(history).toBeInstanceOf(Array);
    });

    /**
     * @description 验证能获取操作历史记录（返回数组）
     */
    test('应该能获取操作历史', () => {
      const history = directActionService.getActionHistory();
      expect(history).toBeInstanceOf(Array);
    });

    /**
     * @description 验证清除历史操作返回 undefined（无返回值）
     */
    test('应该能清除历史', () => {
      const result = directActionService.clearHistory();
      expect(result).toBeUndefined();
    });
  });
});