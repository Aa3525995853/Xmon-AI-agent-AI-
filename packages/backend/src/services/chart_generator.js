/**
 * @file chart_generator.js
 * @description 图表生成服务，支持折线图、柱状图、饼图等 SVG/HTML 图表生成和 PPT 生成委托
 * @module services/chart_generator
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

// 运行时路径配置（统一管理 data/logs/uploads）
const { uploadPath, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 常量配置：图表默认参数
// ============================================================

/** 默认图表配色方案 */
const DEFAULT_COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

/** 默认图表宽度（像素） */
const DEFAULT_CHART_WIDTH = 600;

/** 默认图表高度（像素） */
const DEFAULT_CHART_HEIGHT = 400;

/** 图表内边距（像素） */
const CHART_PADDING = 60;

// ============================================================
// 图表生成服务类
// ============================================================

class ChartGeneratorService {
    /**
     * @description 构造函数，初始化输出目录
     */
    constructor() {
        this.outputDir = uploadPath('charts');
        this._ensureOutputDir();
    }

    /**
     * @description 确保输出目录存在
     * @returns {void}
     */
    _ensureOutputDir() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * @description 生成 Chart.js HTML 图表文件，可嵌入或独立查看
     * @param {Object} config - 图表配置
     * @param {string} [config.type='line'] - 图表类型（line/bar/pie/area/radar）
     * @param {string} [config.title=''] - 图表标题
     * @param {Array} config.data - 数据系列
     * @param {Array} config.labels - 标签数组
     * @param {Object} [config.options={}] - 额外选项
     * @returns {Object} 生成结果，包含 html/filename/filepath/url/chartId
     */
    generateChart(config) {
        const { type = 'line', title = '', data, labels, options = {} } = config;

        const chartId = `chart_${Date.now()}`;
        const colors = options.colors || DEFAULT_COLORS;

        // 生成 Chart.js HTML
        const htmlContent = this._generateChartJSHTML(chartId, type, title, data, labels, colors, options);
        const filename = `${chartId}.html`;
        const filepath = path.join(this.outputDir, filename);

        fs.writeFileSync(filepath, htmlContent, 'utf-8');

        return {
            success: true,
            html: htmlContent,
            filename,
            filepath,
            url: `/uploads/charts/${filename}`,
            chartId,
            type,
            title
        };
    }

    /**
     * @description 委托 PPT 生成服务生成 PPT 文件
     * @param {string} description - 用户描述
     * @returns {Promise<Object>} PPT 生成结果
     */
    async generatePPT(description) {
        try {
            const pptGenerator = require('./ppt_generator');
            return await pptGenerator.generate(description);
        } catch (e) {
            logger.error('[图表生成] PPT生成失败:', e);
            return { success: false, message: e.message };
        }
    }

    /**
     * @description 生成纯 SVG 图表文件，更轻量，支持柱状图/折线图/饼图
     * @param {Object} config - 图表配置
     * @param {string} [config.type='bar'] - 图表类型
     * @param {string} [config.title=''] - 图表标题
     * @param {Array} config.data - 数据
     * @param {Array} config.labels - 标签
     * @param {Object} [config.options={}] - 额外选项
     * @returns {Object} 生成结果，包含 svg/filename/filepath/url/chartId
     */
    generateSVG(config) {
        const { type = 'bar', title = '', data, labels, options = {} } = config;

        const chartId = `chart_${Date.now()}`;
        const colors = options.colors || DEFAULT_COLORS;

        let svg;
        switch (type) {
            case 'bar':
                svg = this._generateBarSVG(data, labels, title, colors, options);
                break;
            case 'line':
                svg = this._generateLineSVG(data, labels, title, colors, options);
                break;
            case 'pie':
                svg = this._generatePieSVG(data, labels, title, colors, options);
                break;
            default:
                svg = this._generateBarSVG(data, labels, title, colors, options);
        }

        const filename = `${chartId}.svg`;
        const filepath = path.join(this.outputDir, filename);

        fs.writeFileSync(filepath, svg, 'utf-8');

        return {
            success: true,
            svg,
            filename,
            filepath,
            url: `/uploads/charts/${filename}`,
            chartId,
            type,
            title
        };
    }

