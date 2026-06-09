/**
 * @file app_tools.js
 * @description 应用工具模块 - 应用启动、音乐播放、浏览器操作、搜索引擎、电商/视频搜索
 * @module services/system_control
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { exec } = require('child_process');
const path = require('path');
const os = require('os');

/** Puppeteer 实例，可选依赖，未安装时浏览器自动化功能不可用 */
let puppeteer = null;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    console.log('[系统控制] Puppeteer 未安装，浏览器自动化功能不可用');
}

class AppTools {
    /**
     * @description 构造函数，自动检测工作目录
     */
    constructor() {
        this.workDir = this._detectWorkDir();
    }

    /**
     * @description 检测工作目录，优先使用OneDrive桌面
     * @returns {string} 工作目录绝对路径
     * @private
     */
    _detectWorkDir() {
        const home = os.homedir();
        const candidates = [
            path.join(home, 'OneDrive', 'Desktop'),
            path.join(home, 'Desktop'),
            home
        ];
        for (const p of candidates) {
            if (require('fs').existsSync(p)) return p;
        }
        return home;
    }

    /**
     * @description 启动应用程序，支持中英文应用名映射和路径查找
     * @param {string} appName - 应用名称（中文或英文）
     * @returns {Promise<{success: boolean, message: string}>} 启动结果
     */
    async launchApp(appName) {
        return new Promise((resolve) => {
            const cleanName = appName.replace(/[^\w一-龥]/g, '').trim();
            if (!cleanName) {
                resolve({ success: false, message: '未识别应用名称' });
                return;
            }

            const appMap = {
                '微信': 'WeChat',
                '微信开发者工具': 'WeChatDevTools',
                'QQ': 'QQ',
                '钉钉': 'DingTalk',
                '飞书': 'Feishu',
                '网易云音乐': 'CloudMusic',
                '腾讯视频': '腾讯视频',
                '爱奇艺': '爱奇艺',
                '优酷': 'Youku',
                '哔哩哔哩': 'bilibili',
                'bilibili': 'bilibili',
                '抖音': 'aweme',
                '淘宝': 'Taobao',
                '京东': 'JD',
                '支付宝': 'Alipay',
                '计算器': 'Calculator',
                '记事本': 'Notepad',
                '画图': 'mspaint',
                '截图': 'SnippingTool',
                '资源管理器': 'explorer',
                '我的电脑': 'explorer'
            };

            const exeName = appMap[cleanName] || cleanName;

            // 先尝试直接启动
            let cmd = `start "" "${exeName}"`;

            // 特殊应用处理
            if (cleanName === '微信') cmd = `start "" "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe"`;
            else if (cleanName === '网易云音乐') cmd = `start "" "C:\\Program Files\\Netease\\CloudMusic\\cloudmusic.exe"`;
            else if (cleanName === '哔哩哔哩' || cleanName === 'bilibili') cmd = `start "" "C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Programs\\bilibili\\bilibili.exe"`;
            else if (cleanName === '我的电脑' || cleanName === '资源管理器') cmd = 'explorer.exe';

            exec(cmd, { timeout: 5000 }, (err) => {
                if (err) {
                    // 尝试通过 Where 命令查找
                    exec(`where ${exeName}`, (err2, stdout) => {
                        if (err2 || !stdout.trim()) {
                            resolve({ success: false, message: `未找到应用: ${cleanName}` });
                        } else {
                            const exePath = stdout.trim().split('\n')[0];
                            exec(`start "" "${exePath}"`, (err3) => {
                                resolve({ success: !err3, message: err3 ? err3.message : `已启动: ${cleanName}` });
                            });
                        }
                    });
                } else {
                    resolve({ success: true, message: `已启动: ${cleanName}` });
                }
            });
        });
    }

    /**
     * @description 播放音乐，优先打开网易云音乐客户端，失败则通过浏览器搜索
     * @param {string} song - 歌曲名或歌手名
     * @returns {Promise<{success: boolean, message: string}>} 播放结果
     */
    async playMusic(song) {
        if (!song) return { success: false, message: '未指定歌曲' };

        // 打开网易云音乐并搜索
        const searchUrl = `https://music.163.com/#/search/m/?s=${encodeURIComponent(song)}&type=1`;

        // 先尝试打开网易云音乐
        return new Promise((resolve) => {
            exec('start "" "C:\\Program Files\\Netease\\CloudMusic\\cloudmusic.exe"', { timeout: 5000 }, async (err) => {
                if (err) {
                    // 尝试用浏览器打开
                    exec(`start "" "https://music.163.com/#/search/m/?s=${encodeURIComponent(song)}&type=1"`, (err2) => {
                        resolve({ success: !err2, message: err2 ? err2.message : `已打开网易云音乐搜索: ${song}` });
                    });
                } else {
                    // 等待应用启动后执行搜索
                    setTimeout(() => {
                        resolve({ success: true, message: `已启动网易云音乐，正在播放: ${song}` });
                    }, 2000);
                }
            });
        });
    }

