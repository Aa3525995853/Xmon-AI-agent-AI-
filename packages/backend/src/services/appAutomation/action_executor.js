/**
 * @file action_executor.js
 * @description 应用动作执行器 - 网易云音乐直接播放版，
 *              使用 orpheus://base64_json 协议实现无弹窗/无窗口激活的播放控制，
 *              同时提供通用键盘/窗口操作动作
 * @module services/appAutomation
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { logger } = require('../../utils/logger');

const { Buffer } = require('buffer');

// ============================================================
// 常量定义：云音乐进程与 API 配置
// ============================================================

/** 网易云音乐进程名称，用于检测运行状态 */
const CLOUDMUSIC_PROC = 'cloudmusic';

/** 网易云音乐默认安装路径 */
const CLOUDMUSIC_EXE = 'C:\\Program Files\\NetEase\\CloudMusic\\cloudmusic.exe';

/** 网易云音乐搜索 API 端点 */
const SEARCH_API = 'http://music.163.com/api/search/get';

/** 搜索 API 请求头，模拟浏览器访问 */
const SEARCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'http://music.163.com/'
};

/** 默认搜索超时时间（毫秒） */
const SEARCH_TIMEOUT = 5000;

/** 应用启动最大等待次数（每次 200ms） */
const APP_WAIT_MAX_COUNT = 30;

/** 应用启动等待间隔（毫秒） */
const APP_WAIT_INTERVAL = 200;

/** 应用已运行时的额外等待时间（毫秒） */
const APP_RUNNING_DELAY = 300;

/** 应用冷启动时的额外等待时间（毫秒） */
const APP_COLD_START_DELAY = 1500;

/** 默认 PowerShell 脚本执行超时（毫秒） */
const DEFAULT_PS_TIMEOUT = 30000;

/** 简单操作（按键/音量）的执行超时（毫秒） */
const SIMPLE_ACTION_TIMEOUT = 10000;

/**
 * @description 构造 orpheus 协议 URL，网易云音乐通过此协议直接播放资源
 * @param {string} type - 资源类型（song/playlist/album/radio）
 * @param {string|number} id - 资源 ID
 * @param {string} [cmd='play'] - 命令（play/search）
 * @returns {string} orpheus:// 协议 URL
 */
function buildOrpheusUrl(type, id, cmd = 'play') {
    // 将 JSON payload 编码为 Base64 拼接到 orpheus:// 协议头后
    const payload = JSON.stringify({ type, id: String(id), cmd });
    return 'orpheus://' + Buffer.from(payload).toString('base64');
}

/**
 * @description 生成确保云音乐运行的 PowerShell 脚本片段，
 *              未运行时最小化启动，已运行时最小化窗口
 * @returns {string} PowerShell 脚本片段
 */
function ensureCloudMusicScript() {
    return `
$wasRunning = $null -ne (Get-Process -Name '${CLOUDMUSIC_PROC}' -ErrorAction SilentlyContinue)
if (-not $wasRunning) {
    Start-Process '${CLOUDMUSIC_EXE}' -WindowStyle Minimized
    $waitCount = 0
    while ($waitCount -lt 30) {
        Start-Sleep -Milliseconds 200
        if (Get-Process -Name '${CLOUDMUSIC_PROC}' -ErrorAction SilentlyContinue) { break }
        $waitCount++
    }
    if ($waitCount -ge 30) { Write-Output 'APP_NOT_FOUND'; exit 0 }
} else {
    $proc = Get-Process -Name '${CLOUDMUSIC_PROC}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($proc) { [WinAPI]::ShowWindow($proc.MainWindowHandle, 6) | Out-Null }
}
`;
}

// ============================================================
// ActionExecutor 类：动作执行核心逻辑
// ============================================================

class ActionExecutor {
    constructor() {
        /** @type {Object|null} Win32 助手实例，用于加载 DLL */
        this.win32Helper = null;
    }

    /**
     * @description 设置 Win32 助手实例
     * @param {Object} helper - Win32Helper 实例
     */
    setWin32Helper(helper) {
        this.win32Helper = helper;
    }

