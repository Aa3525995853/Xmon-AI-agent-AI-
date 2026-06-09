/**
 * @file system_tools.js
 * @description 系统工具模块 - 窗口管理、音量控制、剪贴板操作、进程管理、系统快捷操作
 * @module services/system_control
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { exec } = require('child_process');
const os = require('os');

// ============================================================
// 常量定义：PowerShell命令超时时间
// ============================================================

/** 默认命令执行超时时间（毫秒） */
const DEFAULT_EXEC_TIMEOUT = 10000;

/** 窗口/音量/剪贴板操作超时时间（毫秒） */
const SHORT_EXEC_TIMEOUT = 5000;

/** 音量调节默认步长 */
const DEFAULT_VOLUME_STEP = 5;

/**
 * @description 转义PowerShell字符串参数中的单引号，防止命令注入
 * @param {string} str - 待转义的字符串
 * @returns {string} 转义后的安全字符串
 */
function escapePowerShellArg(str) {
    if (typeof str !== 'string') return "''";
    return "'" + str.replace(/'/g, "''");
}

class SystemTools {
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
        const path = require('path');
        const fs = require('fs');
        const home = os.homedir();
        const candidates = [
            path.join(home, 'OneDrive', 'Desktop'),
            path.join(home, 'Desktop'),
            home
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return home;
    }

    /**
     * @description 封装exec为Promise，统一使用PowerShell执行
     * @param {string} command - 要执行的命令
     * @param {number} [timeout=10000] - 超时时间（毫秒）
     * @returns {Promise<string>} 命令标准输出
     * @throws {Error} 命令执行失败时抛出错误
     * @private
     */
    _execPromise(command, timeout = DEFAULT_EXEC_TIMEOUT) {
        return new Promise((resolve, reject) => {
            exec(command, { timeout, shell: 'powershell.exe' }, (err, stdout, stderr) => {
                if (err) reject(new Error(stderr || err.message));
                else resolve(stdout);
            });
        });
    }

    /**
     * @description 截取屏幕截图，保存到用户Pictures/Screenshots目录
     * @returns {Promise<{success: boolean, message: string, path?: string}>} 截图结果
     */
    async takeScreenshot() {
        const path = require('path');
        const fs = require('fs');
        const timestamp = Date.now();
        const screenshotDir = path.join(os.homedir(), 'Pictures', 'Screenshots');

        // 确保目录存在
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        const outputPath = path.join(screenshotDir, `screenshot_${timestamp}.png`);

        const script = `
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing
            $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            $screenshot = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
            $graphics = [System.Drawing.Graphics]::FromImage($screenshot)
            $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
            $screenshot.Save('${outputPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
            $graphics.Dispose()
            $screenshot.Dispose()
        `;

        return new Promise((resolve) => {
            exec(`powershell -Command "${script.replace(/"/g, '\\"')}"`, { timeout: 10000 }, (err) => {
                if (err) {
                    resolve({ success: false, message: `截图失败: ${err.message}` });
                } else {
                    resolve({ success: true, message: '截图已保存', path: outputPath });
                }
            });
        });
    }

    /**
     * @description 管理窗口操作（最小化、最大化、关闭、还原）
     * @param {string} action - 操作类型：minimize/maximize/close/restore
     * @param {string} [title=''] - 窗口标题关键字
     * @returns {Promise<{success: boolean, message: string}>} 操作结果
     */
    async manageWindow(action, title) {
        const actions = {
            minimize: (t) => `(Get-Process | Where-Object { $_.MainWindowTitle -like '*${t}*' })[0] | % { $_.WindowState = 'Minimized' }`,
            maximize: (t) => `(Get-Process | Where-Object { $_.MainWindowTitle -like '*${t}*' })[0] | % { $_.WindowState = 'Maximized' }`,
            close: (t) => `Get-Process | Where-Object { $_.MainWindowTitle -like '*${t}*' } | Stop-Process -Force`,
            restore: (t) => `(Get-Process | Where-Object { $_.MainWindowTitle -like '*${t}*' })[0] | % { $_.WindowState = 'Normal' }`
        };

        if (!actions[action]) {
            return { success: false, message: `未知操作: ${action}` };
        }

        const script = actions[action](title || '');

        return new Promise((resolve) => {
            exec(`powershell -Command "${script}"`, { timeout: 5000 }, (err) => {
                resolve({ success: !err, message: err ? err.message : `窗口${action}成功` });
            });
        });
    }

    /**
     * @description 控制系统音量，使用键盘模拟方式（比API方式更可靠）
     * @param {string} action - 操作类型：up/down/mute/unmute
     * @param {number} [step=5] - 音量调节步长
     * @returns {Promise<{success: boolean, message: string}>} 操作结果
     */
    async controlVolume(action, step = DEFAULT_VOLUME_STEP) {
        const scripts = {
            up: `[System.Audio]::Volume = [Math]::Min(100, [System.Audio]::Volume + ${step})`,
            down: `[System.Audio]::Volume = [Math]::Max(0, [System.Audio]::Volume - ${step})`,
            mute: `Set-AudioDevice -PlaybackMute $true`,
            unmute: `Set-AudioDevice -PlaybackMute $false`
        };

        if (!scripts[action]) {
            return { success: false, message: `未知操作: ${action}` };
        }

        return new Promise((resolve) => {
            // 使用快捷键方式控制音量（更可靠）
            let cmd;
            if (action === 'up') {
                for (let i = 0; i < step; i++) {
                    cmd = `${cmd};(New-Object -ComObject WScript.Shell).SendKeys([char]175)`;
                }
                cmd = cmd.substring(1);
            } else if (action === 'down') {
                for (let i = 0; i < step; i++) {
                    cmd = `${cmd};(New-Object -ComObject WScript.Shell).SendKeys([char]174)`;
                }
                cmd = cmd.substring(1);
            } else if (action === 'mute') {
                cmd = `(New-Object -ComObject WScript.Shell).SendKeys([char]173)`;
            }

            exec(`powershell -Command "${cmd}"`, { timeout: SHORT_EXEC_TIMEOUT }, (err) => {
                resolve({ success: !err, message: err ? err.message : `音量${action}` });
            });
        });
    }

    /**
     * @description 剪贴板操作（复制、粘贴、清空）
     * @param {string} action - 操作类型：copy/paste/clear
     * @param {string} [content] - 复制操作时的内容
     * @returns {Promise<{success: boolean, message: string, content?: string}>} 操作结果
     */
    async clipboardOperation(action, content) {
        if (action === 'copy' && !content) {
            return { success: false, message: '未指定复制内容' };
        }

        return new Promise((resolve) => {
            if (action === 'copy') {
                // 使用 PowerShell 设置剪贴板
                const script = `Set-Clipboard -Value '${escapePowerShellArg(content)}'`;
                exec(`powershell -Command "${script}"`, { timeout: SHORT_EXEC_TIMEOUT }, (err) => {
                    resolve({ success: !err, message: err ? err.message : '已复制到剪贴板' });
                });
            } else if (action === 'paste') {
                const script = `Get-Clipboard`;
                exec(`powershell -Command "${script}"`, { timeout: SHORT_EXEC_TIMEOUT }, (err, stdout) => {
                    resolve({ success: !err, message: stdout.trim(), content: stdout.trim() });
                });
            } else if (action === 'clear') {
                const script = `Set-Clipboard -Value ''`;
                exec(`powershell -Command "${script}"`, { timeout: SHORT_EXEC_TIMEOUT }, (err) => {
                    resolve({ success: !err, message: err ? err.message : '剪贴板已清空' });
                });
            } else {
                resolve({ success: false, message: `未知操作: ${action}` });
            }
        });
    }

    /**
     * @description 进程管理（终止进程、查看进程列表）
     * @param {string} action - 操作类型：kill/list
     * @param {string} [name] - 进程名称
     * @returns {Promise<{success: boolean, message?: string, processes?: Array}>} 操作结果
     */
    async manageProcess(action, name) {
        if (!name) return { success: false, message: '未指定进程名称' };

        return new Promise((resolve) => {
            if (action === 'kill') {
                exec(`taskkill /F /IM "${name}.exe"`, { timeout: SHORT_EXEC_TIMEOUT }, (err) => {
                    resolve({ success: !err, message: err ? err.message : `已终止进程: ${name}` });
                });
            } else if (action === 'list') {
                exec(`Get-Process -Name "*${name}*" | Select-Object Name, Id, CPU, WorkingSet | ConvertTo-Json`, { timeout: SHORT_EXEC_TIMEOUT }, (err, stdout) => {
                    if (err) {
                        resolve({ success: false, message: err.message });
                    } else {
                        try {
                            const procs = JSON.parse(stdout);
                            resolve({ success: true, processes: Array.isArray(procs) ? procs : [procs] });
                        } catch (e) {
                            resolve({ success: true, processes: [] });
                        }
                    }
                });
            } else {
                resolve({ success: false, message: `未知操作: ${action}` });
            }
        });
    }

    /**
     * @description 执行系统快捷操作（锁屏、关机、重启、睡眠、休眠、注销）
     * @param {string} action - 操作类型：lock/shutdown/restart/sleep/hibernate/signout
     * @returns {Promise<{success: boolean, message: string}>} 操作结果
     */
    async systemShortcut(action) {
        const actions = {
            lock: 'rundll32.exe user32.dll,LockWorkStation',
            shutdown: 'shutdown /s /t 60',
            restart: 'shutdown /r /t 60',
            sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
            hibernate: 'rundll32.exe powrprof.dll,SetSuspendState Hibernate',
            signout: 'shutdown /l'
        };

        if (!actions[action]) {
            return { success: false, message: `未知操作: ${action}` };
        }

        return new Promise((resolve) => {
            exec(actions[action], { timeout: SHORT_EXEC_TIMEOUT }, (err) => {
                resolve({ success: !err, message: err ? err.message : `系统操作已执行: ${action}` });
            });
        });
    }

    /**
     * @description 获取系统信息（平台、架构、CPU核心数、内存、运行时间等）
     * @returns {Promise<{success: boolean, platform: string, arch: string, cpus: number, totalMemory: number, freeMemory: number, uptime: number, hostname: string}>} 系统信息
     */
    async getSystemInfo() {
        const osInfo = {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100,
            freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100,
            uptime: Math.round(os.uptime() / 3600 * 100) / 100,
            hostname: os.hostname()
        };

        return { success: true, ...osInfo };
    }
}

module.exports = new SystemTools();