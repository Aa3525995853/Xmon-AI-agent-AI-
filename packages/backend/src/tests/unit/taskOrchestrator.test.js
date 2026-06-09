/**
 * @file taskOrchestrator.test.js
 * @description TaskOrchestrator 单元测试 - 验证任务编排服务的复杂度评估、
 *              任务列表查询、任务分组和统计信息等功能
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const taskOrchestrator = require('../../services/task_orchestrator');

/** 复杂度评分的中间阈值，低于此值为简单任务，高于为复杂任务 */
const COMPLEXITY_THRESHOLD = 3;

// ============================================================
// 模块名称：任务编排服务测试
// 功能说明：测试复杂度评估、任务查询、分组统计等核心功能
// ============================================================

describe('TaskOrchestrator 服务测试', () => {
  // ============================================================
  // 复杂度评估测试
  // ============================================================
  describe('assessComplexity', () => {
    /**
     * @description 验证简单任务（如天气查询）返回低复杂度分数
     */
    test('应该为简单任务返回低分数', () => {
      const result = taskOrchestrator.assessComplexity('今天天气怎么样');
      expect(result.score).toBeLessThanOrEqual(COMPLEXITY_THRESHOLD);
    });

    /**
     * @description 验证复杂任务（如数据分析+报告生成）返回高复杂度分数
     */
    test('应该为复杂任务返回高分', () => {
      const result = taskOrchestrator.assessComplexity('帮我分析整理这个Excel数据并生成报告');
      expect(result.score).toBeGreaterThanOrEqual(COMPLEXITY_THRESHOLD);
    });

    /**
     * @description 验证包含多步骤关键词的任务能被识别，原因列表中包含"多步骤操作"
     */
    test('应该识别多步骤任务', () => {
      const result = taskOrchestrator.assessComplexity('打开Excel然后整理数据再生成图表');
      expect(result.reasons).toContain('多步骤操作');
    });

    /**
     * @description 验证复杂度评估结果包含原因说明数组
     */
    test('应该返回原因说明', () => {
      const result = taskOrchestrator.assessComplexity('批量处理这些文件');
      expect(result.reasons).toBeInstanceOf(Array);
    });
  });

  // ============================================================
  // 任务列表查询测试
  // ============================================================
  describe('getTasks', () => {
    /**
     * @description 验证能获取所有任务列表
     */
    test('应该返回所有任务', () => {
      const tasks = taskOrchestrator.getTasks();
      expect(tasks).toBeInstanceOf(Array);
    });

    /**
     * @description 验证能按状态过滤任务（如仅获取 pending 状态的任务）
     */
    test('应该支持过滤', () => {
      const pendingTasks = taskOrchestrator.getTasks('pending');
      expect(pendingTasks).toBeInstanceOf(Array);
    });
  });

  // ============================================================
  // 任务分组测试
  // ============================================================
  describe('getTasksGrouped', () => {
    /**
     * @description 验证任务按状态分组返回，包含 pending、completed、failed 三个分组
     */
    test('应该按状态分组', () => {
      const grouped = taskOrchestrator.getTasksGrouped();
      expect(grouped).toHaveProperty('pending');
      expect(grouped).toHaveProperty('completed');
      expect(grouped).toHaveProperty('failed');
    });
  });

  // ============================================================
  // 统计信息测试
  // ============================================================
  describe('getStats', () => {
    /**
     * @description 验证统计信息包含总数、按引擎分类和平均复杂度
     */
    test('应该返回统计信息', () => {
      const stats = taskOrchestrator.getStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byEngine');
      expect(stats).toHaveProperty('avgComplexity');
    });

    /**
     * @description 验证统计信息中的数值字段类型正确
     */
    test('统计数据应该为数字', () => {
      const stats = taskOrchestrator.getStats();
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.avgComplexity).toBe('number');
    });
  });
});