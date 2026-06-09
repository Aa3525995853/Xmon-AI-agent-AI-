/**
 * @file index.js
 * @description BrowserService 主入口 - 自研浏览器自动化服务，
 *              整合 Playwright 启动器、动作执行器和错误处理器，
 *              提供搜索提取、内容抓取、表单填写、截图等高层 API
 * @module services/browserService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

// ============================================================
// 延迟加载子模块：避免循环依赖，按需初始化
// ============================================================

let _playwrightLauncher = null;
let _actionExecutor = null;
let _errorHandler = null;

/**
 * @description 获取 Playwright 启动器单例
 * @returns {Object} PlaywrightLauncher 实例
 */
function getPlaywrightLauncher() {
    if (!_playwrightLauncher) _playwrightLauncher = require('./playwright_launcher');
    return _playwrightLauncher;
}

/**
 * @description 获取动作执行器单例
 * @returns {Object} ActionExecutor 实例
 */
function getActionExecutor() {
    if (!_actionExecutor) _actionExecutor = require('./action_executor');
    return _actionExecutor;
}

/**
 * @description 获取错误处理器单例
 * @returns {Object} ErrorHandler 实例
 */
function getErrorHandler() {
    if (!_errorHandler) _errorHandler = require('./error_handler');
    return _errorHandler;
}

// ============================================================
// 常量定义：搜索引擎与默认配置
// ============================================================

/** 默认动作间隔延迟（毫秒） */
const DEFAULT_ACTION_DELAY = 500;

/** 摘要内容最大长度（字符数），防止提取内容过长 */
const SUMMARY_MAX_LENGTH = 3000;

/** 搜索引擎 URL 模板 */
const SEARCH_URLS = {
    bing: 'https://www.bing.com/search?q=',
    google: 'https://www.google.com/search?q=',
    baidu: 'https://www.baidu.com/s?wd='
};

// ============================================================
// BrowserService 类：浏览器自动化服务主类
// ============================================================

class BrowserService {
    constructor() {
        this.launcher = getPlaywrightLauncher();
        this.executor = getActionExecutor();
        this.handler = getErrorHandler();

        this.browser = null;
        this.context = null;
        this.page = null;
        this.isRunning = false;
        this.lastAction = null;
        this.startTime = null;
    }

    /**
     * @description 执行浏览器自动化任务，依次启动浏览器→导航→执行动作序列→生成摘要
     * @param {Object} task - 任务描述
     * @param {string} task.url - 目标页面 URL
     * @param {Array<Object>} task.actions - 动作序列
     * @param {Function} [onProgress=null] - 进度回调函数
     * @returns {Promise<{success: boolean, results: Array, summary: Object, elapsed: number}>} 执行结果
     * @throws {Error} 当任务被中断或动作执行失败时抛出分类后的错误
     */
    async execute(task, onProgress = null) {
        this.startTime = Date.now();
        this.isRunning = true;

        try {
            await this.launcher.launch(this);

            if (onProgress) {
                onProgress({ status: 'navigating', message: '正在打开网页...', elapsed: 0 });
            }

            await this.launcher.navigate(this, task.url);

            const results = [];
            for (let i = 0; i < task.actions.length; i++) {
                if (!this.isRunning) throw new Error('TASK_ABORTED');

                const action = task.actions[i];
                this.lastAction = action;

                if (onProgress) {
                    onProgress({
                        status: action.type,
                        message: this.executor.getActionMessage(action),
                        step: i + 1,
                        total: task.actions.length,
                        elapsed: Date.now() - this.startTime
                    });
                }

                const result = await this.executor.execute(this, action);
                results.push(result);

                if (i < task.actions.length - 1) {
                    // 动作间插入延迟，模拟人类操作节奏，避免被反爬虫检测
                    await this.launcher.sleep(action.delay || DEFAULT_ACTION_DELAY);
                }
            }

            const summary = await this._generateSummary(results);
            return { success: true, results, summary, elapsed: Date.now() - this.startTime };

        } catch (error) {
            logger.error('[BrowserService] 执行失败', { error: error.message, action: this.lastAction });
            throw this.handler.classifyError(error);
        } finally {
            await this.launcher.cleanup(this);
        }
    }

