/**
 * @file alternative_selector.js
 * @description 替代方案选择器 - 为各类错误提供预定义的替代方案列表，支持按成功率排序、
 *              上下文感知增强和最佳方案自动选择
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { ErrorCategory } = require('./constants');

// ============================================================
// 替代方案库：按错误类别分组的预定义恢复方案
// ============================================================

/**
 * 各错误类别的替代方案列表
 * 每项包含：
 * - action: 执行动作标识
 * - description: 方案描述
 * - successRate: 历史成功率（0~1）
 * - maxRetries/delay/multiplier 等可选参数
 * - requiresUser/userConfirmation: 是否需要用户参与
 */
const ALTERNATIVES = {
    [ErrorCategory.NETWORK]: [
        { action: 'retry_with_delay', description: '等待后重试', successRate: 0.6, maxRetries: 3, delay: 2000 },
        { action: 'use_proxy', description: '使用备用网络', successRate: 0.4, requiresConfig: true },
        { action: 'switch_protocol', description: '切换协议（HTTP/HTTPS）', successRate: 0.5 },
        { action: 'reduce_data', description: '减少数据量重试', successRate: 0.3 }
    ],
    [ErrorCategory.PERMISSION]: [
        { action: 'request_elevation', description: '请求提升权限', successRate: 0.7, userConfirmation: true },
        { action: 'use_alternative_path', description: '使用替代路径', successRate: 0.5 },
        { action: 'create_with_inheritance', description: '在可写目录创建', successRate: 0.6 }
    ],
    [ErrorCategory.RESOURCE]: [
        { action: 'wait_for_resource', description: '等待资源释放', successRate: 0.5, delay: 5000 },
        { action: 'cleanup_and_retry', description: '清理缓存后重试', successRate: 0.4 },
        { action: 'reduce_batch_size', description: '减少批处理大小', successRate: 0.6 }
    ],
    [ErrorCategory.FORMAT]: [
        { action: 'auto_convert', description: '自动转换格式', successRate: 0.7 },
        { action: 'normalize_data', description: '规范化数据', successRate: 0.5 },
        { action: 'use_fallback_format', description: '使用备用格式', successRate: 0.4 }
    ],
    [ErrorCategory.TIMEOUT]: [
        { action: 'increase_timeout', description: '增加超时时间', successRate: 0.5, multiplier: 2 },
        { action: 'split_task', description: '拆分任务', successRate: 0.6 },
        { action: 'use_cache', description: '使用缓存数据', successRate: 0.4 }
    ],
    [ErrorCategory.NOT_FOUND]: [
        { action: 'search_alternative', description: '搜索替代资源', successRate: 0.5 },
        { action: 'create_resource', description: '创建缺失资源', successRate: 0.7 },
        { action: 'ask_user', description: '询问用户正确位置', successRate: 0.8, requiresUser: true }
    ],
    [ErrorCategory.RATE_LIMIT]: [
        { action: 'backoff', description: '指数退避等待', successRate: 0.7, delay: 10000, backoffFactor: 2 },
        { action: 'use_alternative_service', description: '使用替代服务', successRate: 0.5 },
        { action: 'queue_task', description: '排队等待', successRate: 0.6 }
    ],
    [ErrorCategory.CAPTCHA]: [
        { action: 'skip_this_step', description: '跳过此步骤', successRate: 0.3 },
        { action: 'use_alternative_source', description: '使用替代数据源', successRate: 0.5 },
        { action: 'manual_verification', description: '手动验证', successRate: 0.9, requiresUser: true }
    ],
    [ErrorCategory.VALIDATION]: [
        { action: 'sanitize_input', description: '清理输入', successRate: 0.6 },
        { action: 'use_defaults', description: '使用默认值', successRate: 0.5 },
        { action: 'ask_user_correction', description: '请求用户修正', successRate: 0.8, requiresUser: true }
    ],
    [ErrorCategory.SYSTEM]: [
        { action: 'restart_service', description: '重启服务', successRate: 0.4 },
        { action: 'fallback_to_cache', description: '回退到缓存', successRate: 0.5 },
        { action: 'emergency_mode', description: '进入紧急模式（简化操作）', successRate: 0.3 }
    ]
};

class AlternativeSelector {
    /**
     * @description 根据错误分类和上下文生成替代方案列表，按成功率降序排列
     * @param {Object} classification - 错误分类结果，需包含 category 字段
     * @param {Object} context - 执行上下文，可包含 taskType 等信息
     * @returns {Array<Object>} 替代方案列表，按成功率从高到低排序
     */
    generateAlternatives(classification, context) {
        const categoryAlts = ALTERNATIVES[classification.category] || [];
        const contextAlts = this._getContextAlternatives(classification, context);
        const all = [...categoryAlts, ...contextAlts];

        // 过滤不满足条件的方案，并按成功率降序排列
        return all.filter(alt => {
            if (!alt.conditions) return true;
            return alt.conditions(classification.originalError);
        }).sort((a, b) => b.successRate - a.successRate);
    }

    /**
     * @description 根据上下文任务类型生成额外的替代方案
     * @param {Object} classification - 错误分类结果
     * @param {Object} context - 执行上下文，可包含 taskType 字段
     * @returns {Array<Object>} 上下文相关的替代方案列表
     */
    _getContextAlternatives(classification, context) {
        const alts = [];

        // 浏览器任务额外方案：更换浏览器标识或使用无头模式
        if (context.taskType === 'browser') {
            alts.push({ action: 'retry_with_user_agent', description: '更换浏览器标识重试', successRate: 0.4 });
            alts.push({ action: 'use_headless', description: '使用无头模式', successRate: 0.5 });
        }

        // 文件任务额外方案：创建临时副本避免文件锁冲突
        if (context.taskType === 'file') {
            alts.push({ action: 'create_temp_copy', description: '创建临时副本处理', successRate: 0.6 });
        }

        return alts;
    }

    /**
     * @description 从替代方案列表中选择最佳方案，优先选择无需用户参与的自动方案
     * @param {Array<Object>} alternatives - 替代方案列表
     * @returns {Object} 最佳替代方案
     */
    selectBest(alternatives) {
        const sorted = alternatives.sort((a, b) => b.successRate - a.successRate);

        // 优先选择完全自动化的方案
        const autoAlts = sorted.filter(a => !a.requiresUser && !a.userConfirmation);
        if (autoAlts.length > 0) return autoAlts[0];

        // 其次选择仅需用户确认的方案
        const confirmAlts = sorted.filter(a => a.userConfirmation && !a.requiresUser);
        if (confirmAlts.length > 0) return confirmAlts[0];

        // 最后选择需要用户深度参与的方案
        return sorted[0];
    }
}

module.exports = new AlternativeSelector();