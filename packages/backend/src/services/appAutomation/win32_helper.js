/**
 * @file win32_helper.js
 * @description Win32 API 助手 - 编译并加载 C# DLL，提供窗口操作（置顶/显示/枚举）和键盘模拟的
 *              Win32 API 调用能力，供 PowerShell 脚本通过 Add-Type 或 DLL 加载使用
 * @module services/appAutomation
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// 常量定义：DLL 路径与编译器配置
// ============================================================

/** 编译后的 DLL 输出路径，存放在系统临时目录 */
const DLL_PATH = path.join(os.tmpdir(), 'XiaoMeng_WinAPI.dll');

/** DLL 编译超时时间（毫秒） */
const COMPILE_TIMEOUT = 15000;

/** PowerShell Add-Type 编译超时时间（毫秒） */
const PS_COMPILE_TIMEOUT = 20000;

/** C# 源码：封装常用 Win32 API（SetForegroundWindow/ShowWindow/EnumWindows/keybd_event） */
const HELPER_CODE = `using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, ref int lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void PressKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
    }
}`;

// ============================================================
// Win32Helper 类：DLL 编译与加载
// ============================================================

class Win32Helper {
    constructor() {
        // 构造时立即检查并编译 DLL
        this.ensureCompiled();
    }

    /**
     * @description 确保 WinAPI DLL 已编译，优先使用 csc.exe 编译，回退到 PowerShell Add-Type
     * @returns {void}
     */
    ensureCompiled() {
        if (fs.existsSync(DLL_PATH)) return;

        const csPath = path.join(os.tmpdir(), 'XiaoMeng_WinAPI.cs');
        fs.writeFileSync(csPath, HELPER_CODE, 'utf8');

        try {
            // 优先查找 .NET Framework 64 位和 32 位 csc 编译器
            const cscPaths = [
                'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
                'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
            ];

            for (const csc of cscPaths) {
                if (fs.existsSync(csc)) {
                    execSync(`"${csc}" /nologo /optimize /out:"${DLL_PATH}" /target:library "${csPath}"`, { timeout: COMPILE_TIMEOUT });
                    console.log('[Win32] DLL compiled:', DLL_PATH);
                    fs.unlinkSync(csPath);
                    return;
                }
            }

            // csc.exe 不存在时回退到 PowerShell Add-Type 编译
            const psCmd = `Add-Type -TypeDefinition (Get-Content -Path '${csPath}' -Raw) -OutputAssembly '${DLL_PATH}' -OutputType Library`;
            execSync(`powershell -NoProfile -Command "${psCmd.replace(/"/g, '\\"')}"`, { timeout: PS_COMPILE_TIMEOUT });

        } catch (e) {
            console.error('[Win32] DLL compilation failed:', e.message);
        } finally {
            try { fs.unlinkSync(csPath); } catch (e) {}
        }
    }

    /**
     * @description 获取 PowerShell 加载 WinAPI 的脚本片段，优先从 DLL 加载，回退到 Add-Type
     * @returns {string} PowerShell 加载脚本
     */
    getLoader() {
        return fs.existsSync(DLL_PATH)
            ? `[System.Reflection.Assembly]::LoadFrom('${DLL_PATH}') | Out-Null`
            : `Add-Type -TypeDefinition '${HELPER_CODE}' | Out-Null`;
    }
}

module.exports = new Win32Helper();