    /**
     * @description 使用搜索引擎搜索并提取结果页面内容
     * @param {string} query - 搜索关键词
     * @param {Object} [options={}] - 搜索选项
     * @param {string} [options.engine='bing'] - 搜索引擎（bing/google/baidu）
     * @param {string} [options.selector] - 内容提取选择器
     * @param {string} [options.format] - 提取格式
     * @param {Function} [options.onProgress] - 进度回调
     * @returns {Promise<Object>} 搜索与提取结果
     */
    async searchAndExtract(query, options = {}) {
        const searchEngine = options.engine || 'bing';
        const searchUrls = {
            bing: `${SEARCH_URLS.bing}${encodeURIComponent(query)}`,
            google: `${SEARCH_URLS.google}${encodeURIComponent(query)}`,
            baidu: `${SEARCH_URLS.baidu}${encodeURIComponent(query)}`
        };

        return this.execute({
            url: searchUrls[searchEngine],
            actions: [
                { type: 'wait', selector: 'body', timeout: 10000 },
                { type: 'captcha_check' },
                { type: 'extract', selector: options.selector || '#b_content', format: options.format || 'text' }
            ]
        }, options.onProgress);
    }

    /**
     * @description 提取指定 URL 页面的内容
     * @param {string} url - 目标页面 URL
     * @param {Object} [options={}] - 提取选项
     * @param {string} [options.waitFor='body'] - 等待元素选择器
     * @param {number} [options.timeout=10000] - 超时时间
     * @param {string} [options.selector='body'] - 内容提取选择器
     * @param {string} [options.format='text'] - 提取格式
     * @returns {Promise<Object>} 提取结果
     */
    async extractContent(url, options = {}) {
        return this.execute({
            url,
            actions: [
                { type: 'wait', selector: options.waitFor || 'body', timeout: options.timeout || 10000 },
                { type: 'extract', selector: options.selector || 'body', format: options.format || 'text' }
            ]
        }, options.onProgress);
    }

    /**
     * @description 在指定页面填写表单并可选提交
     * @param {string} url - 表单页面 URL
     * @param {Object} formData - 表单数据，键为 CSS 选择器，值为填写内容
     * @param {Object} [options={}] - 填写选项
     * @param {boolean} [options.submit=false] - 是否自动提交表单
     * @param {string} [options.submitSelector] - 提交按钮选择器
     * @param {Function} [options.onProgress] - 进度回调
     * @returns {Promise<Object>} 填写结果
     */
    async fillForm(url, formData, options = {}) {
        const actions = [
            { type: 'wait', selector: 'body', timeout: 10000 },
            ...Object.entries(formData).map(([selector, value]) => ({ type: 'fill', selector, value })),
            ...(options.submit ? [{ type: 'click', selector: options.submitSelector || 'button[type="submit"]' }] : [])
        ];
        return this.execute({ url, actions }, options.onProgress);
    }

    /**
     * @description 对指定页面进行截图
     * @param {string} url - 目标页面 URL
     * @param {Object} [options={}] - 截图选项
     * @param {string} [options.waitFor='body'] - 等待元素选择器
     * @param {boolean} [options.fullPage=true] - 是否全页截图
     * @param {Function} [options.onProgress] - 进度回调
     * @returns {Promise<string>} Base64 编码的截图数据
     */
    async screenshot(url, options = {}) {
        const result = await this.execute({
            url,
            actions: [
                { type: 'wait', selector: options.waitFor || 'body', timeout: 10000 },
                { type: 'screenshot', fullPage: options.fullPage !== false }
            ]
        }, options.onProgress);
        return result.results.find(r => r.type === 'screenshot')?.data;
    }

    /**
     * @description 中断正在执行的浏览器任务，设置中断标志并清理资源
     * @returns {Promise<void>}
     */
    async abort() {
        logger.info('[BrowserService] 收到中断信号');
        this.isRunning = false;
        await this.launcher.cleanup(this);
    }

    /**
     * @description 从执行结果中汇总提取内容，截断超长文本
     * @param {Array<Object>} results - 动作执行结果数组
     * @returns {Promise<{content: string, types: Array<string>}>} 汇总结果
     */
    async _generateSummary(results) {
        const extracts = results
            .filter(r => r.type === 'extract' && r.data)
            .map(r => r.data);

        return {
            // 截断超长内容，防止返回数据过大
            content: extracts.join('\n\n').substring(0, SUMMARY_MAX_LENGTH),
            types: results.map(r => r.type)
        };
    }
}

const instance = new BrowserService();
module.exports = instance;
module.exports.BrowserService = BrowserService;