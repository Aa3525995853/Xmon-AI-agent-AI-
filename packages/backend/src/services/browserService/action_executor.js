/**
 * @file action_executor.js
 * @description 浏览器动作执行器 - 执行点击、填写、等待、提取、截图等浏览器操作，
 *              内置验证码检测和多种内容提取格式
 * @module services/browserService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：动作消息与默认超时
// ============================================================

/** 默认操作超时时间（毫秒） */
const DEFAULT_ACTION_TIMEOUT = 5000;

/** 默认键盘输入延迟（毫秒），模拟人类打字节奏 */
const DEFAULT_TYPE_DELAY = 50;

/** 动作类型对应的中文进度消息 */
const ACTION_MESSAGES = {
    click: '正在点击...',
    fill: '正在填写表单...',
    type: '正在输入...',
    wait: '正在等待...',
    captcha_check: '正在检查...',
    extract: '正在提取内容...',
    screenshot: '正在截图...',
    scroll: '正在滚动...',
    evaluate: '正在执行脚本...'
};

// ============================================================
// ActionExecutor 类：浏览器动作执行核心逻辑
// ============================================================

class ActionExecutor {
    /**
     * @description 获取动作类型对应的中文进度消息
     * @param {Object} action - 动作对象
     * @param {string} action.type - 动作类型
     * @returns {string} 中文进度消息
     */
    getActionMessage(action) {
        return ACTION_MESSAGES[action.type] || `正在执行 ${action.type}...`;
    }

    /**
     * @description 执行单个浏览器动作，支持 click/fill/type/wait/captcha_check/extract/screenshot/scroll/evaluate
     * @param {Object} service - BrowserService 实例，提供 page 对象
     * @param {Object} action - 动作描述
     * @param {string} action.type - 动作类型
     * @param {string} [action.selector] - CSS 选择器
     * @param {string} [action.value] - 填写/输入的值
     * @param {number} [action.timeout] - 超时时间
     * @param {number} [action.delay] - 输入延迟
     * @param {string} [action.format] - 提取格式（text/html/links/images）
     * @param {boolean} [action.fullPage] - 是否全页截图
     * @param {number} [action.y] - 滚动距离
     * @param {string} [action.script] - 执行的 JS 脚本
     * @returns {Promise<{type: string, success?: boolean, data?: *}>} 动作执行结果
     * @throws {Error} 当遇到验证码拦截或未知动作类型时抛出异常
     */
    async execute(service, action) {
        const { type } = action;

        switch (type) {
            case 'click':
                await service.page.click(action.selector, { timeout: action.timeout || DEFAULT_ACTION_TIMEOUT });
                return { type, selector: action.selector, success: true };

            case 'fill':
                await service.page.fill(action.selector, action.value, { timeout: action.timeout || DEFAULT_ACTION_TIMEOUT });
                return { type, selector: action.selector, value: action.value, success: true };

            case 'type':
                await service.page.type(action.selector, action.value, {
                    delay: action.delay || DEFAULT_TYPE_DELAY, timeout: action.timeout || DEFAULT_ACTION_TIMEOUT
                });
                return { type, selector: action.selector, value: action.value, success: true };

            case 'wait':
                if (action.selector) {
                    await service.page.waitForSelector(action.selector, { timeout: action.timeout || DEFAULT_ACTION_TIMEOUT });
                } else if (action.time) {
                    // 固定时间等待，用于页面动画或延迟加载场景
                    await new Promise(resolve => setTimeout(resolve, action.time));
                }
                return { type, selector: action.selector, success: true };

            case 'captcha_check':
                const isCaptcha = await this._detectCaptcha(service);
                if (isCaptcha) {
                    const err = new Error('CAPTCHA_BLOCKED: 页面被反爬虫验证拦截');
                    err.code = 'CAPTCHA_BLOCKED';
                    throw err;
                }
                return { type, success: true, captchaDetected: false };

            case 'extract':
                const content = await this._extractContent(service, action.selector, action.format);
                return { type, selector: action.selector, format: action.format, data: content };

            case 'screenshot':
                const screenshot = await service.page.screenshot({ fullPage: action.fullPage, type: 'png' });
                return { type, format: 'base64', data: screenshot.toString('base64') };

            case 'scroll':
                await service.page.evaluate((y) => window.scrollBy(0, y), action.y || 500);
                return { type, y: action.y, success: true };

            case 'evaluate':
                const result = await service.page.evaluate(action.script);
                return { type, result };

            default:
                throw new Error(`Unknown action type: ${type}`);
        }
    }

    /**
     * @description 检测页面是否存在验证码/反爬虫拦截，通过 URL 关键词和 DOM 选择器双重检测
     * @param {Object} service - BrowserService 实例
     * @returns {Promise<boolean>} 是否检测到验证码
     */
    async _detectCaptcha(service) {
        try {
            const url = service.page.url();
            if (/\/challenge|\/captcha|verify\b|\/security/i.test(url)) {
                logger.warn('[BrowserService] CAPTCHA 检测: URL 包含验证路径');
                return true;
            }

            // 常见验证码/反爬虫 DOM 选择器列表
            const captchaSelectors = [
                '#bnp_btn_link', '#bnp_cookie_banner', '.captcha-container',
                '#captcha', '.challenge-form', '#challenge', '[data-testid="captcha"]'
            ];

            for (const selector of captchaSelectors) {
                const el = await service.page.$(selector);
                if (el) return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * @description 从页面提取内容，支持 text/html/links/images 四种格式
     * @param {Object} service - BrowserService 实例
     * @param {string} selector - CSS 选择器
     * @param {string} format - 提取格式（text/html/links/images）
     * @returns {Promise<string|Array|null>} 提取的内容，失败返回 null
     */
    async _extractContent(service, selector, format) {
        if (format === 'text') {
            return await service.page.$eval(selector, el => el.innerText).catch(() => '');
        } else if (format === 'html') {
            return await service.page.$eval(selector, el => el.innerHTML).catch(() => '');
        } else if (format === 'links') {
            return await service.page.$$eval(`${selector} a`, links =>
                links.map(a => ({ text: a.innerText, href: a.href })).filter(l => l.href)
            );
        } else if (format === 'images') {
            return await service.page.$$eval(`${selector} img`, imgs =>
                imgs.map(img => ({ src: img.src, alt: img.alt })).filter(i => i.src)
            );
        }
        return null;
    }
}

module.exports = new ActionExecutor();