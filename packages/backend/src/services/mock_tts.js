/**
 * @file mock_tts.js
 * @description 测试专用 Mock TTS 服务，仅在 NODE_ENV=test 环境下可用，返回空 Buffer，不产生真实语音
 * @module services/mock_tts
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// Mock TTS 服务类（仅限测试环境使用）
// ============================================================

class MockTTSService {
    /**
     * @description 构造函数，设置服务名称
     */
    constructor() {
        this.name = 'Mock TTS';
    }

    /**
     * @description 生成测试音频标记，仅在测试环境下返回空 Buffer
     * @param {string} text - 待合成文本（实际不会合成）
     * @returns {Promise<Buffer>} 空 Buffer（仅测试环境）
     * @throws {Error} 非测试环境下调用时抛出错误
     */
    async generateVoice(text) {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('[TTS] Mock TTS cannot generate voice outside NODE_ENV=test');
        }

        console.log(`[${this.name}] test-only voice generation: ${String(text).substring(0, 50)}...`);
        // Test-only empty audio marker. Never treat this as real synthesized
        // speech in production paths.
        return Buffer.from('');
    }

    /**
     * @description 报告可用性，仅在测试环境下返回 true
     * @returns {boolean} 是否可用
     */
    isAvailable() {
        // A fake provider must not report global availability. The registry
        // already blocks it outside tests; this duplicate check protects any
        // direct import from becoming a fake-green health result.
        return process.env.NODE_ENV === 'test';
    }
}

module.exports = new MockTTSService();
