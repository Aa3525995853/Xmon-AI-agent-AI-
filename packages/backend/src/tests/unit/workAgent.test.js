/**
 * @file workAgent.test.js
 * @description WorkAgent 真实执行防护测试 - 验证工作代理在简化执行模式下不会假装任务已完成，
 *              而是明确返回失败状态和错误信息
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const workAgent = require('../../services/work_agent');

// ============================================================
// 模块名称：WorkAgent 真实执行防护测试
// 功能说明：确保简化执行模式不会伪装任务完成，而是如实报告失败
// ============================================================

describe('WorkAgent real-execution guardrails', () => {
  /**
   * @description 验证旧版简化执行模式在执行任务时直接失败，而非假装工作已完成。
   *              简化模式不具备真实执行能力，必须明确告知用户任务未执行。
   */
  test('legacy simplified execution fails instead of pretending work completed', async () => {
    const taskId = 'test_simple_execute_failure';
    /** 收集任务执行过程中发出的事件，用于验证事件广播行为 */
    const emittedEvents = [];

    // 手动向 workAgent 注入一个运行中的任务，模拟真实任务状态
    workAgent.tasks.set(taskId, {
      id: taskId,
      description: '生成一份报告',
      status: 'running',
      startTime: Date.now(),
      progress: 0,
      logs: []
    });

    // 保存原始事件发射方法，测试结束后恢复
    const originalEmit = workAgent._emit;
    const originalEmitLog = workAgent._emitLog;

    // 拦截事件发射，仅在本地收集事件，避免向进程级服务总线广播虚假任务状态
    workAgent._emit = (event, data) => emittedEvents.push({ event, data });
    // 静默日志输出，减少测试噪音
    workAgent._emitLog = () => {};

    try {
      await workAgent._simpleExecute(taskId, '生成一份报告');
    } finally {
      // 无论测试是否通过，都恢复原始方法，避免影响其他测试
      workAgent._emit = originalEmit;
      workAgent._emitLog = originalEmitLog;
    }

    const task = workAgent.tasks.get(taskId);
    // 任务状态应为失败
    expect(task.status).toBe('failed');
    // 错误信息应明确说明简化模式不会执行真实任务
    expect(task.error).toMatch(/简化模式不会执行真实任务/);
    // 应发出 task:failed 事件
    expect(emittedEvents).toEqual([
      expect.objectContaining({
        event: 'task:failed',
        data: expect.objectContaining({ taskId, status: 'failed' })
      })
    ]);

    // 清理测试数据，避免污染后续测试
    workAgent.tasks.delete(taskId);
  });
});
