/**
 * @file context_monitor.js
 * @description Windows 场景感知模块，极轻量后台脚本，采集前台窗口标题和键鼠活跃度，
 *              CPU 占用 <0.1%，每分钟轮询，为上下文引擎提供场景数据
 * @module services/context_monitor
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================
// 常量定义：场景感知轮询和分类阈值
// ============================================================

/** 场景轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 60 * 1000;

/** 历史记录最大保留条数 */
const MAX_HISTORY_SIZE = 50;

/** 用户离开判定阈值（秒）- 超过5分钟无操作视为离开 */
const AWAY_THRESHOLD_SECONDS = 300;

/** 用户空闲判定阈值（秒）- 超过2分钟无操作视为空闲 */
const IDLE_THRESHOLD_SECONDS = 120;

/** 用户暂时离开判定阈值（秒）- 超过30秒无操作视为暂时离开 */
const BRIEF_AWAY_THRESHOLD_SECONDS = 30;

/** 深夜时段起始小时（23点） */
const NIGHT_START_HOUR = 23;

/** 深夜时段结束小时（6点） */
const NIGHT_END_HOUR = 6;

/** 静默阈值（毫秒）- 超过3分钟无输入视为静默 */
const SILENCE_THRESHOLD_MS = 3 * 60 * 1000;

/** PowerShell 脚本执行超时时间（毫秒） */
const POWERSHELL_TIMEOUT_MS = 5000;

/** 窗口标题最大长度 */
const WINDOW_TITLE_MAX_LENGTH = 256;

// ============================================================
// 模块：场景感知监控器
// 功能说明：采集前台窗口和用户活跃度，分类当前场景状态
// ============================================================

class ContextMonitor {
    constructor() {
        this.running = false;
        this.currentContext = null;
        this.lastContext = null;
        this.history = [];
        this.pollInterval = POLL_INTERVAL_MS;
        this.timer = null;
        this.isNight = false;
        this.isWorking = false;
        this.silenceThreshold = SILENCE_THRESHOLD_MS;
        this.lastInputTime = Date.now();

        // 编程/工作相关应用模式
        this.workingPatterns = [
            /vscode|visual studio|idea|pycharm|webstorm|intellij/i,
            /code.exe|devenv.exe|code.exe|notepad\+\+|sublime/i,
            /git|terminal|powershell|cmd|command/i,
            /excel|word|outlook|onenote/i,
        ];

        // 浏览/娱乐相关应用模式
        this.browsingPatterns = [
            /chrome|firefox|edge|browser|safari/i,
            /bilibili|youtube|douyin|tiktok/i,
            /weibo|zhihu|reddit|twitter|instagram/i,
        ];

        // 聊天/通讯相关应用模式
        this.chatPatterns = [
            /wechat|qq|telegram|discord|slack|teams|飞书|钉钉|企业微信/i,
            /微信|QQ|钉钉/i,
        ];

        // 游戏相关应用模式
        this.gamingPatterns = [
            /steam|epic|blizzard|origin|riot/i,
            /game|游戏|lol|dota|pubg|apex|minecraft/i,
        ];

        // 需要忽略的窗口模式（系统界面等）
        this.ignorePatterns = [
            /start menu|taskbar|windows shell/i,
            /^$/,
        ];

        this.nightStart = NIGHT_START_HOUR;
        this.nightEnd = NIGHT_END_HOUR;
    }

    /**
     * @description 启动场景感知轮询
     * @returns {void}
     */
    start() {
        if (this.running) return;
        this.running = true;
        console.log('[场景感知] 已启动（每分钟轮询）');
        this._poll();
        this.timer = setInterval(() => this._poll(), this.pollInterval);
    }

    /**
     * @description 停止场景感知轮询
     * @returns {void}
     */
    stop() {
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log('[场景感知] 已停止');
    }

    /**
     * @description 执行一次场景数据采集并更新历史
     * @returns {Promise<void>}
     * @private
     */
    async _poll() {
        try {
            const context = await this._collect();
            this.lastContext = this.currentContext;
            this.currentContext = context;
            this.history.push({ ...context, timestamp: Date.now() });
            // 保留最近的历史记录，防止内存无限增长
            if (this.history.length > MAX_HISTORY_SIZE) this.history.shift();
        } catch (e) {
            console.error('[场景感知] 采集失败:', e.message);
        }
    }

    /**
     * @description 采集当前场景数据（前台窗口+空闲时间+状态分类）
     * @returns {Promise<Object>} 场景数据对象，包含 app/status/idleSeconds/isNight/isWorking/timestamp
     * @private
     */
    async _collect() {
        const [app, idleSeconds] = await Promise.all([
            this._getActiveWindow(),
            this._getIdleSeconds()
        ]);

        const status = this._classify(app, idleSeconds);
        this.lastInputTime = Date.now() - idleSeconds * 1000;
        const hour = new Date().getHours();
        this.isNight = hour >= this.nightStart || hour < this.nightEnd;
        this.isWorking = ['coding', 'working'].includes(status);

        return {
            app: app,
            status: status,
            idleSeconds: idleSeconds,
            isNight: this.isNight,
            isWorking: this.isWorking,
            timestamp: Date.now()
        };
    }

