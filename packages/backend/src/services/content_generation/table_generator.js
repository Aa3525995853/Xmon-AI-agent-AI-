/**
 * @file table_generator.js
 * @description 表格生成器 - 支持多种格式（CSV/Excel/Markdown/JSON）的表格数据生成，
 *              提供常用模板（日程/费用/任务/库存），将结构化数据输出为可下载文件
 * @module services/content_generation
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { logger } = require('../../utils/logger');

// 运行时路径配置（统一管理 data/logs/uploads）
const { uploadPath, ensureDir } = require('../../config/runtimePaths');

// ============================================================
// 常量定义：表格模板与默认配置
// ============================================================

/** 默认列宽（字符数），用于 Excel 输出时自动调整列宽 */
const DEFAULT_COL_WIDTH = 15;

/** 默认空表格的表头 */
const DEFAULT_HEADERS = ['项目', '内容'];

/** 默认空表格的数据行 */
const DEFAULT_EMPTY_ROW = ['', ''];

/** 生成文件名前缀，当用户未指定文件名时使用 */
const GENERATED_FILE_PREFIX = 'generated_';

// 表格模板
const TABLE_TEMPLATES = {
    schedule: {
        headers: ['时间', '事项', '地点', '备注'],
        sample: [
            ['09:00', '晨会', '会议室A', '讨论项目进度'],
            ['14:00', '客户拜访', '客户公司', '携带样品']
        ]
    },
    expense: {
        headers: ['日期', '类别', '金额', '说明'],
        sample: [
            ['2024-01-01', '交通', '50', '打车'],
            ['2024-01-02', '餐饮', '120', '客户午餐']
        ]
    },
    task: {
        headers: ['任务', '负责人', '截止日期', '状态'],
        sample: [
            ['需求评审', '张三', '2024-01-15', '进行中'],
            ['开发完成', '李四', '2024-01-20', '待开始']
        ]
    },
    inventory: {
        headers: ['物品', '数量', '位置', '备注'],
        sample: [
            ['笔记本电脑', '5', '仓库A', 'ThinkPad T14'],
            ['显示器', '10', '仓库B', 'Dell 24寸']
        ]
    }
};

// ============================================================
// TableGenerator 类：表格生成核心逻辑
// ============================================================

class TableGenerator {
    constructor() {
        this.templates = TABLE_TEMPLATES;
    }

