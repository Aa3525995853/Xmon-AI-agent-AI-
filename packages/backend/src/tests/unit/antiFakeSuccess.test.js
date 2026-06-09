/**
 * @file antiFakeSuccess.test.js
 * @description 反假成功防护回归测试 - 验证系统在未配置或未实现的路径下不会返回虚假的成功结果，
 *              而是明确报告失败/不可用状态，防止占位数据、空音频或"已完成"措辞误导用户
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：反假成功防护测试
// 功能说明：确保各服务在缺少配置或功能未实现时，不会伪装成功
// ============================================================

describe('Anti fake-success guardrails', () => {
    /** 保存原始环境变量，测试结束后恢复，避免污染其他测试用例 */
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAmapKey = process.env.AMAP_KEY;
    const originalKimiApiKey = process.env.KIMI_API_KEY;
    const originalMimoApiKey = process.env.MIMO_API_KEY;

    afterEach(() => {
        // 恢复所有被修改的环境变量，确保测试隔离
        process.env.NODE_ENV = originalNodeEnv;
        if (originalAmapKey === undefined) {
            delete process.env.AMAP_KEY;
        } else {
            process.env.AMAP_KEY = originalAmapKey;
        }
        if (originalKimiApiKey === undefined) {
            delete process.env.KIMI_API_KEY;
        } else {
            process.env.KIMI_API_KEY = originalKimiApiKey;
        }
        if (originalMimoApiKey === undefined) {
            delete process.env.MIMO_API_KEY;
        } else {
            process.env.MIMO_API_KEY = originalMimoApiKey;
        }
        // 重置模块缓存，确保每次 require 获取全新实例
        jest.resetModules();
    });

    /**
     * @description 验证 mock TTS 在非测试模式下不可用且无法生成空音频
     */
    test('mock TTS is unavailable and cannot generate empty audio outside test mode', async () => {
        // 模拟生产环境，mock TTS 不应被允许使用
        process.env.NODE_ENV = 'production';
        const mockTTS = require('../../services/mock_tts');

        expect(mockTTS.isAvailable()).toBe(false);
        await expect(mockTTS.generateVoice('hello')).rejects.toThrow(/Mock TTS cannot generate voice/);
    });

    /**
     * @description 验证天气查询在缺少 AMAP_KEY 时直接失败，而非返回示例天气数据
     */
    test('weather query fails without AMAP_KEY instead of returning sample weather', async () => {
        // 删除高德地图 API Key，模拟未配置场景
        delete process.env.AMAP_KEY;
        const weatherSearch = require('../../services/weather_search');

        await expect(weatherSearch.getCurrentWeather('Beijing')).rejects.toThrow(/AMAP_KEY/);
    });

    /**
     * @description 验证快捷工具对未实现的动作返回失败，而非假装执行成功
     */
    test('quick tools return failure for unimplemented actions', async () => {
        const toolExecutor = require('../../services/direct_action/tool_executor');

        // alarm（闹钟）和 summary（摘要）均未实现，应返回 success: false
        await expect(toolExecutor.execute('alarm', { time: '09:00' }))
            .resolves.toMatchObject({ success: false, tool: 'alarm' });
        await expect(toolExecutor.execute('summary', { content: 'abc' }))
            .resolves.toMatchObject({ success: false, tool: 'summary' });
    });

    /**
     * @description 验证天气快捷工具在真实天气服务未配置时返回失败
     */
    test('quick weather tool fails when the real weather provider is not configured', async () => {
        delete process.env.AMAP_KEY;
        const toolExecutor = require('../../services/direct_action/tool_executor');

        await expect(toolExecutor.execute('weather', { city: 'Beijing' }))
            .resolves.toMatchObject({ success: false, tool: 'weather' });
    });

    /**
     * @description 验证直达动作的通用回退逻辑不会对未知工具报告成功
     */
    test('direct-action generic fallback does not report success', async () => {
        const DirectActionService = require('../../services/direct_action');
        const service = new DirectActionService({ chat: jest.fn() });

        await expect(service.executeGenericTool('unknown_tool', { a: 1 }))
            .resolves.toMatchObject({ success: false, tool: 'unknown_tool' });
    });

    /**
     * @description 验证增强搜索引擎不会捏造 example.com 等虚假搜索结果
     */
    test('enhanced search does not fabricate example.com results', async () => {
        const searchEngine = require('../../services/enhancedSearch/search_engine');
        const result = await searchEngine.search('xiaomeng');

        expect(result).toMatchObject({ success: false });
        // 确保没有伪造的搜索结果列表
        expect(result.results).toBeUndefined();
    });

    /**
     * @description 验证票务搜索不会捏造虚假的列车可用信息
     */
    test('ticket search does not fabricate train availability', async () => {
        const ticketSearch = require('../../services/ticket_service/search_engine');
        const result = await ticketSearch.search({
            from: 'Beijing',
            to: 'Shanghai',
            date: '2026-06-06',
            type: 'train'
        });

        expect(result).toMatchObject({ success: false });
        // 不应存在伪造的结果数据
        expect(result.results).toBeUndefined();
    });

    /**
     * @description 验证票务服务保留不可用状态，而非将搜索失败包装为成功
     */
    test('ticket service preserves unavailable search instead of wrapping it as success', async () => {
        const ticketService = require('../../services/ticket_service');
        const result = await ticketService.search({
            from: 'Beijing',
            to: 'Shanghai',
            date: '2026-06-06',
            type: 'train'
        });

        expect(result).toMatchObject({ success: false });
        // 消息中应明确说明没有真实提供商
        expect(result.message).toMatch(/no real provider/i);
    });

    /**
     * @description 验证订票链接生成不会声称订票已完成，而是标记为需要用户操作
     */
    test('booking link generation does not claim ticket booking completed', async () => {
        const ticketService = require('../../services/ticket_service');
        const result = await ticketService.generateBookingLink({
            from: 'Beijing',
            to: 'Shanghai',
            date: '2026-06-06',
            platform: 'train'
        });

        // success: true 表示链接生成成功，但 bookingCompleted: false 表示订票未完成
        expect(result).toMatchObject({
            success: true,
            actionRequired: true,
            bookingCompleted: false
        });
    });

    /**
     * @description 验证任务编排器的占位处理器返回错误信息，而非伪装为信息类结果
     */
    test('task orchestrator placeholder handlers return errors, not info results', async () => {
        const toolHandlers = require('../../services/task_orchestrator/tool_handlers');

        // 测试一个仍然返回 implemented:false 的未知动作
        const result = await toolHandlers.executeStep('unknown_action', 'some description');

        expect(result).toMatchObject({
            implemented: false,
            original: 'some description'
        });
        // 错误信息中应包含"未实现"说明
        expect(result.error).toMatch(/not implemented/);
        // 不应有 success 字段，避免被误判为成功
        expect(result.success).toBeUndefined();
    });

    /**
     * @description 验证任务编排器已实现的动作能返回真实结果
     */
    test('task orchestrator implemented actions return real results', async () => {
        const toolHandlers = require('../../services/task_orchestrator/tool_handlers');

        // verify 动作 - 检查项目结构，应返回真实文件列表
        const verifyResult = await toolHandlers.executeStep('verify', process.cwd());
        expect(verifyResult.success).toBe(true);
        expect(verifyResult.path).toBe(process.cwd());
        expect(verifyResult.keyFiles).toBeDefined();

        // organize_folder 动作 - 整理文件夹，应返回真实分组结果
        const organizeResult = await toolHandlers.executeStep('organize_folder', process.cwd());
        expect(organizeResult.success).toBe(true);
        expect(organizeResult.groups).toBeDefined();
    });

    /**
     * @description 验证执行器对未注册动作的通用回退返回失败
     */
    test('executor generic fallback fails for unregistered actions', async () => {
        const executor = require('../../services/executor');
        const result = await executor.executeTask('unregistered_action', { value: 1 });

        expect(result).toMatchObject({
            success: false,
            action: 'unregistered_action'
        });
    });

    /**
     * @description 验证规划器执行追踪器在没有真实执行器时返回失败，而非假装完成
     */
    test('planner execution tracker fails without a real executor', async () => {
        const executionTracker = require('../../services/planner/execution_tracker');
        const result = await executionTracker.executeTasks([
            { id: 'task_1', action: 'write_report', name: 'Write report' }
        ]);

        expect(result).toMatchObject({
            success: false,
            allCompleted: false,
            completed: 0,
            failed: 1
        });
        // 单个任务结果应标记为未实现
        expect(result.results[0]).toMatchObject({ implemented: false });
    });

    /**
     * @description 验证智能跟进的副作用动作在没有真实执行器时返回失败
     */
    test('smart follow-up side-effect actions fail without a real executor', () => {
        const actionHandler = require('../../services/smart_followup/action_handler');
        const result = actionHandler.execute('copy_text');

        expect(result).toMatchObject({
            success: false,
            action: 'copy_text',
            implemented: false
        });
    });

    /**
     * @description 验证价格同步在没有活跃告警时不会报告成功，而是标记为跳过
     */
    test('price sync does not report success when there are no active alerts', async () => {
        // 模拟价格告警服务返回空列表，表示没有活跃告警
        jest.doMock('../../services/price_alert_service', () => ({
            getActiveAlerts: jest.fn(() => [])
        }));
        const priceSyncService = require('../../services/price_sync_service');

        await expect(priceSyncService.manualSync()).resolves.toMatchObject({
            success: false,
            skipped: true,
            total: 0
        });
    });

    /**
     * @description 验证模型降级在缺少所有 API Key 时报告不可用，而非假装有可用模型
     */
    test('model degradation reports missing API keys as unavailable', async () => {
        // 删除所有 LLM API Key，模拟完全未配置场景
        delete process.env.KIMI_API_KEY;
        delete process.env.MIMO_API_KEY;
        const modelDegradation = require('../../core/model-degradation');

        const status = modelDegradation.getStatus();
        // 所有降级级别的模型都应标记为不可用
        expect(status.levels.every(level => level.health.available === false)).toBe(true);
        // 调用降级方法时应抛出"所有模型不可用"异常
        await expect(modelDegradation.callWithDegradation(jest.fn())).rejects.toThrow(/ALL_MODELS_UNAVAILABLE/);
    });
});