    /**
     * @description 执行 PowerShell 脚本，自动处理参数传递、BOM 编码和临时文件清理
     * @param {string} script - PowerShell 脚本内容
     * @param {Object} [params={}] - 传递给脚本的参数键值对，通过临时 JSON 文件传入
     * @param {number} [timeout=30000] - 执行超时时间（毫秒）
     * @returns {Promise<{ok: boolean, stdout: string, stderr: string}>} 执行结果
     */
    runPS(script, params = {}, timeout = DEFAULT_PS_TIMEOUT) {
        return new Promise((resolve) => {
            const id = Date.now();
            const tmpPs = path.join(os.tmpdir(), `auto_${id}.ps1`);
            const tmpParams = path.join(os.tmpdir(), `auto_${id}_params.json`);

            if (Object.keys(params).length > 0) {
                fs.writeFileSync(tmpParams, JSON.stringify(params), 'utf8');
            }

            const paramBlock = Object.keys(params).length > 0
                ? `$params = Get-Content -Path '${tmpParams}' -Encoding UTF8 | ConvertFrom-Json`
                : '';

            const win32Loader = this.win32Helper?.getLoader() || '';

            const fullScript = `$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
${paramBlock}
${win32Loader}
${script}`;

            // 添加 BOM 头确保 PowerShell 正确识别 UTF-8 编码
            fs.writeFileSync(tmpPs, '﻿' + fullScript, 'utf8');

            exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`, { timeout }, (err, stdout, stderr) => {
                try { fs.unlinkSync(tmpPs); } catch (e) {}
                try { if (Object.keys(params).length > 0) fs.unlinkSync(tmpParams); } catch (e) {}
                resolve({ ok: !err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
            });
        });
    }

    /**
     * @description 通过网易云 API 搜索歌曲，返回第一个匹配结果
     * @param {string} keyword - 搜索关键词
     * @returns {Promise<{id: string, name: string, artist: string}|null>} 歌曲信息，未找到返回 null
     */
    async searchSong(keyword) {
        if (process.env.NODE_ENV === 'test') {
            return { id: 'test-song-id', name: keyword || 'test song', artist: 'test artist' };
        }

        try {
            const resp = await axios.get(SEARCH_API, {
                params: { s: keyword, type: 1, offset: 0, limit: 3 },
                headers: SEARCH_HEADERS,
                timeout: SEARCH_TIMEOUT,
                proxy: false
            });
            const songs = resp.data?.result?.songs;
            if (songs && songs.length > 0) {
                return { id: songs[0].id, name: songs[0].name, artist: songs[0].artists?.[0]?.name || '' };
            }
            return null;
        } catch (e) {
            logger.error('[ActionExecutor] 网易云搜索失败:', e.message);
            return null;
        }
    }

    /**
     * @description 通过网易云 API 搜索歌单，返回匹配列表
     * @param {string} keyword - 搜索关键词
     * @returns {Promise<Array<{id: string, name: string, creator: string}>|null>} 歌单列表，未找到返回 null
     */
    async searchPlaylist(keyword) {
        if (process.env.NODE_ENV === 'test') {
            return [{ id: 'test-playlist-id', name: keyword || 'test playlist', creator: 'test creator' }];
        }

        try {
            const resp = await axios.get(SEARCH_API, {
                params: { s: keyword, type: 1000, offset: 0, limit: 5 },
                headers: SEARCH_HEADERS,
                timeout: SEARCH_TIMEOUT,
                proxy: false
            });
            const playlists = resp.data?.result?.playlists;
            if (playlists && playlists.length > 0) {
                return playlists.map(p => ({ id: p.id, name: p.name, creator: p.creator?.nickname || '' }));
            }
            return null;
        } catch (e) {
            logger.error('[ASR] 歌单搜索失败:', e.message);
            return null;
        }
    }
}

// ============================================================
// 云音乐动作定义：播放控制、音量调节、自动播放等
// ============================================================

ActionExecutor.CLOUDMUSIC_ACTIONS = {
    /**
     * 播放歌曲 - 核心改进：API搜索 + orpheus协议直接播放
     */
    play_song: async (params, executor) => {
        const song = params.song || '';
        if (!song) return { success: false, message: '请告诉我你想听什么歌~' };

        logger.info('[云音乐] 搜索歌曲:', song);
        const songInfo = await executor.searchSong(song);
        if (!songInfo) {
            return { success: false, message: `找不到"${song}"这首歌呢，换一首试试？🎵` };
        }

        // 构造 orpheus 协议 URL（无需弹窗）
        const orpheusUrl = buildOrpheusUrl('song', songInfo.id, 'play');
        logger.info('[云音乐] 播放协议:', orpheusUrl);

        // 确保云音乐在运行（最小化窗口）
        const ps = `${ensureCloudMusicScript()}
Start-Sleep -Milliseconds $(if ($wasRunning) { 300 } else { 1500 })
Start-Process "${orpheusUrl}"
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 30000);
        if (r.stdout.includes('APP_NOT_FOUND')) {
            return { success: false, message: '找不到网易云音乐，可能没有安装~' };
        }
        if (r.stdout.includes('OK')) {
            return { success: true, message: `正在播放《${songInfo.name}》- ${songInfo.artist}~ 🎵` };
        }
        return { success: false, message: `播放"${song}"时出了点问题~` };
    },

    /**
     * 播放歌单 - 新增功能
     */
    play_playlist: async (params, executor) => {
        const playlist = params.playlist || params.name || '';
        if (!playlist) return { success: false, message: '请告诉我你想听什么歌单~' };

        logger.info('[云音乐] 搜索歌单:', playlist);
        const lists = await executor.searchPlaylist(playlist);
        if (!lists || lists.length === 0) {
            return { success: false, message: `找不到"${playlist}"这个歌单呢~ 🎵` };
        }

        const top = lists[0];
        logger.info('[云音乐] 播放歌单:', top.id, top.name);

        const orpheusUrl = buildOrpheusUrl('playlist', top.id, 'play');
        logger.info('[云音乐] 歌单协议:', orpheusUrl);

        const ps = `${ensureCloudMusicScript()}
Start-Sleep -Milliseconds $(if ($wasRunning) { 300 } else { 1500 })
Start-Process "${orpheusUrl}"
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 30000);
        if (r.stdout.includes('APP_NOT_FOUND')) {
            return { success: false, message: '找不到网易云音乐，可能没有安装~' };
        }
        if (r.stdout.includes('OK')) {
            return { success: true, message: `正在播放歌单《${top.name}》~ 🎶` };
        }
        return { success: false, message: '播放歌单时出了问题~' };
    },

    /**
     * 暂停/继续 - 使用 WScript.Shell 媒体键，无需窗口激活
     */
    pause: async (params, executor) => {
        const ps = `$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys('{MEDIA_PLAY_PAUSE}')
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 10000);
        if (r.stdout.includes('OK')) return { success: true, message: '已暂停/继续播放~' };
        return { success: false, message: '操作失败了~' };
    },