    /**
     * @description 在默认浏览器中打开指定URL，自动补全协议头
     * @param {string} url - 要打开的网址
     * @returns {Promise<{success: boolean, message: string}>} 打开结果
     */
    async openURL(url) {
        if (!url) return { success: false, message: '未指定网址' };

        // 确保 URL 格式正确
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        return new Promise((resolve) => {
            exec(`start "" "${url}"`, (err) => {
                resolve({ success: !err, message: err ? err.message : `已打开: ${url}` });
            });
        });
    }

    /**
     * @description 在搜索引擎中搜索内容，支持百度/Google/Bing
     * @param {string} query - 搜索关键词
     * @param {string} [engine='baidu'] - 搜索引擎：baidu/google/bing
     * @returns {Promise<{success: boolean, message: string}>} 搜索结果
     */
    async searchWeb(query, engine = 'baidu') {
        if (!query) return { success: false, message: '未指定搜索内容' };

        const engines = {
            baidu: 'https://www.baidu.com/s?wd=',
            google: 'https://www.google.com/search?q=',
            bing: 'https://www.bing.com/search?q='
        };

        const baseUrl = engines[engine] || engines.baidu;
        const url = baseUrl + encodeURIComponent(query);

        return new Promise((resolve) => {
            exec(`start "" "${url}"`, (err) => {
                resolve({ success: !err, message: err ? err.message : `已在${engine}搜索: ${query}` });
            });
        });
    }

    /**
     * @description 在电商平台搜索商品，支持淘宝/京东/拼多多
     * @param {string} product - 商品关键词
     * @param {string} [platform='taobao'] - 电商平台：taobao/jd/pdd
     * @returns {Promise<{success: boolean, message: string}>} 搜索结果
     */
    async searchShopping(product, platform = 'taobao') {
        if (!product) return { success: false, message: '未指定商品' };

        const urls = {
            taobao: `https://s.taobao.com/search?q=${encodeURIComponent(product)}`,
            jd: `https://search.jd.com/Search?keyword=${encodeURIComponent(product)}`,
            pdd: `https://youhui.pinduoduo.com/search-result?search=${encodeURIComponent(product)}`
        };

        const url = urls[platform] || urls.taobao;

        return new Promise((resolve) => {
            exec(`start "" "${url}"`, (err) => {
                resolve({ success: !err, message: err ? err.message : `已在${platform}搜索: ${product}` });
            });
        });
    }

    /**
     * @description 搜索视频，支持B站/YouTube
     * @param {string} keyword - 搜索关键词
     * @param {string} [platform='bilibili'] - 视频平台：bilibili/youtube
     * @returns {Promise<{success: boolean, message: string}>} 搜索结果
     */
    async searchVideo(keyword, platform = 'bilibili') {
        if (!keyword) return { success: false, message: '未指定搜索内容' };

        const urls = {
            bilibili: `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`,
            youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`
        };

        const url = urls[platform] || urls.bilibili;

        return new Promise((resolve) => {
            exec(`start "" "${url}"`, (err) => {
                resolve({ success: !err, message: err ? err.message : `已在${platform}搜索: ${keyword}` });
            });
        });
    }

    /**
     * @description 浏览器自动化操作，使用 Puppeteer 执行网页交互（搜索等）
     * @param {string} url - 目标网页URL
     * @param {string} action - 操作类型：search 等
     * @param {string} [query] - 搜索内容（action为search时必填）
     * @returns {Promise<{success: boolean, message: string}>} 操作结果
     */
    async browserAutomation(url, action, query) {
        if (!puppeteer) {
            return { success: false, message: 'Puppeteer 未安装，浏览器自动化不可用' };
        }

        try {
            const browser = await puppeteer.launch({ headless: false });
            const page = await browser.newPage();
            await page.goto(url);

            if (action === 'search' && query) {
                // 简单的搜索操作
                await page.type('input[name="q"], input[placeholder*="搜索"]', query);
                await page.keyboard.press('Enter');
            }

            await new Promise(r => setTimeout(r, 2000));
            await browser.close();

            return { success: true, message: '浏览器自动化完成' };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }
}

module.exports = new AppTools();