    /**
     * @description 根据参数生成表格文件，支持 CSV/Excel/Markdown/JSON 四种输出格式
     * @param {Object} params - 生成参数
     * @param {string} params.type - 模板类型（schedule/expense/task/inventory）
     * @param {Object|Array} params.data - 表格数据，支持 headers+rows 对象或二维数组
     * @param {string} [params.format='excel'] - 输出格式（csv/exlsx/markdown/json）
     * @param {string} [params.filename] - 输出文件名（不含扩展名）
     * @returns {Promise<{success: boolean, format: string, filepath: string, url: string, rows: number}>} 生成结果
     * @throws {Error} 当数据格式不合法或文件写入失败时抛出异常
     */
    async generate(params) {
        const { type, data, format = 'excel', filename } = params;

        try {
            // 获取或生成表格数据
            let tableData = this._prepareData(type, data);

            // 根据格式生成
            switch (format.toLowerCase()) {
                case 'csv':
                    return await this._generateCSV(tableData, filename);
                case 'excel':
                case 'xlsx':
                    return await this._generateExcel(tableData, filename);
                case 'markdown':
                case 'md':
                    return await this._generateMarkdown(tableData, filename);
                case 'json':
                    return await this._generateJSON(tableData, filename);
                default:
                    return await this._generateExcel(tableData, filename);
            }

        } catch (error) {
            logger.error('[表格生成] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 准备表格数据，按优先级从三种来源获取：直接数据 > 模板 > 简单数组
     * @param {string} type - 模板类型名称
     * @param {Object|Array} data - 用户提供的原始数据
     * @returns {{headers: Array<string>, rows: Array<Array<string>>}} 标准化的表格数据
     */
    _prepareData(type, data) {
        // 如果直接提供了数据
        if (data && (data.headers || data.rows || data.sample)) {
            return {
                headers: data.headers || [],
                rows: data.rows || data.sample || []
            };
        }

        // 如果有模板
        if (type && this.templates[type]) {
            const tmpl = this.templates[type];
            return {
                headers: tmpl.headers || [],
                rows: tmpl.sample || tmpl.rows || []
            };
        }

        // 如果是简单数据
        if (Array.isArray(data)) {
            if (data.length > 0 && Array.isArray(data[0])) {
                // 二维数组：第一行作为表头，其余作为数据行
                return {
                    headers: data[0],
                    rows: data.slice(1)
                };
            }
        }

        // 无有效数据时返回默认空表格
        return {
            headers: DEFAULT_HEADERS,
            rows: [DEFAULT_EMPTY_ROW]
        };
    }

    /**
     * @description 生成 CSV 格式文件，对单元格内容中的双引号进行转义以符合 CSV 规范
     * @param {{headers: Array, rows: Array}} tableData - 标准化表格数据
     * @param {string} filename - 输出文件名（不含扩展名）
     * @returns {Promise<{success: boolean, format: string, filepath: string, url: string, rows: number}>} 生成结果
     */
    async _generateCSV(tableData, filename) {
        const filepath = this._getFilepath(filename || 'table', 'csv');

        // 生成 CSV 内容
        const lines = [];
        lines.push(tableData.headers.join(','));

        for (const row of tableData.rows) {
            // CSV 规范要求：字段内的双引号需转义为两个双引号，整个字段用双引号包裹
            lines.push(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
        }

        fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');

        return {
            success: true,
            format: 'csv',
            filepath,
            url: `/uploads/${path.basename(filepath)}`,
            rows: tableData.rows.length
        };
    }

    /**
     * @description 生成 Excel（.xlsx）格式文件，使用 SheetJS 库创建工作簿
     * @param {{headers: Array, rows: Array}} tableData - 标准化表格数据
     * @param {string} filename - 输出文件名（不含扩展名）
     * @returns {Promise<{success: boolean, format: string, filepath: string, url: string, rows: number}>} 生成结果
     */
    async _generateExcel(tableData, filename) {
        const filepath = this._getFilepath(filename || 'table', 'xlsx');

        // 创建工作簿
        const wb = XLSX.utils.book_new();

        // 创建工作表
        const wsData = [tableData.headers, ...tableData.rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // 设置列宽，统一使用默认列宽以确保内容可读性
        ws['!cols'] = tableData.headers.map(() => ({ wch: DEFAULT_COL_WIDTH }));

        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, filepath);

        return {
            success: true,
            format: 'excel',
            filepath,
            url: `/uploads/${path.basename(filepath)}`,
            rows: tableData.rows.length
        };
    }

    /**
     * @description 生成 Markdown 表格格式文件
     * @param {{headers: Array, rows: Array}} tableData - 标准化表格数据
     * @param {string} filename - 输出文件名（不含扩展名）
     * @returns {Promise<{success: boolean, format: string, filepath: string, url: string, rows: number}>} 生成结果
     */
    async _generateMarkdown(tableData, filename) {
        const filepath = this._getFilepath(filename || 'table', 'md');

        const lines = [];

        // 表头
        lines.push(`| ${tableData.headers.join(' | ')} |`);
        lines.push(`| ${tableData.headers.map(() => '---').join(' | ')} |`);

        // 数据行
        for (const row of tableData.rows) {
            lines.push(`| ${row.join(' | ')} |`);
        }

        fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');

        return {
            success: true,
            format: 'markdown',
            filepath,
            url: `/uploads/${path.basename(filepath)}`,
            rows: tableData.rows.length
        };
    }

    /**
     * @description 生成 JSON 格式文件，将表格数据转换为对象数组（每行一个对象，以表头为键）
     * @param {{headers: Array, rows: Array}} tableData - 标准化表格数据
     * @param {string} filename - 输出文件名（不含扩展名）
     * @returns {Promise<{success: boolean, format: string, filepath: string, url: string, rows: number}>} 生成结果
     */
    async _generateJSON(tableData, filename) {
        const filepath = this._getFilepath(filename || 'table', 'json');

        // 转换为对象数组
        const rows = tableData.rows.map(row => {
            const obj = {};
            tableData.headers.forEach((header, i) => {
                obj[header] = row[i];
            });
            return obj;
        });

        fs.writeFileSync(filepath, JSON.stringify(rows, null, 2), 'utf-8');

        return {
            success: true,
            format: 'json',
            filepath,
            url: `/uploads/${path.basename(filepath)}`,
            rows: rows.length
        };
    }

    /**
     * @description 构建输出文件的完整路径，确保目标目录存在
     * @param {string} filename - 文件名（不含扩展名）
     * @param {string} ext - 文件扩展名
     * @returns {string} 文件完整路径
     */
    _getFilepath(filename, ext) {
        const outputDir = uploadPath('generated');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        // 未指定文件名时使用前缀+时间戳，避免文件名冲突
        const name = filename || `${GENERATED_FILE_PREFIX}${Date.now()}`;
        return path.join(outputDir, `${name}.${ext}`);
    }

    /**
     * @description 获取所有可用的表格模板名称列表
     * @returns {Array<string>} 模板名称数组
     */
    getTemplates() {
        return Object.keys(this.templates);
    }
}

module.exports = new TableGenerator();