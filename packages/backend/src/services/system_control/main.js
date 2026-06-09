/**
 * @file main.js
 * @description SystemControl 主控制器 - 工具定义、路由分发、日志管理、代码执行、图表/表格生成
 * @module services/system_control
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const appAutomation = require('../appAutomation');

// ============================================================
// 子模块：延迟加载，避免循环依赖
// ============================================================
let _appTools = null;
let _fileTools = null;
let _systemTools = null;
let _ruleMatcher = null;

/**
 * @description 转义PowerShell字符串参数中的单引号，防止命令注入
 * @param {string} str - 待转义的字符串
 * @returns {string} 转义后的安全字符串
 */
function escapePowerShellArg(str) {
    if (typeof str !== 'string') return "''";
    return "'" + str.replace(/'/g, "''");
}

// ============================================================
// 常量定义：允许访问的路径白名单，限制文件操作范围
// ============================================================

/** 允许访问的路径列表，仅允许操作用户主目录及常用子目录 */
const ALLOWED_PATHS = [
    os.homedir(),
    path.join(os.homedir(), 'OneDrive', 'Desktop'),
    path.join(os.homedir(), 'OneDrive', 'Documents'),
    path.join(os.homedir(), 'OneDrive'),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads'),
];

/**
 * @description 检查路径是否在允许访问的白名单内，防止越权访问
 * @param {string} filepath - 待检查的文件路径
 * @returns {boolean} 是否允许访问
 */
function isPathAllowed(filepath) {
    const resolved = path.resolve(filepath);
    return ALLOWED_PATHS.some(allowed => resolved.startsWith(allowed));
}

/**
 * @description 获取桌面路径，优先使用OneDrive桌面
 * @returns {string} 桌面目录绝对路径
 * @private
 */
function _getDesktopPath() {
    const home = os.homedir();
    const onedriveDesktop = path.join(home, 'OneDrive', 'Desktop');
    const normalDesktop = path.join(home, 'Desktop');
    if (fs.existsSync(onedriveDesktop)) return onedriveDesktop;
    if (fs.existsSync(normalDesktop)) return normalDesktop;
    return normalDesktop;
}

class SystemControl {
    /**
     * @description 构造函数，初始化数据目录、日志文件、备忘录目录和待办文件
     */
    constructor() {
        this.dataDir = path.join(__dirname, '..', '..', 'data');
        this.logFile = path.join(this.dataDir, 'system_control_log.json');

        this._memoDir = path.join(this.dataDir, 'memos');
        this._todoFile = path.join(this.dataDir, 'todos.json');

        /** 危险操作工具列表，执行前需用户确认 */
        this.dangerousTools = ['shutdown', 'restart', 'clear_memory', 'system_reset'];

        this.initLog();
        this._ensureDataDirs();
    }

    /**
     * @description 确保数据目录和待办文件存在，不存在则创建
     * @private
     */
    _ensureDataDirs() {
        if (!fs.existsSync(this._memoDir)) fs.mkdirSync(this._memoDir, { recursive: true });
        if (!fs.existsSync(this._todoFile)) fs.writeFileSync(this._todoFile, JSON.stringify([]), 'utf8');
    }

    // ============================================================
    // 子模块：延迟加载 getter，按需引入避免循环依赖
    // ============================================================

    /** @description 延迟加载应用工具模块 */
    get appTools() {
        if (!_appTools) _appTools = require('./app_tools');
        return _appTools;
    }

    /** @description 延迟加载文件工具模块 */
    get fileTools() {
        if (!_fileTools) _fileTools = require('./file_tools');
        return _fileTools;
    }

    /** @description 延迟加载系统工具模块 */
    get systemTools() {
        if (!_systemTools) _systemTools = require('./system_tools');
        return _systemTools;
    }

    /** @description 延迟加载规则匹配模块 */
    get ruleMatcher() {
        if (!_ruleMatcher) _ruleMatcher = require('./rule_matcher');
        return _ruleMatcher;
    }

    // ============================================================
    // 工具定义：LLM 可调用的工具列表
    // ============================================================

    /**
     * @description 获取所有工具定义列表，供 LLM 工具调用使用
     * @returns {Array<Object>} 工具定义数组
     */
    get tools() {
        return [
            {
                type: 'function',
                function: {
                    name: 'launch_app',
                    description: '启动电脑上的应用程序',
                    parameters: {
                        type: 'object',
                        properties: {
                            app_name: { type: 'string', description: '应用名称' }
                        },
                        required: ['app_name']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'play_music',
                    description: '播放音乐，自动打开网易云音乐',
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
                    name: 'app_action',
                    description: '在已打开的应用中执行操作',
                    parameters: {
                        type: 'object',
                        properties: {
                            app_name: { type: 'string', description: '应用名称' },
                            action: {
                                type: 'string',
                                enum: ['play_song', 'pause', 'next_song', 'prev_song', 'volume_up', 'volume_down', 'send_message', 'type_text', 'press_key', 'hotkey', 'activate_window']
                            }
                        },
                        required: ['app_name', 'action']
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
                        properties: { url: { type: 'string' } },
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
                            query: { type: 'string' },
                            engine: { type: 'string', enum: ['baidu', 'google', 'bing'] }
                        },
                        required: ['query']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'search_shopping',
                    description: '在电商平台搜索商品',
                    parameters: {
                        type: 'object',
                        properties: {
                            product: { type: 'string' },
                            platform: { type: 'string', enum: ['taobao', 'jd', 'pdd'] }
                        },
                        required: ['product']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'search_video',
                    description: '搜索视频',
                    parameters: {
                        type: 'object',
                        properties: {
                            keyword: { type: 'string' },
                            platform: { type: 'string', enum: ['bilibili', 'youtube'] }
                        },
                        required: ['keyword']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'take_screenshot',
                    description: '截取屏幕',
                    parameters: { type: 'object', properties: {} }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'create_folder',
                    description: '创建文件夹',
                    parameters: {
                        type: 'object',
                        properties: { name: { type: 'string' } },
                        required: ['name']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'read_file',
                    description: '读取文件内容',
                    parameters: {
                        type: 'object',
                        properties: { filepath: { type: 'string' } },
                        required: ['filepath']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'write_file',
                    description: '写入文件内容',
                    parameters: {
                        type: 'object',
                        properties: {
                            filepath: { type: 'string' },
                            content: { type: 'string' }
                        },
                        required: ['filepath', 'content']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'list_directory',
                    description: '列出目录内容',
                    parameters: {
                        type: 'object',
                        properties: { dirpath: { type: 'string' } },
                        required: ['dirpath']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'manage_window',
                    description: '管理窗口',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['minimize', 'maximize', 'close', 'restore'] },
                            title: { type: 'string' }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'control_volume',
                    description: '控制音量',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['up', 'down', 'mute', 'unmute'] },
                            step: { type: 'number' }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'clipboard_operation',
                    description: '剪贴板操作',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['copy', 'paste', 'clear'] },
                            content: { type: 'string' }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'system_shortcut',
                    description: '执行系统快捷操作',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['lock', 'shutdown', 'restart', 'sleep', 'hibernate', 'signout'] }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'code_execute',
                    description: `执行Python或JavaScript代码，用于数据分析、计算、图表生成、Excel文件生成等。

【重要：生成图表】
使用matplotlib生成PNG图片，必须保存到 uploads/charts/ 目录。
必须在代码开头加 import matplotlib; matplotlib.use('Agg')
示例代码：
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei']
plt.rcParams['axes.unicode_minus'] = False
plt.figure(figsize=(10,6))
plt.plot([1,2,3], [100,200,150])
plt.title('标题')
plt.savefig('uploads/charts/销售趋势.png', dpi=150, bbox_inches='tight')
plt.close()
print('CHART_IMAGE:uploads/charts/销售趋势.png')

【重要：生成Excel】
使用openpyxl生成xlsx文件保存到桌面：
from openpyxl import Workbook
wb = Workbook()
ws = wb.active
ws.title = '销售汇总'
ws.append(['列1', '列2'])
ws.append(['数据1', '数据2'])
wb.save('C:/Users/admin/OneDrive/Desktop/分析结果.xlsx')
print('Excel已保存')

【重要：数据分析任务必须同时生成图表和Excel】
一次code_execute调用中，可以同时生成图表和Excel：
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from openpyxl import Workbook
# ... 数据处理 ...
# 生成图表
plt.savefig('uploads/charts/趋势图.png', dpi=150, bbox_inches='tight')
plt.close()
print('CHART_IMAGE:uploads/charts/趋势图.png')
# 生成Excel
wb = Workbook(); ws = wb.active
ws.append(['月份','销售额'])
# ... 写入数据 ...
wb.save('C:/Users/admin/OneDrive/Desktop/分析结果.xlsx')
print('Excel已保存')

【注意事项】
- 图表必须保存到 uploads/charts/ 目录才能被识别
- 图表代码必须加 matplotlib.use('Agg') 否则会报错
- 图表保存后必须 print('CHART_IMAGE:uploads/charts/文件名.png')
- 中文字体用 Microsoft YaHei 或 SimHei
- 不要用 pandas/numpy（可能未安装）`,
                    parameters: {
                        type: 'object',
                        properties: {
                            code: { type: 'string', description: '要执行的代码' },
                            language: { type: 'string', enum: ['python', 'javascript'], description: '编程语言' }
                        },
                        required: ['code', 'language']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'generate_chart',
                    description: '生成数据可视化图表（柱状图、折线图、饼图等），返回图表URL供前端展示',
                    parameters: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['bar', 'line', 'pie', 'area', 'radar'], description: '图表类型' },
                            title: { type: 'string', description: '图表标题' },
                            data: { type: 'array', description: '数据数组，每个元素是一个数据集' },
                            labels: { type: 'array', description: 'X轴标签数组' },
                            options: { type: 'object', description: '额外选项如颜色、尺寸等' }
                        },
                        required: ['type', 'title', 'data', 'labels']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'generate_table',
                    description: '生成Excel/CSV表格文件，返回可下载的URL链接',
                    parameters: {
                        type: 'object',
                        properties: {
                            data: {
                                type: 'object',
                                description: '表格数据对象，包含 headers（表头数组）和 rows（二维数据数组）'
                            },
                            headers: { type: 'array', description: '表头数组，如 ["姓名","年龄","部门"]' },
                            rows: { type: 'array', description: '数据行数组，如 [["张三",25,"技术部"],["李四",30,"市场部"]]' },
                            format: { type: 'string', enum: ['xlsx', 'csv', 'json', 'markdown'], description: '输出格式，默认xlsx' },
                            filename: { type: 'string', description: '文件名（不含扩展名），如 "员工信息表"' }
                        },
                        required: ['data']
                    }
                }
            }
        ];
    }

    /**
     * @description 获取工具定义列表（含 MCP 工具），合并内置工具和外部 MCP 工具
     * @returns {Array<Object>} 合并后的工具定义数组
     */
    getToolDefinitions() {
        let allTools = [...this.tools];
        try {
            const mcpClientManager = require('../mcpClientManager');
            if (mcpClientManager && mcpClientManager.toolRegistry) {
                const mcpTools = mcpClientManager.toolRegistry.getAllTools();
                for (const mcpTool of mcpTools) {
                    if (!allTools.some(t => t.function && t.function.name === mcpTool.name)) {
                        allTools.push({
                            type: 'function',
                            function: {
                                name: mcpTool.name,
                                description: mcpTool.description || 'MCP工具',
                                parameters: mcpTool.inputSchema || { type: 'object', properties: {} }
                            }
                        });
                    }
                }
            }
        } catch (e) {}
        return allTools;
    }

    // ============================================================
    // 日志系统：记录操作历史，限制最大条数防止文件过大
    // ============================================================

    /**
     * @description 初始化日志文件，确保数据目录和日志文件存在
     */
    initLog() {
        try {
            const dataDir = path.join(__dirname, '..', '..', 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            if (!fs.existsSync(this.logFile)) fs.writeFileSync(this.logFile, JSON.stringify([]), 'utf8');
        } catch (e) {
            console.error('[系统控制] 日志初始化失败:', e.message);
        }
    }

    /**
     * @description 写入操作日志，超过500条自动截断旧记录
     * @param {Object} entry - 日志条目，包含 type、input、args、success、timestamp
     */
    logCommand(entry) {
        try {
            const logs = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
            logs.push(entry);
            if (logs.length > 500) logs.splice(0, logs.length - 500);
            fs.writeFileSync(this.logFile, JSON.stringify(logs, null, 2), 'utf8');
        } catch (e) {
            console.error('[系统控制] 日志写入失败:', e.message);
        }
    }

    // ============================================================
    // 主入口：接收用户输入和 LLM 响应，路由到对应处理器
    // ============================================================

    /**
     * @description 执行系统控制命令，优先处理 LLM 工具调用，其次走规则匹配降级
     * @param {string} userInput - 用户原始输入文本
     * @param {Object|null} [llmResponse=null] - LLM 响应对象，可能包含 tool_calls
     * @param {Array} [llmResponse.tool_calls] - LLM 返回的工具调用列表
     * @returns {Promise<Object>} 执行结果 { success, message, ... }
     */
    async execute(userInput, llmResponse = null) {
        try {
            const cleanInput = userInput.replace(/\s+/g, ' ').trim();

            // 优先级 1: LLM 工具调用
            if (llmResponse && llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
                const result = await this.executeToolCalls(llmResponse.tool_calls, cleanInput);
                if (result.requireConfirm) return result;
                return result;
            }

            // 优先级 2: 规则匹配降级
            const fallbackResult = this.ruleMatcher.match(cleanInput);
            if (fallbackResult && fallbackResult.intent) {
                if (fallbackResult.requireConfirm) return fallbackResult;
                return await this.executeTool(fallbackResult.intent.type, fallbackResult.intent.match);
            }
            return fallbackResult;

        } catch (error) {
            console.error('[系统控制] 执行命令失败:', error.message);
            return { success: false, message: `操作失败了：${error.message}` };
        }
    }

    /**
     * @description 批量执行 LLM 工具调用，逐个解析参数并分发执行
     * @param {Array<Object>} toolCalls - LLM 返回的工具调用列表
     * @param {string} userInput - 用户原始输入文本
     * @returns {Promise<Object>} 执行结果，单个工具返回单个结果，多个工具返回合并结果
     */
    async executeToolCalls(toolCalls, userInput) {
        const results = [];

        for (const toolCall of toolCalls) {
            const { function: func } = toolCall;
            const toolName = func.name;
            let args;

            try {
                args = typeof func.arguments === 'string' ? JSON.parse(func.arguments) : func.arguments;
            } catch (e) {
                results.push({ success: false, message: `参数解析失败：${toolName}` });
                continue;
            }

            const isAllowedTool = this.tools.some(t => t.function.name === toolName);
            if (!isAllowedTool) {
                results.push({ success: false, message: `不支持的操作：${toolName}` });
                continue;
            }

            if (this.dangerousTools.includes(toolName)) {
                results.push({
                    success: false,
                    requireConfirm: true,
                    message: `这涉及到${this.getToolDisplayName(toolName)}，确定要执行吗？`,
                    pendingToolCall: toolCall
                });
                continue;
            }

            try {
                const result = await this.executeTool(toolName, args);
                results.push(result);
                this.logCommand({ type: toolName, input: userInput, args, success: result.success, timestamp: Date.now() });
            } catch (error) {
                results.push({ success: false, message: `操作执行异常：${error.message}` });
            }
        }

        return results.length === 1 ? results[0] : {
            success: results.every(r => r.success),
            message: results.map(r => r.message || '').filter(Boolean).join('；') || '操作已完成',
            results
        };
    }

    /**
     * @description 获取工具的中文名称，用于向用户展示友好的操作提示
     * @param {string} toolName - 工具名称
     * @returns {string} 工具的中文名称
     */
    getToolDisplayName(toolName) {
        const names = {
            take_screenshot: '截图', shutdown: '关机', restart: '重启',
            weather: '天气查询', search_web: '网页搜索', launch_app: '启动应用',
            system_shortcut: '系统操作', clear_memory: '清除记忆'
        };
        return names[toolName] || toolName;
    }

    // ============================================================
    // 工具执行分发：根据工具名路由到对应子模块执行
    // ============================================================

    /**
     * @description 根据工具名分发执行到对应子模块
     * @param {string} toolName - 工具名称
     * @param {Object} args - 工具参数
     * @returns {Promise<Object>} 执行结果 { success, message, ... }
     */
    async executeTool(toolName, args) {
        switch (toolName) {
            case 'launch_app': return await this.appTools.launchApp(args.app_name);
            case 'play_music': return await this.appTools.playMusic(args.song);
            case 'app_action': return await appAutomation.handleToolCall('app_action', args);
            case 'open_url': return await this.appTools.openURL(args.url);
            case 'search_web': return await this.appTools.searchWeb(args.query, args.engine || 'baidu');
            case 'search_shopping': return await this.appTools.searchShopping(args.product, args.platform || 'taobao');
            case 'search_video': return await this.appTools.searchVideo(args.keyword, args.platform || 'bilibili');
            case 'take_screenshot': return await this.systemTools.takeScreenshot();
            case 'create_folder': return await this.fileTools.createFolder(args.name);
            case 'read_file': return await this.fileTools.readFile(args.filepath);
            case 'write_file': return await this.fileTools.writeFile(args.filepath, args.content);
            case 'list_directory': return await this.fileTools.listDirectory(args.dirpath);
            case 'manage_window': return await this.systemTools.manageWindow(args.action, args.title);
            case 'control_volume': return await this.systemTools.controlVolume(args.action, args.step);
            case 'clipboard_operation': return await this.systemTools.clipboardOperation(args.action, args.content);
            case 'system_shortcut': return await this.systemTools.systemShortcut(args.action);
            case 'code_execute': return await this._executeCode(args.code, args.language);
            case 'generate_chart': return await this._generateChart(args);
            case 'generate_table': return await this._generateTable(args);
            default: return { success: false, message: `未知工具: ${toolName}` };
        }
    }

    /**
     * @description 执行代码（Python/JavaScript），将代码写入临时文件后用子进程执行
     * @param {string} code - 要执行的代码
     * @param {string} [language='python'] - 编程语言：python 或 javascript
     * @returns {Promise<Object>} 执行结果 { success, output, error, message, imageUrl? }
     * @throws 不抛出异常，所有错误通过返回值传递
     */
    async _executeCode(code, language = 'python') {
        const { spawn } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const execId = Date.now();
        const tmpFile = path.join(os.tmpdir(), `xiaomeng_exec_${execId}.${language === 'python' ? 'py' : 'js'}`);
        fs.writeFileSync(tmpFile, code, 'utf8');

        // 确保图表输出目录存在，代码执行生成的图表保存到此目录
        const uploadsDir = path.join(process.cwd(), 'uploads', 'charts');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        return new Promise((resolve) => {
            const cmd = language === 'python' ? 'python' : 'node';
            const child = spawn(cmd, [tmpFile], {
                timeout: 45000, // 代码执行最大超时45秒，防止死循环
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    // 清除代理设置，避免代码执行时因代理导致网络请求失败
                    HTTP_PROXY: '',
                    HTTPS_PROXY: ''
                }
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { stderr += data.toString(); });

            child.on('close', (code) => {
                // 执行完毕后清理临时文件，避免磁盘残留
                try { fs.unlinkSync(tmpFile); } catch (e) {}

                const result = { success: code === 0, output: stdout.trim(), error: stderr.trim() };

                if (code === 0) {
                    // 方法1: 检查 stdout 中的 IMAGE_SAVED 标记
                    const lines = stdout.trim().split('\n');
                    const imgLine = lines.find(l => l.includes('CHART_IMAGE:') || l.includes('IMAGE_SAVED:'));
                    if (imgLine) {
                        const imgPath = imgLine.split(':').slice(1).join(':').trim();
                        const imgName = path.basename(imgPath);
                        result.message = `图表已生成！访问地址: http://localhost:3000/uploads/charts/${imgName}`;
                        result.imageUrl = `/uploads/charts/${imgName}`;
                    } else {
                        // 方法2: 扫描 uploads/charts/ 目录，找最近5秒内生成的图片
                        try {
                            const chartsDir = path.join(process.cwd(), 'uploads', 'charts');
                            if (fs.existsSync(chartsDir)) {
                                const now = Date.now();
                                const files = fs.readdirSync(chartsDir)
                                    .filter(f => /\.(png|jpg|jpeg|gif|svg)$/i.test(f))
                                    .map(f => ({ name: f, mtime: fs.statSync(path.join(chartsDir, f)).mtime.getTime() }))
                                    .filter(f => now - f.mtime < 10000) // 10秒内生成的文件视为本次执行产出
                                    .sort((a, b) => b.mtime - a.mtime);
                                if (files.length > 0) {
                                    const latestImg = files[0].name;
                                    result.message = `图表已生成！访问地址: http://localhost:3000/uploads/charts/${latestImg}`;
                                    result.imageUrl = `/uploads/charts/${latestImg}`;
                                } else {
                                    result.message = stdout.trim() || '代码执行成功';
                                }
                            } else {
                                result.message = stdout.trim() || '代码执行成功';
                            }
                        } catch (e) {
                            result.message = stdout.trim() || '代码执行成功';
                        }
                    }
                } else {
                    result.message = `代码执行失败: ${stderr.trim() || '未知错误'}`;
                }
                resolve(result);
            });

            child.on('error', (err) => {
                // 子进程启动失败时也要清理临时文件
                try { fs.unlinkSync(tmpFile); } catch (e) {}
                resolve({ success: false, message: `执行出错: ${err.message}` });
            });
        });
    }

    /**
     * @description 生成数据可视化图表，委托给 chart_generator 服务
     * @param {Object} args - 图表参数 { type, title, data, labels, options }
     * @param {string} args.type - 图表类型：bar/line/pie/area/radar
     * @param {string} args.title - 图表标题
     * @param {Array} args.data - 数据数组
     * @param {Array} args.labels - X轴标签数组
     * @returns {Promise<Object>} 图表生成结果 { success, message, chartUrl, filename, type }
     */
    async _generateChart(args) {
        try {
            const chartGenerator = require('../chart_generator');
            const result = chartGenerator.generateChart(args);
            if (result.success) {
                return {
                    success: true,
                    message: `图表已生成: ${result.title}`,
                    chartUrl: result.url,
                    filename: result.filename,
                    type: result.type
                };
            }
            return { success: false, message: '图表生成失败' };
        } catch (e) {
            return { success: false, message: `图表生成错误: ${e.message}` };
        }
    }

    /**
     * @description 生成表格文件（Excel/CSV/JSON/Markdown），委托给 content_generation 服务
     * @param {Object} args - 表格参数 { data, headers, rows, format, filename }
     * @param {Object} [args.data] - 完整数据对象，包含 headers 和 rows
     * @param {Array} [args.headers] - 表头数组
     * @param {Array} [args.rows] - 数据行数组
     * @param {string} [args.format='xlsx'] - 输出格式：xlsx/csv/json/markdown
     * @param {string} [args.filename='generated_table'] - 文件名（不含扩展名）
     * @returns {Promise<Object>} 表格生成结果 { success, message, url, filepath, downloadUrl, previewUrl, rows, format }
     */
    async _generateTable(args) {
        try {
            const ContentGenerationClass = require('../content_generation');
            const ContentGeneration = new ContentGenerationClass();

            // 解析参数
            let tableData = {};

            if (args.data) {
                // 完整数据对象传入
                tableData = args.data;
            } else {
                // 单独传入 headers 和 rows
                tableData.headers = args.headers || [];
                tableData.rows = args.rows || [];
            }

            tableData.format = args.format || 'xlsx';
            tableData.filename = args.filename || 'generated_table';

            const result = await ContentGeneration.generateTable(tableData);

            if (result.success) {
                return {
                    success: true,
                    message: `表格已生成: ${result.filename || tableData.filename}`,
                    url: result.url,
                    filepath: result.filepath,
                    downloadUrl: `http://localhost:3000${result.url}`,
                    previewUrl: `http://localhost:3000${result.url}`,
                    rows: result.rows || 0,
                    format: result.format
                };
            }
            return { success: false, message: result.message || '表格生成失败' };
        } catch (e) {
            return { success: false, message: `表格生成错误: ${e.message}` };
        }
    }

    /**
     * @description 规则匹配降级入口，当 LLM 未返回工具调用时使用规则匹配
     * @param {string} userText - 用户输入文本
     * @returns {Object|null} 匹配结果，未匹配返回 null
     */
    fallbackRuleMatch(userText) {
        try {
            const cleanInput = userText.replace(/\s+/g, ' ').trim();
            return this.ruleMatcher.match(cleanInput);
        } catch (e) {
            return null;
        }
    }
}

module.exports = new SystemControl();