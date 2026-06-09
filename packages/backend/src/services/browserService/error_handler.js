/**
 * @file error_handler.js
 * @description 浏览器服务错误处理器 - 将技术性错误消息分类并转换为用户友好的中文提示，
 *              保留原始错误信息用于调试
 * @module services/browserService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// ErrorHandler 类：错误分类与人性化提示
// ============================================================

class ErrorHandler {
    /**
     * @description 根据错误消息关键词分类错误，返回带 code 和 humanized 提示的新错误对象
     * @param {Error} error - 原始错误对象
     * @returns {Error} 分类后的错误对象，包含 code、humanized 消息和 originalError
     */
    classifyError(error) {
        const msg = error.message || '';

        // 错误关键词 → 分类码 + 人性化提示的映射表
        const mappings = {
            'captcha': { code: 'CAPTCHA_BLOCKED', humanized: '那个网站加了防爬锁，我进不去呢...' },
            'detached': { code: 'PAGE_DETACHED', humanized: '浏览器突然断开了...' },
            'timeout': { code: 'TIMEOUT', humanized: '等太久了，网页没反应...' },
            'rate limit': { code: 'RATE_LIMITED', humanized: '访问太频繁被拦住了，等一下再试...' },
            'net::': { code: 'NETWORK_ERROR', humanized: '网络问题打不开网页...' },
            'not found': { code: 'NOT_FOUND', humanized: '找不到这个网页呢...' },
            'permission': { code: 'PERMISSION_DENIED', humanized: '没有权限访问...' },
            'EADDRNOTAVAIL': { code: 'ADDRESS_NOT_AVAILABLE', humanized: '网络地址不可用...' }
        };

        for (const [key, mapping] of Object.entries(mappings)) {
            if (msg.toLowerCase().includes(key)) {
                const classified = new Error(mapping.humanized);
                classified.code = mapping.code;
                classified.originalError = msg;
                return classified;
            }
        }

        return error;
    }
}

module.exports = new ErrorHandler();