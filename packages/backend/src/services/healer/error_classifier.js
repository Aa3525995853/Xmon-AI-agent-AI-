/**
 * @file error_classifier.js
 * @description 错误分类器 - 将异常按错误消息模式分类为网络、权限、未找到、格式、限流等类别，
 *              并根据类别判定严重级别（可恢复/需用户操作/致命）
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：严重级别
// ============================================================

/** 严重级别枚举 */
const SeverityLevel = {
    WARNING: 'warning',
    RECOVERABLE: 'recoverable',
    USER_REQUIRED: 'user_required',
    FATAL: 'fatal'
};

// ============================================================
// 错误模式定义：按分组组织的正则匹配规则
// ============================================================

/** 错误模式映射表，键为分组名，值为该分组下的模式列表 */
    network: [
        { pattern: /network/i, category: 'network' },
        { pattern: /ECONNREFUSED/i, category: 'network' },
        { pattern: /ENOTFOUND/i, category: 'network' },
        { pattern: /timeout/i, category: 'timeout' }
    ],
    permission: [
        { pattern: /permission denied/i, category: 'permission' },
        { pattern: /EACCES/i, category: 'permission' },
        { pattern: /unauthorized/i, category: 'permission' }
    ],
    notFound: [
        { pattern: /not found/i, category: 'not_found' },
        { pattern: /ENOENT/i, category: 'not_found' },
        { pattern: /404/i, category: 'not_found' }
    ],
    format: [
        { pattern: /invalid format/i, category: 'format' },
        { pattern: /parse error/i, category: 'format' },
        { pattern: /JSON/i, category: 'format' }
    ],
    rateLimit: [
        { pattern: /rate limit/i, category: 'rate_limit' },
        { pattern: /429/i, category: 'rate_limit' },
        { pattern: /too many requests/i, category: 'rate_limit' }
    ]
};

class ErrorClassifier {
    /**
     * @description 对错误进行分类，遍历所有错误模式匹配错误消息，返回分类结果
     * @param {Error|string} error - 异常对象或错误消息字符串
     * @returns {{category: string, severity: string, message: string, recoverable: boolean, userActionRequired: boolean}} 分类结果
     */
    classify(error) {
        const errorStr = String(error.message || error);

        // 按分组遍历模式，匹配到第一个即返回
        for (const [group, patterns] of Object.entries(ERROR_PATTERNS)) {
            for (const { pattern, category } of patterns) {
                if (pattern.test(errorStr)) {
                    return this._createClassification(category, errorStr);
                }
            }
        }

        // 未匹配到任何已知模式时，默认归为系统错误
        return this._createClassification('system', errorStr);
    }

    /**
     * @description 根据错误类别创建分类结果对象，自动判定严重级别
     * @param {string} category - 错误类别
     * @param {string} errorStr - 错误消息字符串
     * @returns {{category: string, severity: string, message: string, recoverable: boolean, userActionRequired: boolean}} 分类结果
     */
    _createClassification(category, errorStr) {
        let severity = SeverityLevel.RECOVERABLE;

        // 权限和未找到类错误需要用户介入才能解决
        if (category === 'permission' || category === 'not_found') {
            severity = SeverityLevel.USER_REQUIRED;
        } else if (category === 'system') {
            // 系统类错误通常无法自动恢复
            severity = SeverityLevel.FATAL;
        }

        return {
            category,
            severity,
            message: errorStr,
            recoverable: severity === SeverityLevel.RECOVERABLE,
            userActionRequired: severity === SeverityLevel.USER_REQUIRED
        };
    }
}

module.exports = new ErrorClassifier();