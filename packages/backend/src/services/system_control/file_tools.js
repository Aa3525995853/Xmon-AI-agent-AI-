/**
 * @file file_tools.js
 * @description 文件工具模块 - 文件读写、目录操作、文件搜索等本地文件系统操作
 * @module services/system_control
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// 常量定义：文件读取限制
// 说明：防止读取超大文件导致内存溢出
// ============================================================

/** 单次读取文件最大行数 */
const MAX_READ_LINES = 500;

/** 文件搜索最大结果数 */
const MAX_SEARCH_RESULTS = 50;

/** 文件搜索最大递归深度 */
const MAX_SEARCH_DEPTH = 3;

class FileTools {
    /**
     * @description 构造函数，自动检测工作目录
     */
    constructor() {
        this.workDir = this._detectWorkDir();
    }

    /**
     * @description 检测工作目录，优先使用OneDrive桌面，其次普通桌面，最后用户主目录
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
            if (fs.existsSync(p)) return p;
        }
        return home;
    }

    /**
     * @description 解析文件路径，相对路径基于工作目录解析为绝对路径
     * @param {string} p - 文件路径（绝对或相对）
     * @returns {string} 解析后的绝对路径
     * @private
     */
    _resolvePath(p) {
        if (!p) return this.workDir;
        if (path.isAbsolute(p)) return p;
        return path.resolve(this.workDir, p);
    }

    /**
     * @description 创建文件夹，支持递归创建父目录
     * @param {string} name - 文件夹名称或路径
     * @returns {Promise<{success: boolean, message: string, path?: string}>} 创建结果
     */
    async createFolder(name) {
        if (!name) return { success: false, message: '未指定文件夹名称' };

        const folderPath = this._resolvePath(name);

        try {
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            return { success: true, message: `已创建文件夹: ${name}`, path: folderPath };
        } catch (e) {
            return { success: false, message: `创建失败: ${e.message}` };
        }
    }

    /**
     * @description 读取文件内容，自动处理BOM头，超过500行自动截断
     * @param {string} filepath - 文件路径
     * @returns {Promise<{success: boolean, message?: string, content?: string, total_lines?: number, truncated?: boolean, path?: string}>} 读取结果
     */
    async readFile(filepath) {
        const filePath = this._resolvePath(filepath);

        if (!fs.existsSync(filePath)) {
            return { success: false, message: `文件不存在: ${filepath}` };
        }

        try {
            let content = fs.readFileSync(filePath, 'utf-8');
            // 移除UTF-8 BOM头，避免内容解析异常
            if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

            const lines = content.split('\n');
            const truncated = lines.length > MAX_READ_LINES;

            return {
                success: true,
                content: truncated ? lines.slice(0, MAX_READ_LINES).join('\n') : content,
                total_lines: lines.length,
                truncated,
                path: filePath
            };
        } catch (e) {
            return { success: false, message: `读取失败: ${e.message}` };
        }
    }

    /**
     * @description 写入文件内容，自动创建不存在的父目录
     * @param {string} filepath - 文件路径
     * @param {string} content - 写入内容
     * @returns {Promise<{success: boolean, message: string, path?: string, size?: number}>} 写入结果
     */
    async writeFile(filepath, content) {
        const filePath = this._resolvePath(filepath);

        if (!content || content.trim().length === 0) {
            return { success: false, message: '文件内容为空' };
        }

        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filePath, content, 'utf-8');
            const stat = fs.statSync(filePath);

            return { success: true, message: '文件写入成功', path: filePath, size: stat.size };
        } catch (e) {
            return { success: false, message: `写入失败: ${e.message}` };
        }
    }

    /**
     * @description 列出目录内容，按类型（目录优先）和中文名称排序
     * @param {string} [dirpath] - 目录路径，默认为工作目录
     * @returns {Promise<{success: boolean, message?: string, path?: string, items?: Array, total?: number}>} 目录列表结果
     */
    async listDirectory(dirpath) {
        const dirPath = dirpath ? this._resolvePath(dirpath) : this.workDir;

        if (!fs.existsSync(dirPath)) {
            return { success: false, message: `目录不存在: ${dirpath}` };
        }

        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true })
                .filter(i => !i.name.startsWith('.'))
                .map(i => ({
                    name: i.name,
                    type: i.isDirectory() ? 'directory' : 'file',
                    size: i.isFile() ? fs.statSync(path.join(dirPath, i.name)).size : null,
                    ext: i.isFile() ? path.extname(i.name).toLowerCase() : null
                }));

            // 按类型和名称排序
            items.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name, 'zh-CN');
            });

            return { success: true, path: dirPath, items, total: items.length };
        } catch (e) {
            return { success: false, message: `列出目录失败: ${e.message}` };
        }
    }

    /**
     * @description 在用户常用目录中递归搜索文件，最大深度3层，最多返回50个结果
     * @param {string} filename - 搜索的文件名关键字
     * @returns {Promise<{success: boolean, results?: Array, total?: number}>} 搜索结果
     */
    async searchLocalFiles(filename) {
        if (!filename) return { success: false, message: '未指定文件名' };

        const searchDirs = [
            os.homedir(),
            path.join(os.homedir(), 'Desktop'),
            path.join(os.homedir(), 'Documents'),
            path.join(os.homedir(), 'Downloads')
        ];

        const results = [];

        /**
         * @description 递归搜索文件
         * @param {string} dir - 搜索起始目录
         * @param {number} [depth=0] - 当前递归深度
         */
        const searchRecursive = (dir, depth = 0) => {
            if (depth > MAX_SEARCH_DEPTH || results.length >= MAX_SEARCH_RESULTS) return;

            try {
                const items = fs.readdirSync(dir, { withFileTypes: true });
                for (const item of items) {
                    if (results.length >= MAX_SEARCH_RESULTS) break;
                    if (item.name.startsWith('.')) continue;

                    const fullPath = path.join(dir, item.name);
                    if (item.name.toLowerCase().includes(filename.toLowerCase())) {
                        results.push({
                            name: item.name,
                            path: fullPath,
                            type: item.isDirectory() ? 'directory' : 'file',
                            size: item.isFile() ? fs.statSync(fullPath).size : null
                        });
                    }

                    if (item.isDirectory()) {
                        searchRecursive(fullPath, depth + 1);
                    }
                }
            } catch (e) {
                // 忽略访问权限错误
            }
        };

        for (const dir of searchDirs) {
            if (results.length >= MAX_SEARCH_RESULTS) break;
            searchRecursive(dir);
        }

        return { success: true, results, total: results.length };
    }
}

module.exports = new FileTools();