/**
 * @file error_patterns.js
 * @description 错误模式识别 - 基于正则表达式匹配错误消息，自动识别错误类别和严重级别，
 *              涵盖网络、权限、资源、文件、限流、验证码、格式和系统等常见错误模式
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { SeverityLevel, ErrorCategory } = require('./constants');

// ============================================================
// 错误模式定义：按类别分组的正则匹配规则
// ============================================================

/**
 * 错误模式列表，每项包含：
 * - pattern: 正则表达式，用于匹配错误消息
 * - category: 错误分类（对应 ErrorCategory）
 * - severity: 严重级别（对应 SeverityLevel）
 */
const ERROR_PATTERNS = [
    // 网络相关
    { pattern: /ECONNRESET|connection reset/i, category: ErrorCategory.NETWORK, severity: SeverityLevel.RECOVERABLE },
    { pattern: /ECONNREFUSED|connection refused/i, category: ErrorCategory.NETWORK, severity: SeverityLevel.RECOVERABLE },
    { pattern: /ETIMEDOUT|timeout/i, category: ErrorCategory.TIMEOUT, severity: SeverityLevel.RECOVERABLE },
    { pattern: /ENOTFOUND|dns/i, category: ErrorCategory.NETWORK, severity: SeverityLevel.RECOVERABLE },

    // 权限相关
    { pattern: /EACCES|permission denied/i, category: ErrorCategory.PERMISSION, severity: SeverityLevel.USER_REQUIRED },
    { pattern: /EROFS|read only/i, category: ErrorCategory.PERMISSION, severity: SeverityLevel.RECOVERABLE },

    // 资源相关
    { pattern: /EBUSY|resource busy/i, category: ErrorCategory.RESOURCE, severity: SeverityLevel.RECOVERABLE },
    { pattern: /EMFILE|too many open files/i, category: ErrorCategory.RESOURCE, severity: SeverityLevel.RECOVERABLE },
    { pattern: /ENOMEM|out of memory/i, category: ErrorCategory.RESOURCE, severity: SeverityLevel.RECOVERABLE },

    // 文件相关
    { pattern: /ENOENT|no such file/i, category: ErrorCategory.NOT_FOUND, severity: SeverityLevel.RECOVERABLE },
    { pattern: /EISDIR|is directory/i, category: ErrorCategory.FORMAT, severity: SeverityLevel.RECOVERABLE },

    // 限流相关
    { pattern: /429|rate limit/i, category: ErrorCategory.RATE_LIMIT, severity: SeverityLevel.RECOVERABLE },
    { pattern: /too many requests/i, category: ErrorCategory.RATE_LIMIT, severity: SeverityLevel.RECOVERABLE },

    // 验证码
    { pattern: /captcha|challenge/i, category: ErrorCategory.CAPTCHA, severity: SeverityLevel.RECOVERABLE },

    // 格式相关
    { pattern: /invalid.*json|json.*parse/i, category: ErrorCategory.FORMAT, severity: SeverityLevel.RECOVERABLE },
    { pattern: /unsupported.*format/i, category: ErrorCategory.FORMAT, severity: SeverityLevel.RECOVERABLE },

    // 系统相关
    { pattern: /crash|panic|abort/i, category: ErrorCategory.SYSTEM, severity: SeverityLevel.FATAL },
    { pattern: /internal.*error|server.*error/i, category: ErrorCategory.SYSTEM, severity: SeverityLevel.RECOVERABLE }
];

class ErrorPatterns {
    /**
     * @description 根据错误消息匹配预定义的错误模式，返回分类结果
     * @param {Error|string} error - 异常对象或错误消息字符串
     * @returns {{category: string, severity: string, pattern: RegExp|null, originalError: Error|string, message: string}} 分类结果
     */
    classify(error) {
        const message = error.message || String(error);

        for (const { pattern, category, severity } of ERROR_PATTERNS) {
            if (pattern.test(message)) {
                return { category, severity, pattern, originalError: error, message };
            }
        }

        // 未匹配到任何已知模式时，默认归为系统错误、可恢复级别
        return {
            category: ErrorCategory.SYSTEM,
            severity: SeverityLevel.RECOVERABLE,
            pattern: null,
            originalError: error,
            message
        };
    }
}

module.exports = new ErrorPatterns();