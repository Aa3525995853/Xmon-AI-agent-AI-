/**
 * 系统控制服务 - LLM 驱动架构
 * 支持 Function Calling 和规则匹配降级
 */

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { SystemIntent, SystemControlResult } from '../types';

// 可选依赖 Puppeteer（浏览器自动化）
let puppeteer: any = null;
try {
    puppeteer = require('puppeteer');
    console.log('[系统控制] Puppeteer 已加载');
} catch (e) {
    console.log('[系统控制] Puppeteer 未安装，浏览器自动化功能不可用');
}

/**
 * 工具定义（Function Calling 格式）
 */
interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
          properties: Record<string, any>;
       required: string[];
        };
    };
}

/**
 * 系统控制日志条目
 */
interface LogEntry {
    timestamp: string;
    action: string;
    params: any;
    success: boolean;
    error?: string;
}

class SystemControl {
    private dataDir: string;
    private logFile: string;
    public tools: ToolDefinition[];

    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.logFile = path.join(this.dataDir, 'system_control_log.json');
        this.initLog();

        // 定义工具（Function Calling 标准格式）
        this.tools = [
            {
                type: 'function',
              function: {
                    name: 'launch_app',
               description: '启动电脑上的应用程序',
                 parameters: {
                  type: 'object',
                properties: {
                          app_name: { type: 'string', description: '应用名称，如 "网易云音乐", "微信", "Chrome" 等' }
                   },
                        required: ['app_name']
                    }
                }
            },
            {
             type: 'function',
                function: {
                name: 'play_music',
             description: '播放音乐',
                parameters: {
                        type: 'object',
                    properties: {
                      song: { type: 'string', description: '歌曲名或歌手名' }
                        },
                    required: ['song']
              }
             }
            },
            {
                type: 'function',
                function: {
             name: 'open_url',
            description: '在浏览器中打开网页',
                parameters: {
                type: 'object',
                        properties: {
                      url: { type: 'string', description: '要打开的网址' }
                    },
                        required: ['url']
                    }
           }
            },
            {
                type: 'function',
                function: {
                    name: 'search_web',
                    description: '在搜索引擎中搜索内容',
                  parameters: {
                        type: 'object',
                 properties: {
                    query: { type: 'string', description: '搜索关键词' },
                            engine: { type: 'string', description: '搜索引擎：baidu, google, bing', enum: ['baidu', 'google', 'bing'] }
                        },
                      required: ['query']
                  }
             }
            },
            {
           type: 'function',
                function: {
            name: 'get_system_info',
                description: '获取电脑系统信息（CPU、内存、IP等）',
             parameters: {
                        type: 'object',
                        properties: {},
                      required: []
               }
                }
            }
        ];
    }

    /**
     * 初始化日志文件
     */
    private initLog(): void {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    if (!fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, JSON.stringify([], null, 2));
        }
    }

    /**
     * 记录操作日志
     */
    private log(action: string, params: any, success: boolean, error?: string): void {
        try {
        const logs: LogEntry[] = JSON.parse(fs.readFileSync(this.logFile, 'utf-8'));
       logs.push({
                timestamp: new Date().toISOString(),
                action,
             params,
                success,
                error
         });
            // 只保留最近100条
            if (logs.length > 100) {
            logs.splice(0, logs.length - 100);
            }
         fs.writeFileSync(this.logFile, JSON.stringify(logs, null, 2));
        } catch (e) {
         console.error('[系统控制] 日志写入失败:', e);
        }
    }

    /**
     * 执行工具调用
     */
    async executeToolCall(toolName: string, args: any): Promise<SystemControlResult> {
        console.log(`[系统控制] 执行工具: ${toolName}`, args);

        try {
       let result: SystemControlResult;

            switch (toolName) {
                case 'launch_app':
                    result = await this.launchApp(args.app_name);
                break;
         case 'play_music':
                result = await this.playMusic(args.song);
                    break;
                case 'open_url':
                    result = await this.openUrl(args.url);
                    break;
                case 'search_web':
                    result = await this.searchWeb(args.query, args.engine || 'baidu');
                 break;
                case 'get_system_info':
                result = await this.getSystemInfo();
              break;
              default:
             result = {
                 success: false,
                     message: `未知工具: ${toolName}`
           };
            }
            this.log(toolName, args, result.success, result.success ? undefined : result.message);
          return result;
      } catch (error) {
            const err = error as Error;
          const result: SystemControlResult = {
                success: false,
              message: `执行失败: ${err.message}`
            };
            this.log(toolName, args, false, err.message);
            return result;
        }
    }

    /**
     * 启动应用
     */
    private async launchApp(appName: string): Promise<SystemControlResult> {
        return new Promise((resolve) => {
            const command = process.platform === 'win32'
                ? `start "" "${appName}"`
                : `open -a "${appName}"`;

          exec(command, (error) => {
             if (error) {
                    resolve({
                   success: false,
                     message: `无法启动 ${appName}: ${error.message}`
             });
           } else {
              resolve({
                     success: true,
           message: `已启动 ${appName}`
               });
          }
          });
        });
    }

    /**
     * 播放音乐
     */
    private async playMusic(song: string): Promise<SystemControlResult> {
        // 简化实现：打开网易云音乐搜索页
        const url = `https://music.163.com/#/search/m/?s=${encodeURIComponent(song)}`;
        return this.openUrl(url);
    }

    /**
     * 打开网址
     */
    private async openUrl(url: string): Promise<SystemControlResult> {
        return new Promise((resolve) => {
            const command = process.platform === 'win32'
           ? `start "" "${url}"`
                : `open "${url}"`;

            exec(command, (error) => {
              if (error) {
                 resolve({
         success: false,
                message: `无法打开网址: ${error.message}`
                    });
            } else {
              resolve({
                      success: true,
                        message: `已打开网址`
          });
        }
          });
        });
    }

    /**
     * 搜索网页
     */
    private async searchWeb(query: string, engine: string = 'baidu'): Promise<SystemControlResult> {
        const engines: Record<string, string> = {
            baidu: `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`,
            google: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`
        };

        const url = engines[engine] || engines.baidu;
        return this.openUrl(url);
    }

    /**
     * 获取系统信息
     */
    private async getSystemInfo(): Promise<SystemControlResult> {
        const os = require('os');
        const info = {
        platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            hostname: os.hostname()
        };

        return {
            success: true,
            message: `系统信息：${JSON.stringify(info, null, 2)}`
        };
    }

    /**
     * 获取工具列表
     */
    getTools(): ToolDefinition[] {
        return this.tools;
    }
}

export default new SystemControl();