    /**
     * @description 生成 Chart.js HTML 页面，内嵌图表渲染脚本
     * @param {string} chartId - 图表DOM ID
     * @param {string} type - 图表类型
     * @param {string} title - 图表标题
     * @param {Array} data - 数据系列
     * @param {Array} labels - 标签数组
     * @param {Array} colors - 配色方案
     * @param {Object} options - 额外选项
     * @returns {string} 完整的 HTML 字符串
     */
    _generateChartJSHTML(chartId, type, title, data, labels, colors, options) {
        const width = options.width || DEFAULT_CHART_WIDTH;
        const height = options.height || DEFAULT_CHART_HEIGHT;

        const datasets = data.map((values, i) => ({
            label: options.seriesLabels?.[i] || `系列 ${i + 1}`,
            data: values,
            backgroundColor: type === 'line' ? 'rgba(79, 70, 229, 0.1)' : colors[i % colors.length],
            borderColor: colors[i % colors.length],
            borderWidth: options.borderWidth || 2,
            fill: type === 'area',
            tension: options.tension || 0.4
        }));

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${title || '图表'}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        body { margin: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        h2 { color: #333; margin-bottom: 15px; }
        .chart-container { width: ${width}px; height: ${height}px; }
    </style>
</head>
<body>
    <h2>${title || '数据图表'}</h2>
    <div class="chart-container">
        <canvas id="${chartId}"></canvas>
    </div>
    <script>
        const ctx = document.getElementById('${chartId}');
        new Chart(ctx, {
            type: '${type === 'area' ? 'line' : type}',
            data: {
                labels: ${JSON.stringify(labels || [])},
                datasets: ${JSON.stringify(datasets)}
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: ${options.showLegend !== false} },
                    title: { display: false }
                },
                scales: {
                    y: { beginAtZero: ${options.beginAtZero !== false} }
                }
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * @description 生成柱状图 SVG
     * @param {Array} data - 数据数组
     * @param {Array} labels - 标签数组
     * @param {string} title - 图表标题
     * @param {Array} colors - 配色方案
     * @param {Object} options - 额外选项
     * @returns {string} SVG 字符串
     */
    _generateBarSVG(data, labels, title, colors, options) {
        const width = options.width || DEFAULT_CHART_WIDTH;
        const height = options.height || DEFAULT_CHART_HEIGHT;
        const padding = CHART_PADDING;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;

        const flatData = data.flat ? data.flat() : data;
        const maxValue = Math.max(...flatData);
        const barWidth = chartWidth / (flatData.length || 1) * 0.6;
        const gap = chartWidth / (flatData.length || 1) * 0.4;

        let bars = '';
        flatData.forEach((value, i) => {
            const barHeight = (value / maxValue) * chartHeight;
            const x = padding + i * (barWidth + gap) + gap / 2;
            const y = height - padding - barHeight;
            const color = colors[i % colors.length];
            bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="4"/>`;
            bars += `<text x="${x + barWidth/2}" y="${height - padding + 20}" text-anchor="middle" font-size="12">${labels?.[i] || i+1}</text>`;
            bars += `<text x="${x + barWidth/2}" y="${y - 8}" text-anchor="middle" font-size="11" fill="#333">${value}</text>`;
        });

        // Y轴刻度
        let yAxis = '';
        for (let i = 0; i <= 4; i++) {
            const y = height - padding - (i / 4) * chartHeight;
            const value = Math.round((i / 4) * maxValue);
            yAxis += `<line x1="${padding - 5}" y1="${y}" x2="${padding}" y2="${y}" stroke="#999"/>`;
            yAxis += `<text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-size="11">${value}</text>`;
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <text x="${width/2}" y="30" text-anchor="middle" font-size="18" font-weight="bold">${title}</text>
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding/2}" y2="${height - padding}" stroke="#333"/>
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#333"/>
    ${yAxis}
    ${bars}
</svg>`;
    }

    /**
     * @description 生成折线图 SVG
     * @param {Array} data - 数据数组
     * @param {Array} labels - 标签数组
     * @param {string} title - 图表标题
     * @param {Array} colors - 配色方案
     * @param {Object} options - 额外选项
     * @returns {string} SVG 字符串
     */
    _generateLineSVG(data, labels, title, colors, options) {
        const width = options.width || DEFAULT_CHART_WIDTH;
        const height = options.height || DEFAULT_CHART_HEIGHT;
        const padding = CHART_PADDING;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;

        const flatData = data.flat ? data.flat() : data;
        const maxValue = Math.max(...flatData);
        const minValue = Math.min(0, ...flatData);
        const range = maxValue - minValue || 1;

        let points = '';
        let lines = '';
        flatData.forEach((value, i) => {
            const x = padding + (i / (flatData.length - 1 || 1)) * chartWidth;
            const y = height - padding - ((value - minValue) / range) * chartHeight;
            points += `<circle cx="${x}" cy="${y}" r="5" fill="${colors[0]}"/>`;
            points += `<text x="${x}" y="${height - padding + 20}" text-anchor="middle" font-size="12">${labels?.[i] || i+1}</text>`;
            if (i > 0) {
                const prevX = padding + ((i - 1) / (flatData.length - 1 || 1)) * chartWidth;
                const prevY = height - padding - ((flatData[i-1] - minValue) / range) * chartHeight;
                lines += `<line x1="${prevX}" y1="${prevY}" x2="${x}" y2="${y}" stroke="${colors[0]}" stroke-width="2"/>`;
            }
        });

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <text x="${width/2}" y="30" text-anchor="middle" font-size="18" font-weight="bold">${title}</text>
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding/2}" y2="${height - padding}" stroke="#333"/>
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#333"/>
    ${lines}
    ${points}
</svg>`;
    }

    /**
     * @description 生成饼图 SVG
     * @param {Array} data - 数据数组
     * @param {Array} labels - 标签数组
     * @param {string} title - 图表标题
     * @param {Array} colors - 配色方案
     * @param {Object} options - 额外选项
     * @returns {string} SVG 字符串
     */
    _generatePieSVG(data, labels, title, colors, options) {
        const size = options.size || 400;
        const cx = size / 2;
        const cy = size / 2;
        const radius = size * 0.35;

        const flatData = data.flat ? data.flat() : data;
        const total = flatData.reduce((a, b) => a + b, 0) || 1;

        let slices = '';
        let currentAngle = -90;
        flatData.forEach((value, i) => {
            const angle = (value / total) * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;

            const x1 = cx + radius * Math.cos(startAngle * Math.PI / 180);
            const y1 = cy + radius * Math.sin(startAngle * Math.PI / 180);
            const x2 = cx + radius * Math.cos(endAngle * Math.PI / 180);
            const y2 = cy + radius * Math.sin(endAngle * Math.PI / 180);

            const largeArc = angle > 180 ? 1 : 0;
            const color = colors[i % colors.length];
            const midAngle = (startAngle + endAngle) / 2;
            const labelRadius = radius * 1.3;
            const labelX = cx + labelRadius * Math.cos(midAngle * Math.PI / 180);
            const labelY = cy + labelRadius * Math.sin(midAngle * Math.PI / 180);

            slices += `<path d="M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}"/>`;
            slices += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="12">${labels?.[i] || ''}</text>`;

            currentAngle = endAngle;
        });

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <text x="${size/2}" y="30" text-anchor="middle" font-size="18" font-weight="bold">${title}</text>
    ${slices}
</svg>`;
    }

    /**
     * @description 从数据分析结果自动生成图表，自动选择数值列
     * @param {Object} analysisResult - 数据分析结果，包含 headers/schema/stats
     * @param {Object} [options={}] - 图表选项
     * @param {string} [options.type='bar'] - 图表类型
     * @param {string} [options.title=''] - 图表标题
     * @param {Array} [options.numericColumns=[]] - 指定数值列
     * @returns {Object} 图表生成结果
     */
    generateFromAnalysis(analysisResult, options = {}) {
        const { type = 'bar', title = '', numericColumns = [] } = options;

        // 自动选择有意义的列
        if (numericColumns.length === 0 && analysisResult.schema) {
            Object.entries(analysisResult.schema).forEach(([col, info]) => {
                if (info.type === 'number' && analysisResult.stats?.[col]?.sum > 0) {
                    numericColumns.push(col);
                }
            });
        }

        // 准备数据
        const labels = analysisResult.headers.map(h => String(h).substring(0, 20));
        const data = [numericColumns.map(col => analysisResult.stats?.[col]?.sum || 0)];

        return this.generateChart({
            type,
            title: title || analysisResult.sheetName || '数据分析图表',
            data,
            labels,
            options
        });
    }
}

module.exports = new ChartGeneratorService();