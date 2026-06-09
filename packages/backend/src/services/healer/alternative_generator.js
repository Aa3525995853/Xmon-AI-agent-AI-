/**
 * @file alternative_generator.js
 * @description 替代方案生成器 - 根据错误分类从预定义方案库中生成对应的替代方案列表，
 *              并结合上下文计算优先级排序
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 替代方案库：按错误类别分组的预定义恢复方案
// ============================================================

/** 各错误类别的替代方案列表 */
const ALTERNATIVES = {
    network: [
        { name: '网络重试', action: 'retry', maxAttempts: 3, delay: 1000 },
        { name: '备用服务器', action: 'useBackup', servers: [] }
    ],
    timeout: [
        { name: '延长超时', action: 'extendTimeout', factor: 2 },
        { name: '简化请求', action: 'simplifyRequest' }
    ],
    permission: [
        { name: '请求权限', action: 'requestPermission', type: 'user' },
        { name: '使用缓存', action: 'useCache' }
    ],
    not_found: [
        { name: '创建资源', action: 'createResource' },
        { name: '搜索替代', action: 'searchAlternative' }
    ],
    rate_limit: [
        { name: '等待重试', action: 'waitAndRetry', delay: 60000 },
        { name: '分批处理', action: 'batchProcess', batchSize: 10 }
    ],
    format: [
        { name: '尝试解析', action: 'tryParse' },
        { name: '返回原始', action: 'returnRaw' }
    ],
    system: [
        { name: '记录日志', action: 'logError' },
        { name: '回退方案', action: 'fallback' }
    ]
};

class AlternativeGenerator {
    /**
     * @description 根据错误分类从方案库中生成替代方案，并按优先级排序
     * @param {Object} classification - 错误分类结果，需包含 category 字段
     * @param {Object} context - 执行上下文
     * @returns {Array<Object>} 替代方案列表，按优先级从高到低排序
     */
    generate(classification, context = {}) {
        const { category } = classification;

        // 未找到对应类别时回退到系统默认方案
        const alternatives = ALTERNATIVES[category] || ALTERNATIVES.system;

        // 根据上下文计算优先级并排序
        return alternatives.map(alt => ({
            ...alt,
            context,
            priority: this._calculatePriority(alt, context)
        })).sort((a, b) => b.priority - a.priority);
    }

    /**
     * @description 根据替代方案类型和上下文计算优先级分数
     * @param {Object} alternative - 替代方案对象
     * @param {string} alternative.action - 方案动作类型
     * @param {Object} context - 执行上下文
     * @returns {number} 优先级分数（0~1），越高越优先
     */
    _calculatePriority(alternative, context) {
        let priority = 0.5;

        // 重试操作优先级较高，因为成本最低
        if (alternative.action === 'retry') priority += 0.2;
        // 缓存回退优先级最高，可立即返回结果
        if (alternative.action === 'useCache') priority += 0.3;
        // 回退方案优先级较低，意味着功能降级
        if (alternative.action === 'fallback') priority -= 0.2;

        return Math.max(0, Math.min(1, priority));
    }
}

module.exports = new AlternativeGenerator();