    /**
     * @description 获取当前前台窗口标题（仅 Windows 平台）
     * @returns {Promise<string>} 窗口标题文本，获取失败时返回 'Unknown'
     * @private
     */
    _getActiveWindow() {
        return new Promise((resolve) => {
            if (process.platform === 'win32') {
                const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ActiveWindowHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
}
"@
$handle = [ActiveWindowHelper]::GetForegroundWindow()
$title = New-Object System.Text.StringBuilder ${WINDOW_TITLE_MAX_LENGTH}
[ActiveWindowHelper]::GetWindowText($handle, $title, ${WINDOW_TITLE_MAX_LENGTH}) | Out-Null
Write-Output $title.ToString()
                `;
                exec(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, { timeout: POWERSHELL_TIMEOUT_MS }, (err, stdout) => {
                    if (err || !stdout.trim()) resolve('Unknown');
                    else resolve(stdout.trim());
                });
            } else {
                resolve('Unknown');
            }
        });
    }

    /**
     * @description 获取用户空闲时间（秒），通过 Windows API 查询最后一次输入时间
     * @returns {Promise<number>} 空闲秒数，获取失败时返回 0
     * @private
     */
    _getIdleSeconds() {
        return new Promise((resolve) => {
            if (process.platform === 'win32') {
                const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class IdleHelper {
    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }
}
"@
$info = New-Object IdleHelper+LASTINPUTINFO
$info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
[IdleHelper]::GetLastInputInfo([ref]$info) | Out-Null
$lastInput = [Environment]::TickCount - $info.dwTime
Write-Output ([math]::Round($lastInput / 1000))
                `;
                exec(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, { timeout: POWERSHELL_TIMEOUT_MS }, (err, stdout) => {
                    if (err) resolve(0);
                    else resolve(parseInt(stdout.trim()) || 0);
                });
            } else {
                resolve(0);
            }
        });
    }

    /**
     * @description 根据应用名称和空闲时间分类当前场景状态
     * @param {string} app - 前台窗口标题
     * @param {number} idleSeconds - 用户空闲秒数
     * @returns {string} 场景状态：away/idle/coding/browsing/chatting/gaming/general
     */
    _classify(app, idleSeconds) {
        // 超过5分钟无操作视为离开
        if (idleSeconds > AWAY_THRESHOLD_SECONDS) return 'away';

        // 忽略系统界面等无关窗口
        for (const pattern of this.ignorePatterns) {
            if (pattern.test(app)) return 'idle';
        }

        // 超过2分钟无操作视为空闲
        if (idleSeconds > IDLE_THRESHOLD_SECONDS) return 'idle';
        // 超过30秒无操作视为暂时离开
        if (idleSeconds > BRIEF_AWAY_THRESHOLD_SECONDS) return 'away';

        // 按应用类型分类场景
        if (this.workingPatterns.some(p => p.test(app))) return 'coding';
        if (this.browsingPatterns.some(p => p.test(app))) return 'browsing';
        if (this.chatPatterns.some(p => p.test(app))) return 'chatting';
        if (this.gamingPatterns.some(p => p.test(app))) return 'gaming';

        return 'general';
    }

    /**
     * @description 获取当前场景上下文数据
     * @returns {Object|null} 当前场景数据，未启动时返回 null
     */
    getContext() {
        return this.currentContext;
    }

    /**
     * @description 生成用于 LLM 系统提示词的场景描述文本
     * @returns {string} 场景描述文本，未启动时返回空字符串
     */
    getSystemPrompt() {
        if (!this.currentContext) return '';

        const ctx = this.currentContext;
        const parts = [];

        parts.push(`【当前场景】${this._statusToChinese(ctx.status)}，正在使用 ${ctx.app}`);

        // 深夜时段提醒
        if (ctx.isNight) {
            parts.push('（深夜时段）');
        }

        // 空闲时间提示
        if (ctx.idleSeconds > IDLE_THRESHOLD_SECONDS) {
            parts.push(`用户已经 ${Math.floor(ctx.idleSeconds / 60)} 分钟没有操作`);
        } else if (ctx.idleSeconds > BRIEF_AWAY_THRESHOLD_SECONDS) {
            parts.push('用户暂时离开');
        }

        return parts.join(' ');
    }

    /**
     * @description 将场景状态英文标识转换为中文描述
     * @param {string} status - 场景状态英文标识
     * @returns {string} 中文场景描述
     */
    _statusToChinese(status) {
        const map = {
            'coding': '正在写代码',
            'working': '正在工作',
            'browsing': '正在浏览网页',
            'chatting': '正在聊天',
            'gaming': '正在打游戏',
            'away': '暂时离开',
            'idle': '空闲',
            'general': '在使用电脑'
        };
        return map[status] || status;
    }

    /**
     * @description 判断用户当前是否处于工作状态
     * @returns {boolean} 是否正在工作
     */
    isWorking() {
        return this.isWorking;
    }

    /**
     * @description 判断当前是否为深夜时段
     * @returns {boolean} 是否深夜
     */
    isNight() {
        return this.isNight;
    }
}

module.exports = ContextMonitor;
