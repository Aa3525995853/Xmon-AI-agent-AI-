/**
 * @file playwright_launcher.js
 * @description Playwright 浏览器启动器 - 负责 Chromium 浏览器实例的启动、导航和清理，
 *              内置反检测机制以绕过常见自动化识别
 * @module services/browserService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { chromium } = require('playwright');
const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：浏览器启动与页面配置
// ============================================================

/** 默认视口宽度（像素） */
const DEFAULT_VIEWPORT_WIDTH = 1920;

/** 默认视口高度（像素） */
const DEFAULT_VIEWPORT_HEIGHT = 1080;

/** 默认导航超时时间（毫秒） */
const NAVIGATION_TIMEOUT = 30000;

/** 导航等待策略：等待网络空闲，确保页面完全加载 */
const WAIT_UNTIL_STRATEGY = 'networkidle';

/** 模拟的 User-Agent 字符串，伪装为普通 Chrome 浏览器 */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============================================================
// PlaywrightLauncher 类：浏览器生命周期管理
// ============================================================

class PlaywrightLauncher {
    /**
     * @description 启动 Chromium 浏览器并创建页面，注入反自动化检测脚本
     * @param {Object} service - BrowserService 实例，将 browser/context/page 挂载到其上
     * @returns {Promise<void>}
     */
    async launch(service) {
        service.browser = await chromium.launch({
            headless: true,
            args: [
                // 禁用自动化控制特征，避免被网站检测为机器人
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });

        service.context = await service.browser.newContext({
            viewport: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
            userAgent: DEFAULT_USER_AGENT
        });

        service.page = await service.context.newPage();

        // 注入反检测脚本：隐藏 webdriver 标志并伪造插件列表
        await service.page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        });
    }

    /**
     * @description 导航到指定 URL，等待网络空闲后视为加载完成
     * @param {Object} service - BrowserService 实例
     * @param {string} url - 目标页面 URL
     * @returns {Promise<void>}
     */
    async navigate(service, url) {
        try {
            await service.page.goto(url, { waitUntil: WAIT_UNTIL_STRATEGY, timeout: NAVIGATION_TIMEOUT });
        } catch (e) {
            // 导航超时不视为致命错误，页面可能已部分加载可继续操作
            logger.warn('[BrowserService] 导航超时，继续执行');
        }
    }

    /**
     * @description 清理浏览器资源，依次关闭 page、context、browser 并重置引用
     * @param {Object} service - BrowserService 实例
     * @returns {Promise<void>}
     */
    async cleanup(service) {
        try {
            if (service.page) await service.page.close();
            if (service.context) await service.context.close();
            if (service.browser) await service.browser.close();
        } catch (e) {
            logger.warn('[BrowserService] 清理浏览器失败', e.message);
        }
        service.page = null;
        service.context = null;
        service.browser = null;
    }

    /**
     * @description 延时等待，用于动作间插入间隔以模拟人类操作节奏
     * @param {number} ms - 等待毫秒数
     * @returns {Promise<void>}
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new PlaywrightLauncher();