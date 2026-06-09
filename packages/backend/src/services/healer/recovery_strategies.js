/**
 * @file recovery_strategies.js
 * @description 恢复策略执行器 - 根据错误分类执行对应的恢复策略，包括延迟重试、
 *              退避重试、批处理缩减、缓存回退、步骤跳过、数据转换、输入清理和替代资源搜索
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { ErrorCategory } = require('./constants');
const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：恢复策略默认参数
// ============================================================

/** 默认延迟重试等待时间（毫秒） */
const DEFAULT_RETRY_DELAY_MS = 2000;

/** 默认超时/批处理倍增系数 */
const DEFAULT_MULTIPLIER = 2;

/** 默认批处理大小 */
const DEFAULT_BATCH_SIZE = 10;

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 30000;

class RecoveryStrategies {
    /**
     * @description 执行替代方案，根据 action 类型分发到对应的恢复策略
     * @param {Object} alternative - 替代方案对象
     * @param {string} alternative.action - 恢复策略动作类型
     * @param {Object} classification - 错误分类结果
     * @param {Object} context - 执行上下文
     * @returns {Promise<{success: boolean, action?: string, config?: Object, data?: any, error?: string}>} 恢复结果
     */
    async execute(alternative, classification, context) {
        logger.info(`[Healer] 执行替代方案: ${alternative.action}`);

        try {
            switch (alternative.action) {
                case 'retry_with_delay':
                    await this._delay(alternative.delay || DEFAULT_RETRY_DELAY_MS);
                    return { success: true, action: 'retry' };

                case 'backoff':
                case 'increase_timeout': {
                    const multiplier = alternative.multiplier || DEFAULT_MULTIPLIER;
                    return {
                        success: true,
                        action: 'retry_with_config',
                        config: { timeout: (context.timeout || DEFAULT_TIMEOUT_MS) * multiplier }
                    };
                }

                case 'reduce_batch_size':
                    // 将批处理大小减半，降低单次请求的资源消耗
                    return {
                        success: true,
                        action: 'retry_with_config',
                        config: { batchSize: Math.ceil((context.batchSize || DEFAULT_BATCH_SIZE) / 2) }
                    };

                case 'use_cache':
                    if (context.cachedResult) {
                        return { success: true, action: 'use_cache', data: context.cachedResult };
                    }
                    return { success: false };

                case 'skip_this_step':
                    // 跳过当前步骤，继续执行后续流程
                    return { success: true, action: 'skip' };

                case 'auto_convert':
                    return {
                        success: true,
                        action: 'retry_with_conversion',
                        convertedData: this._convertData(context.data, classification.message)
                    };

                case 'sanitize_input':
                    return {
                        success: true,
                        action: 'retry_with_sanitization',
                        sanitizedData: this._sanitizeInput(context.data)
                    };

                case 'search_alternative': {
                    const altResource = await this._searchAlternativeResource(context);
                    if (altResource) {
                        return { success: true, action: 'use_alternative', resource: altResource };
                    }
                    return { success: false };
                }

                default:
                    return { success: false, error: 'Unknown alternative action' };
            }
        } catch (e) {
            logger.error(`[Healer] 替代方案执行失败: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    // ============================================================
    // 内部工具方法
    // ============================================================

    /**
     * @description 异步延迟工具方法
     * @param {number} ms - 延迟时间（毫秒）
     * @returns {Promise<void>} 延迟 Promise
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * @description 根据错误信息自动转换数据格式，当前仅处理编码类错误
     * @param {any} data - 原始数据
     * @param {string} errorMessage - 错误消息，用于判断转换方向
     * @returns {any} 转换后的数据
     */
    _convertData(data, errorMessage) {
        // 编码错误时强制使用 utf-8 编码
        if (errorMessage.includes('encoding')) {
            return { encoding: 'utf-8' };
        }
        return data;
    }

    /**
     * @description 清理输入中的危险字符，防止注入攻击
     * @param {any} data - 待清理的数据
     * @returns {any} 清理后的数据，字符串类型会移除 HTML 特殊字符
     */
    _sanitizeInput(data) {
        if (typeof data === 'string') {
            // 移除可能导致注入的特殊字符
            return data.replace(/[<>'"&]/g, '');
        }
        return data;
    }

    /**
     * @description 从上下文中搜索替代资源，优先使用上次记录的资源列表
     * @param {Object} context - 执行上下文，需包含 lastResources 数组
     * @returns {Promise<any|null>} 替代资源，未找到则返回 null
     */
    async _searchAlternativeResource(context) {
        if (context.lastResources && context.lastResources.length > 0) {
            return context.lastResources[0];
        }
        return null;
    }

    // ============================================================
    // 用户提示生成
    // ============================================================

    /**
     * @description 根据错误分类生成面向用户的恢复提示文案
     * @param {Object} classification - 错误分类结果，需包含 category 字段
     * @returns {string} 用户可读的恢复建议
     */
    generateHint(classification) {
        const hints = {
            [ErrorCategory.NETWORK]: '检查网络连接，或稍后重试',
            [ErrorCategory.PERMISSION]: '请以管理员权限运行，或手动授予权限',
            [ErrorCategory.RESOURCE]: '关闭其他程序释放资源，或减少批处理大小',
            [ErrorCategory.FORMAT]: '检查文件格式是否正确，或尝试转换格式',
            [ErrorCategory.TIMEOUT]: '增加超时时间，或拆分任务',
            [ErrorCategory.NOT_FOUND]: '请检查文件路径是否正确',
            [ErrorCategory.RATE_LIMIT]: '稍后再试，或使用替代服务',
            [ErrorCategory.CAPTCHA]: '请手动完成验证，或使用备用数据源',
            [ErrorCategory.VALIDATION]: '请检查输入是否正确',
            [ErrorCategory.SYSTEM]: '重启服务或程序后再试'
        };

        return hints[classification.category] || '请稍后重试';
    }
}

module.exports = new RecoveryStrategies();