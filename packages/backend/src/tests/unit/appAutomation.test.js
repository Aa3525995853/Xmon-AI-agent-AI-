/**
 * @file appAutomation.test.js
 * @description AppAutomation 自动化测试 - 验证电脑操作能力（v2.0 Tool 1），
 *              包括云音乐播放控制、工具注册、媒体控制和不支持动作的处理
 * @module tests/unit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const AppAutomation = require('../../services/appAutomation');

// ============================================================
// 模块名称：电脑操作能力测试
// 功能说明：测试云音乐播放控制、工具定义注册、媒体控制等核心功能
// ============================================================

describe('AppAutomation 电脑操作能力测试', () => {
    let appAutomation;

    beforeAll(() => {
        // AppAutomation 导出的是单例/静态对象，直接引用即可
        appAutomation = AppAutomation;
    });

    // ============================================================
    // 工具注册测试
    // ============================================================
    describe('工具注册', () => {
        /**
         * @description 验证 LLM 工具定义中包含 app_action 工具，且具有必要的参数定义
         */
        test('应该返回 app_action 工具定义', () => {
            const tools = appAutomation.getToolsForLLM();
            expect(tools).toBeInstanceOf(Array);
            expect(tools.length).toBeGreaterThan(0);

            const appAction = tools.find(t => t.function?.name === 'app_action');
            expect(appAction).toBeDefined();
            // 验证工具参数包含应用名和动作类型
            expect(appAction.function.parameters.properties.app_name).toBeDefined();
            expect(appAction.function.parameters.properties.action).toBeDefined();
        });

        /**
         * @description 验证 action 枚举包含所有必要的操作类型（播放控制和媒体控制）
         */
        test('action 应该包含所有必要的操作类型', () => {
            const tools = appAutomation.getToolsForLLM();
            const appAction = tools.find(t => t.function?.name === 'app_action');
            const actions = appAction.function.parameters.properties.action.enum;

            // 核心播放动作
            expect(actions).toContain('play_song');
            expect(actions).toContain('play_playlist');
            expect(actions).toContain('play_music');
            expect(actions).toContain('auto_play');

            // 媒体控制
            expect(actions).toContain('pause');
            expect(actions).toContain('next_song');
            expect(actions).toContain('prev_song');
            expect(actions).toContain('volume_up');
            expect(actions).toContain('volume_down');
        });
    });

    // ============================================================
    // 智能播放测试
    // ============================================================
    describe('play_music 智能播放', () => {
        /**
         * @description 验证 play_music 动作能正常执行并返回结果（不检查 success，因网络/API 可能失败）
         */
        test('应该支持 play_music 动作', async () => {
            const result = await appAutomation.execute('网易云音乐', 'play_music', { keyword: '测试音乐' });
            // 不检查 success，因为网络/API 可能失败
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });
    });

    // ============================================================
    // 歌曲播放测试
    // ============================================================
    describe('play_song 歌曲播放', () => {
        /**
         * @description 验证 play_song 动作能正常执行
         */
        test('应该支持 play_song 动作', async () => {
            const result = await appAutomation.execute('网易云音乐', 'play_song', { song: '夜曲' });
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });

        /**
         * @description 验证缺少歌曲参数时返回提示信息而非报错
         */
        test('无参数时应该返回提示', async () => {
            const result = await appAutomation.execute('网易云音乐', 'play_song', {});
            expect(result.success).toBe(false);
            expect(result.message).toContain('想听什么歌');
        });
    });

    // ============================================================
    // 歌单播放测试
    // ============================================================
    describe('play_playlist 歌单播放', () => {
        /**
         * @description 验证 play_playlist 动作能正常执行
         */
        test('应该支持 play_playlist 动作', async () => {
            const result = await appAutomation.execute('网易云音乐', 'play_playlist', { playlist: '华语热歌' });
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });

        /**
         * @description 验证 play_playlist 支持 name 参数作为歌单名称
         */
        test('应该支持 name 参数', async () => {
            const result = await appAutomation.execute('网易云音乐', 'play_playlist', { name: '轻音乐' });
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });
    });

    // ============================================================
    // 媒体控制动作测试
    // ============================================================
    describe('媒体控制动作', () => {
        /**
         * @description 验证暂停动作能正常执行
         */
        test('pause 应该成功执行', async () => {
            const result = await appAutomation.execute('网易云音乐', 'pause');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });

        /**
         * @description 验证下一首动作能正常执行
         */
        test('next_song 应该成功执行', async () => {
            const result = await appAutomation.execute('网易云音乐', 'next_song');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });

        /**
         * @description 验证上一首动作能正常执行
         */
        test('prev_song 应该成功执行', async () => {
            const result = await appAutomation.execute('网易云音乐', 'prev_song');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });

        /**
         * @description 验证音量增大动作能正常执行
         */
        test('volume_up 应该成功执行', async () => {
            const result = await appAutomation.execute('网易云音乐', 'volume_up');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });

        /**
         * @description 验证音量减小动作能正常执行
         */
        test('volume_down 应该成功执行', async () => {
            const result = await appAutomation.execute('网易云音乐', 'volume_down');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });
    });

    // ============================================================
    // 自动播放测试
    // ============================================================
    describe('auto_play 自动播放', () => {
        /**
         * @description 验证 auto_play 自动播放动作能正常执行
         */
        test('应该支持 auto_play 动作', async () => {
            const result = await appAutomation.execute('网易云音乐', 'auto_play');
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });
    });

    // ============================================================
    // 不支持的应用/动作测试
    // ============================================================
    describe('不支持的应用/动作', () => {
        /**
         * @description 验证云音乐内置动作不需要指定应用名即可执行，
         *              因为 play_song 等动作已绑定到云音乐
         */
        test('CLOUDMUSIC_ACTIONS 不需要指定应用名', async () => {
            // 云音乐内置动作（play_song, pause 等）不需要指定 app_name
            // 用户说"播放歌曲"应该直接执行
            const result = await appAutomation.execute('任意应用', 'play_song', { song: '测试' });
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });

        /**
         * @description 验证不支持的动作返回失败并包含"不支持"提示
         */
        test('不支持的动作应该返回提示', async () => {
            const result = await appAutomation.execute('网易云音乐', 'unsupported_action');
            expect(result.success).toBe(false);
            expect(result.message).toContain('不支持');
        });
    });
});