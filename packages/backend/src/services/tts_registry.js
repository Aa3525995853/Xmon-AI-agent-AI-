/**
 * @file tts_registry.js
 * @description TTS 提供商注册表，负责加载、切换和健康检查各 TTS 服务（Mimo/Volcano/MiniMax/Edge/Mock）
 * @module services/tts_registry
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../utils/logger');

// ============================================================
// 常量配置：TTS 提供商注册表
// ============================================================

/** 默认 TTS 提供商，未配置 TTS_PROVIDER 时使用 Mimo */
const DEFAULT_PROVIDER = 'mimo';

/** 可用的 TTS 提供商映射表 */
const AVAILABLE_PROVIDERS = {
    mimo: './mimo_tts',
    volcano: './volcano_tts',
    minimax: './minimax_tts',
    edge: './edge_tts',
    mock: './mock_tts'
};

// ============================================================
// TTS 提供商解析与加载
// ============================================================

/**
 * @description 解析 TTS 提供商名称，优先使用传入参数，其次环境变量，最后默认值
 * @param {string} [provider] - 指定的提供商名称
 * @returns {string} 解析后的提供商名称
 */
function resolveTTSProviderName(provider) {
    return provider || process.env.TTS_PROVIDER || DEFAULT_PROVIDER;
}

/**
 * @description 判断 Mock 提供商是否允许使用（仅在测试环境下允许）
 * @param {string} provider - 提供商名称
 * @returns {boolean} 是否允许使用 Mock 提供商
 */
function isMockAllowed(provider) {
    // Mock TTS 返回空 Buffer，仅在显式设置 NODE_ENV=test 且 TTS_PROVIDER=mock 时有效
    return provider === 'mock' && process.env.NODE_ENV === 'test';
}

/**
 * @description 加载指定 TTS 提供商模块
 * @param {string} providerName - 提供商名称
 * @returns {Object} TTS 服务实例
 * @throws {Error} 提供商未知、Mock 在非测试环境使用或加载失败时抛出错误
 */
function loadTTSProvider(providerName) {
    const provider = resolveTTSProviderName(providerName);
    const providerPath = AVAILABLE_PROVIDERS[provider];

    if (!providerPath) {
        throw new Error(`[TTS] Unknown provider: ${provider}`);
    }

    if (provider === 'mock' && !isMockAllowed(provider)) {
        throw new Error('[TTS] Mock provider is only allowed when NODE_ENV=test');
    }

    try {
        const service = require(providerPath);
        logger.info(`[TTS] Loaded provider: ${provider}`);
        return service;
    } catch (error) {
        logger.error(`[TTS] Failed to load provider: ${provider}`, { error: error.message });
        throw error;
    }
}

/**
 * @description 获取当前 TTS 提供商实例（按环境变量配置加载）
 * @returns {Object} TTS 服务实例
 */
function getCurrentTTSProvider() {
    return loadTTSProvider(resolveTTSProviderName());
}

// ============================================================
// TTS 健康检查
// ============================================================

/**
 * @description 检查当前 TTS 提供商的健康状态，包括可用性和延迟
 * @returns {Promise<Object>} 健康状态对象，包含 provider/available/latency/error
 */
async function checkTTSHealth() {
    const provider = resolveTTSProviderName();
    const health = {
        provider,
        available: false,
        latency: null,
        error: null
    };

    try {
        const startTime = Date.now();
        const ttsService = loadTTSProvider(provider);
        health.latency = Date.now() - startTime;

        // This is a configuration health check, not a paid synthesis probe.
        // It must still report unavailable when Mimo keys are missing.
        if (typeof ttsService.isAvailable !== 'function') {
            health.error = 'TTS provider does not expose isAvailable()';
            return health;
        }

        health.available = !!ttsService.isAvailable();
        if (!health.available) {
            health.error = provider === 'mimo'
                ? 'Mimo TTS is not configured. Set MIMO_TTS_API_KEY and MIMO_TTS_API_URL.'
                : `TTS provider ${provider} is not available.`;
        }
    } catch (error) {
        health.error = error.message;
    }

    return health;
}

module.exports = {
    loadTTSProvider,
    getCurrentTTSProvider,
    checkTTSHealth,
    AVAILABLE_PROVIDERS,
    DEFAULT_PROVIDER
};