    /**
     * 下一首 - 使用 WScript.Shell 媒体键
     */
    next_song: async (params, executor) => {
        const ps = `$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys('{MEDIA_NEXT_TRACK}')
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 10000);
        if (r.stdout.includes('OK')) return { success: true, message: '已切换到下一首~ ⏭' };
        return { success: false, message: '切换失败了~' };
    },

    /**
     * 上一首 - 使用 WScript.Shell 媒体键
     */
    prev_song: async (params, executor) => {
        const ps = `$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys('{MEDIA_PREV_TRACK}')
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 10000);
        if (r.stdout.includes('OK')) return { success: true, message: '已切换到上一首~ ⏮' };
        return { success: false, message: '切换失败了~' };
    },

    /**
     * 音量+ - 使用 WScript.Shell 媒体键
     */
    volume_up: async (params, executor) => {
        const ps = `1..3 | ForEach-Object { $wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('{VOLUME_UP}'); Start-Sleep -Milliseconds 100 }
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 10000);
        if (r.stdout.includes('OK')) return { success: true, message: '音量已调大~ 🔊' };
        return { success: false, message: '调音失败了~' };
    },

    /**
     * 音量- - 使用 WScript.Shell 媒体键
     */
    volume_down: async (params, executor) => {
        const ps = `1..3 | ForEach-Object { $wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('{VOLUME_DOWN}'); Start-Sleep -Milliseconds 100 }
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 10000);
        if (r.stdout.includes('OK')) return { success: true, message: '音量已调小~ 🔉' };
        return { success: false, message: '调音失败了~' };
    },

    /**
     * 自动播放 - 冷启动时搜索默认歌单并直接播放
     */
    auto_play: async (params, executor) => {
        // 先搜索一个默认歌单
        logger.info('[云音乐] 自动播放：搜索默认歌单...');
        const lists = await executor.searchPlaylist('华语热歌');
        if (!lists || lists.length === 0) {
            // 备用：搜索歌曲
            const songInfo = await executor.searchSong('周杰伦 晴天');
            if (!songInfo) {
                return { success: false, message: '找不到可播放的音乐呢~ 🎵' };
            }
            const orpheusUrl = buildOrpheusUrl('song', songInfo.id, 'play');
            const ps = `${ensureCloudMusicScript()}
Start-Sleep -Milliseconds $(if ($wasRunning) { 300 } else { 1500 })
Start-Process "${orpheusUrl}"
Write-Output 'OK'`;
            const r = await executor.runPS(ps, {}, 30000);
            if (r.stdout.includes('APP_NOT_FOUND')) return { success: false, message: '找不到网易云音乐~' };
            return { success: true, message: `正在播放《${songInfo.name}》~ 🎵` };
        }

        const top = lists[0];
        logger.info('[云音乐] 自动播放歌单:', top.id, top.name);

        const orpheusUrl = buildOrpheusUrl('playlist', top.id, 'play');
        const ps = `${ensureCloudMusicScript()}
Start-Sleep -Milliseconds $(if ($wasRunning) { 300 } else { 1500 })
Start-Process "${orpheusUrl}"
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 30000);
        if (r.stdout.includes('APP_NOT_FOUND')) return { success: false, message: '找不到网易云音乐，可能没有安装~' };
        if (r.stdout.includes('OK')) return { success: true, message: `正在播放《${top.name}》~ 🎶` };
        return { success: false, message: '启动音乐时出了问题~' };
    },

    /**
     * 搜索并直接播放（通用入口）
     * 支持模糊匹配歌曲/歌单
     */
    play_music: async (params, executor) => {
        const keyword = params.keyword || params.song || params.playlist || params.name || '';
        if (!keyword) return { success: false, message: '请告诉我你想听什么~' };

        logger.info('[云音乐] 通用搜索:', keyword);

        // 先搜歌单（歌单通常播放效果更好）
        const lists = await executor.searchPlaylist(keyword);
        if (lists && lists.length > 0) {
            const top = lists[0];
            logger.info('[云音乐] 匹配歌单:', top.id, top.name);
            const orpheusUrl = buildOrpheusUrl('playlist', top.id, 'play');
            const ps = `${ensureCloudMusicScript()}
Start-Sleep -Milliseconds $(if ($wasRunning) { 300 } else { 1500 })
Start-Process "${orpheusUrl}"
Write-Output 'OK'`;
            const r = await executor.runPS(ps, {}, 30000);
            if (r.stdout.includes('APP_NOT_FOUND')) return { success: false, message: '找不到网易云音乐，可能没有安装~' };
            if (r.stdout.includes('OK')) return { success: true, message: `正在播放歌单《${top.name}》~ 🎶` };
        }

        // 备用：搜歌曲
        const songInfo = await executor.searchSong(keyword);
        if (songInfo) {
            logger.info('[云音乐] 匹配歌曲:', songInfo.id, songInfo.name);
            const orpheusUrl = buildOrpheusUrl('song', songInfo.id, 'play');
            const ps = `${ensureCloudMusicScript()}
Start-Sleep -Milliseconds $(if ($wasRunning) { 300 } else { 1500 })
Start-Process "${orpheusUrl}"
Write-Output 'OK'`;
            const r = await executor.runPS(ps, {}, 30000);
            if (r.stdout.includes('APP_NOT_FOUND')) return { success: false, message: '找不到网易云音乐，可能没有安装~' };
            if (r.stdout.includes('OK')) return { success: true, message: `正在播放《${songInfo.name}》- ${songInfo.artist}~ 🎵` };
        }

        return { success: false, message: `找不到"${keyword}"相关的音乐呢~ 🎵` };
    }
};

// ============================================================
// 通用动作定义：文字输入、按键模拟、窗口激活等
// ============================================================

ActionExecutor.GENERIC_ACTIONS = {
    type_text: async (params, executor) => {
        const text = params.text || '';
        if (!text) return { success: false, message: '请告诉我你要输入什么~' };

        const ps = `$wshell = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds 300
$wshell.SendKeys($params.text)
Write-Output 'OK'`;

        const r = await executor.runPS(ps, { text }, 10000);
        if (r.stdout.includes('OK')) return { success: true, message: '已输入文字~' };
        return { success: false, message: '输入失败了~' };
    },

    press_key: async (params, executor) => {
        const keyMap = {
            'enter': '{ENTER}', '回车': '{ENTER}',
            'esc': '{ESC}', '退出': '{ESC}',
            'tab': '{TAB}', 'space': ' ', '空格': ' ',
            'backspace': '{BS}', '退格': '{BS}',
            'delete': '{DELETE}', '删除': '{DELETE}',
            'up': '{UP}', '上': '{UP}',
            'down': '{DOWN}', '下': '{DOWN}',
            'left': '{LEFT}', '左': '{LEFT}',
            'right': '{RIGHT}', '右': '{RIGHT}',
        };

        let key = keyMap[(params.key || '').toLowerCase()] || params.key;
        if (!key) return { success: false, message: '请告诉我按什么键~' };

        const ps = `$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys('${key}')
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 10000);
        if (r.stdout.includes('OK')) return { success: true, message: '已按键~' };
        return { success: false, message: '按键失败了~' };
    },

    hotkey: async (params, executor) => {
        const keys = params.keys || '';
        if (!keys) return { success: false, message: '请告诉我快捷键组合~' };

        const ps = `$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys('${keys}')
Write-Output 'OK'`;

        const r = await executor.runPS(ps, {}, 10000);
        if (r.stdout.includes('OK')) return { success: true, message: '已执行快捷键~' };
        return { success: false, message: '快捷键执行失败了~' };
    },

    activate_window: async (params, executor) => {
        const appName = params.app_name || '';
        if (!appName) return { success: false, message: '请告诉我要激活哪个应用~' };

        const ps = `function Activate-App {
    param([string]$ProcName)
    $procs = Get-Process -Name $ProcName -ErrorAction SilentlyContinue
    if (-not $procs) { return $false }
    $proc = $procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($proc) {
        [WinAPI]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
        [WinAPI]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
        Start-Sleep -Milliseconds 300
        return $true
    }
    return $false
}
$activated = Activate-App '${appName}'
if ($activated) { Write-Output 'OK' } else { Write-Output 'NOT_FOUND' }`;

        const r = await executor.runPS(ps, {}, 10000);
        if (r.stdout.includes('OK')) return { success: true, message: `已激活${appName}窗口~` };
        return { success: false, message: `找不到${appName}窗口~` };
    }
};

/**
 * @description 动作执行入口，根据动作名称查找并执行对应的云音乐或通用动作
 * @param {string} actionName - 动作名称
 * @param {Object} params - 动作参数
 * @param {ActionExecutor} executor - ActionExecutor 实例
 * @returns {Promise<{success: boolean, message: string}>|{success: boolean, message: string}} 执行结果
 */
ActionExecutor.createScript = function(actionName, params, executor) {
    if (ActionExecutor.CLOUDMUSIC_ACTIONS[actionName]) {
        return ActionExecutor.CLOUDMUSIC_ACTIONS[actionName](params, executor);
    }
    if (ActionExecutor.GENERIC_ACTIONS[actionName]) {
        return ActionExecutor.GENERIC_ACTIONS[actionName](params, executor);
    }
    return { success: false, message: `不支持的操作: ${actionName}` };
};

module.exports = ActionExecutor;
