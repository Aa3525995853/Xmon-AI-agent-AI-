/**
 * @file error_classifier.js
 * @description 错误分类器 - 将技术错误码转换为结构化错误码和拟人化消息
 * @module services/workBrainClient
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/** 错误码映射表 - 将原始错误类型映射为结构化错误码和拟人化消息 */
const ERROR_CODE_MAP = {
    'CAPTCHA': { code: 'WORKBRAIN_CAPTCHA', humanized: '那个网站好像加了防爬虫的锁，我进不去呀……' },
    'LOGIN_REQUIRED': { code: 'WORKBRAIN_LOGIN_REQUIRED', humanized: '这个网站需要登录才能看，我没有账号呢……' },
    'PAYWALL': { code: 'WORKBRAIN_PAYWALL', humanized: '这个内容要付费才能看，我没办法访问……' },
    'TIMEOUT': { code: 'WORKBRAIN_TIMEOUT', humanized: '这个任务花了太长时间，我先停下来了~' },
    'NAVIGATION': { code: 'WORKBRAIN_NAVIGATION_FAILED', humanized: '网页打不开，可能是网络问题或者网址不对……' },
    'RATE_LIMIT': { code: 'WORKBRAIN_RATE_LIMITED', humanized: '访问太频繁被拦住了，等一下再试吧~' },
    'NETWORK': { code: 'WORKBRAIN_NETWORK_ERROR', humanized: '网络好像不太稳定，连不上那个网站……' },
    'PERMISSION': { code: 'WORKBRAIN_PERMISSION_DENIED', humanized: '我没有权限访问这个内容……' },
    'NOT_FOUND': { code: 'WORKBRAIN_NOT_FOUND', humanized: '找不到你要的内容呢……' },
    'ABORTED': { code: 'WORKBRAIN_ABORTED', humanized: '好的，任务已经取消了~' }
};

class ErrorClassifier {
    /**
     * @description 分类错误 - 根据错误消息关键词判断错误类型
     * @param {Error} error - 错误对象
     * @returns {string} 结构化错误码
     */
    classify(error) {
        const msg = (error.message || '').toLowerCase();

        if (msg.includes('captcha') || msg.includes('challenge')) {
            return 'WORKBRAIN_CAPTCHA';
        }
        if (msg.includes('detached') || msg.includes('disconnected')) {
            return 'WORKBRAIN_PAGE_DETACHED';
        }
        if (msg.includes('timeout') || msg.includes('timed out')) {
            return 'WORKBRAIN_TIMEOUT';
        }
        if (msg.includes('rate limit') || msg.includes('too many')) {
            return 'WORKBRAIN_RATE_LIMITED';
        }
        if (msg.includes('net::') || msg.includes('failed to fetch') || msg.includes('econnrefused')) {
            return 'WORKBRAIN_NETWORK_ERROR';
        }
        if (msg.includes('not found') || msg.includes('404')) {
            return 'WORKBRAIN_NOT_FOUND';
        }
        if (msg.includes('permission') || msg.includes('403')) {
            return 'WORKBRAIN_PERMISSION_DENIED';
        }

        return 'WORKBRAIN_INTERNAL_ERROR';
    }

    /**
     * @description 人性化错误消息 - 将错误码转换为用户友好的提示
     * @param {Error} error - 错误对象
     * @returns {Object} 包含 code、humanized、raw 的对象
     */
    humanize(error) {
        const code = error.code || error.message || '';
        const codeStr = String(code);

        for (const [key, mapping] of Object.entries(ERROR_CODE_MAP)) {
            if (codeStr.includes(key) || codeStr.includes(mapping.code)) {
                return {
                    code: mapping.code,
                    humanized: mapping.humanized,
                    raw: error.message
                };
            }
        }

        if (codeStr.includes('WORKBRAIN_CIRCUIT_OPEN')) {
            return { code: 'WORKBRAIN_CIRCUIT_OPEN', humanized: '工作大脑太累了在休息，等一下再试~', raw: error.message };
        }
        if (codeStr.includes('WORKBRAIN_ABORTED')) {
            return { code: 'WORKBRAIN_ABORTED', humanized: '好的，任务已经取消了~', raw: error.message };
        }
        if (codeStr.includes('WORKBRAIN_TIMEOUT')) {
            return { code: 'WORKBRAIN_TIMEOUT', humanized: '这个任务花了太长时间，我先停下来了~', raw: error.message };
        }
        if (codeStr.includes('WORKBRAIN_NETWORK_ERROR')) {
            return { code: 'WORKBRAIN_NETWORK_ERROR', humanized: '网络好像不太稳定，连不上那个网站……', raw: error.message };
        }
        if (codeStr.includes('WORKBRAIN_INTERNAL_ERROR')) {
            return { code: 'WORKBRAIN_INTERNAL_ERROR', humanized: '工作大脑处理任务时出了点状况，我再试试别的方式~', raw: error.message };
        }

        return { code: 'UNKNOWN_ERROR', humanized: '出了点意外状况，我再试试~', raw: error.message };
    }
}

module.exports = new ErrorClassifier();