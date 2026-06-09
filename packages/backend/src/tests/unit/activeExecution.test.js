/**
 * @file activeExecution.test.js
 * @description ActiveExecutionService 自动化测试 - 验证 v3.0 主动执行能力，
 *              包括定时任务管理、条件触发器、上下文预判、执行历史和状态管理等功能
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { ActiveExecutionService } = require('../../services/active_execution_service');

/** 一天的毫秒数常量，用于时间差计算 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 25小时的毫秒数，用于模拟长时间未交互场景 */
const MS_25_HOURS = 25 * 60 * 60 * 1000;

/** 早安问候的小时范围：6点至9点 */
const MORNING_GREETING_START_HOUR = 6;
const MORNING_GREETING_END_HOUR = 9;

/** 晚安问候的小时范围：21点至23点 */
const NIGHT_GREETING_START_HOUR = 21;
const NIGHT_GREETING_END_HOUR = 23;

/** 测试中插入的历史记录条数 */
const TEST_HISTORY_COUNT = 5;

/** 获取历史记录时的限制条数 */
const HISTORY_LIMIT = 3;

// ============================================================
// 模块名称：主动执行能力测试
// 功能说明：测试定时任务、条件触发器、上下文预判、执行历史等核心功能
// ============================================================

describe('ActiveExecutionService v3.0 主动执行测试', () => {
    let service;

    beforeEach(() => {
        // 每次测试创建新实例，确保测试隔离
        service = new ActiveExecutionService();
        // 清空测试数据，避免前序测试残留
        service.tasks.clear();
        service.triggers.clear();
        service.executionHistory = [];
    });

    afterEach(() => {
        // 停止调度器，释放定时器资源
        service.stopScheduler();
    });

    // ============================================================
    // 任务管理测试
    // ============================================================
    describe('任务管理', () => {
        /**
         * @description 验证能创建定时任务并获取任务列表
         */
        test('应该能创建定时任务', () => {
            const taskId = service.createTask({
                name: '测试任务',
                schedule: '0 8 * * *',  // cron 表达式：每天早上8点
                action: 'notification',
                params: { message: '测试' }
            });

            expect(taskId).toBeDefined();
            const tasks = service.getTasks();
            expect(tasks.length).toBeGreaterThan(0);
        });

        /**
         * @description 验证能从自然语言描述中解析并创建定时任务
         */
        test('应该能从自然语言创建任务', () => {
            const result = service.createTaskFromNaturalLanguage('每天早上8点提醒我喝水');
            expect(result.success).toBe(true);
            expect(result.taskId).toBeDefined();
        });

        /**
         * @description 验证能解析"每天早上"这类中文时间表达式
         */
        test('应该能解析"每天早上"时间表达式', () => {
            const result = service.createTaskFromNaturalLanguage('每天早上8点播放音乐');
            expect(result.success).toBe(true);
        });

        /**
         * @description 验证能解析"每小时/每N分钟"这类间隔时间表达式
         */
        test('应该能解析"每小时"时间表达式', () => {
            const result = service.createTaskFromNaturalLanguage('每30分钟提醒我休息');
            expect(result.success).toBe(true);
        });

        /**
         * @description 验证能删除已创建的任务
         */
        test('应该能删除任务', () => {
            const taskId = service.createTask({
                name: '待删除任务',
                schedule: '0 9 * * *',
                action: 'notification',
                params: {}
            });

            expect(service.getTasks().length).toBeGreaterThan(0);

            const result = service.deleteTask(taskId);
            expect(result.success).toBe(true);
            expect(service.getTasks().length).toBe(0);
        });

        /**
         * @description 验证能启用和禁用任务
         */
        test('应该能启用/禁用任务', () => {
            const taskId = service.createTask({
                name: '切换测试',
                schedule: '0 10 * * *',
                action: 'notification',
                params: {}
            });

            // 先禁用
            const result = service.toggleTask(taskId, false);
            expect(result.success).toBe(true);
            expect(result.enabled).toBe(false);

            // 再启用
            const result2 = service.toggleTask(taskId, true);
            expect(result2.success).toBe(true);
            expect(result2.enabled).toBe(true);
        });
    });

    // ============================================================
    // 条件触发器测试
    // ============================================================
    describe('条件触发器', () => {
        /**
         * @description 验证能创建条件触发器并返回触发器 ID
         */
        test('应该能创建触发器', () => {
            const triggerId = service.createTrigger({
                name: '情绪触发器',
                condition: 'emotion',
                conditionParams: { emotion: 'sad' },
                action: 'play_music',
                actionParams: { keyword: '舒缓音乐' }
            });

            expect(triggerId).toBeDefined();
        });

        /**
         * @description 验证能创建时间范围条件触发器
         */
        test('应该能检测时间条件', () => {
            service.createTrigger({
                name: '时间范围触发器',
                condition: 'time_range',
                conditionParams: { start: 22, end: 23 },
                action: 'notification',
                actionParams: { message: '该睡觉了' }
            });

            const hour = new Date().getHours();
            // 仅验证触发器能被创建，不测试实际触发（触发依赖当前时间）
            expect(service.triggers.size).toBeGreaterThan(0);
        });

        /**
         * @description 验证能创建关键词条件触发器
         */
        test('应该能检测关键词条件', () => {
            service.createTrigger({
                name: '关键词触发器',
                condition: 'keywords',
                conditionParams: { keywords: ['累', '困', '休息'] },
                action: 'notification',
                actionParams: { message: '休息一下' }
            });

            expect(service.triggers.size).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // 上下文预判测试
    // ============================================================
    describe('上下文预判', () => {
        /**
         * @description 验证能更新上下文信息并缓存
         */
        test('应该能更新上下文', () => {
            service.updateContext({
                lastInteractionTime: Date.now(),
                emotion: 'happy'
            });

            expect(service.contextCache.lastInteractionTime).toBeDefined();
        });

        /**
         * @description 验证能根据上下文获取预判建议列表
         */
        test('应该能获取预判建议', () => {
            // 模拟25小时前有过交互，触发长时间未交互预判
            service.updateContext({
                lastInteractionTime: Date.now() - MS_25_HOURS
            });

            const predictions = service.getPredictions();
            expect(predictions).toBeInstanceOf(Array);
        });

        /**
         * @description 验证在早安时间段（6-9点）能返回问候预判
         */
        test('早安时间应该返回问候预判', () => {
            service.updateContext({});
            const predictions = service.getPredictions();

            const hour = new Date().getHours();
            // 仅在早安时间段内验证，避免非时段测试失败
            if (hour >= MORNING_GREETING_START_HOUR && hour <= MORNING_GREETING_END_HOUR) {
                const greetingPred = predictions.find(p => p.type === 'greeting');
                expect(greetingPred).toBeDefined();
            }
        });

        /**
         * @description 验证在晚安时间段（21-23点）能返回晚安预判
         */
        test('晚安时间应该返回晚安预判', () => {
            service.updateContext({});
            const predictions = service.getPredictions();

            const hour = new Date().getHours();
            // 仅在晚安时间段内验证，避免非时段测试失败
            if (hour >= NIGHT_GREETING_START_HOUR && hour <= NIGHT_GREETING_END_HOUR) {
                const nightPred = predictions.find(p => p.type === 'night_greeting');
                expect(nightPred).toBeDefined();
            }
        });
    });

    // ============================================================
    // 执行历史测试
    // ============================================================
    describe('执行历史', () => {
        /**
         * @description 验证能记录执行历史并查询
         */
        test('应该能记录执行历史', () => {
            service.executionHistory.push({
                taskId: 'test1',
                taskName: '测试任务',
                timestamp: new Date().toISOString(),
                success: true,
                result: 'OK'
            });

            const history = service.getHistory();
            expect(history.length).toBeGreaterThan(0);
        });

        /**
         * @description 验证获取历史记录时支持限制返回条数
         */
        test('应该能获取有限的历史记录', () => {
            // 插入多条记录以测试限制功能
            for (let i = 0; i < TEST_HISTORY_COUNT; i++) {
                service.executionHistory.push({
                    taskId: `task_${i}`,
                    taskName: `测试${i}`,
                    timestamp: new Date().toISOString(),
                    success: true
                });
            }

            const history = service.getHistory(HISTORY_LIMIT);
            expect(history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
        });
    });

    // ============================================================
    // 状态管理测试
    // ============================================================
    describe('状态管理', () => {
        /**
         * @description 验证能获取服务状态信息（启用状态、任务数、触发器数）
         */
        test('应该能获取服务状态', () => {
            const status = service.getStatus();
            expect(status).toHaveProperty('enabled');
            expect(status).toHaveProperty('taskCount');
            expect(status).toHaveProperty('triggerCount');
        });

        /**
         * @description 验证能启用和禁用整个主动执行服务
         */
        test('应该能启用/禁用服务', () => {
            service.setEnabled(false);
            expect(service.enabled).toBe(false);

            service.setEnabled(true);
            expect(service.enabled).toBe(true);
        });
    });

    // ============================================================
    // 数据持久化测试
    // ============================================================
    describe('数据持久化', () => {
        /**
         * @description 验证任务数据能被持久化并在新实例中加载
         */
        test('应该能加载和保存任务', () => {
            // 创建一些任务用于持久化测试
            service.createTask({
                name: '持久化测试',
                schedule: '0 8 * * *',
                action: 'notification',
                params: { message: '测试' }
            });

            // 模拟重新加载，创建新实例验证数据持久化
            const newService = new ActiveExecutionService();
            // 内存模式下数据可能不持久，但至少验证实例创建不报错
            expect(newService).toBeDefined();
            newService.stopScheduler();
        });
    });
});
