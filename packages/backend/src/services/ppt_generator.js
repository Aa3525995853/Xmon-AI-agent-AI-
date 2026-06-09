/**
 * @file ppt_generator.js
 * @description PPT 生成服务，基于 pptxgenjs + LLM 动态内容生成，支持商业计划书、工作汇报、产品介绍等多种模板
 * @module services/ppt_generator
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

require('dotenv').config();  // 确保环境变量加载

const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger } = require('../utils/logger');

// 运行时路径配置（统一管理 data/logs/uploads）
const { uploadPath, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 常量配置：PPT 生成相关参数
// ============================================================

/** LLM 生成温度参数，控制内容创造性 */
const LLM_TEMPERATURE = 0.7;

/** LLM 最大生成 token 数 */
const LLM_MAX_TOKENS = 4000;

/** LLM 请求超时时间（毫秒），2分钟 */
const LLM_TIMEOUT_MS = 120000;

/** PPT 文件名最大长度 */
const MAX_FILENAME_LENGTH = 30;

// ============================================================
// PPT 生成服务类
// ============================================================

class PPTGenerator {
    /**
     * @description 构造函数，初始化输出目录
     */
    constructor() {
        this.outputDir = uploadPath('ppt');
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
     * @description 检测用户桌面路径，优先 OneDrive 桌面
     * @returns {string} 桌面路径
     */
    _detectWorkDir() {
        const home = os.homedir();
        const candidates = [
            path.join(home, 'OneDrive', 'Desktop'),
            path.join(home, 'OneDrive', '桌面'),
            path.join(home, 'Desktop'),
            path.join(home, '桌面'),
            home
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return home;
    }

    /**
     * @description 主入口 - 根据用户描述生成PPT，包含意图解析、LLM内容生成和文件创建
     * @param {string} description - 用户描述
     * @returns {Promise<Object>} 生成结果，包含 success/filePath/downloadUrl/slides 等
     */
    async generate(description) {
        try {
            logger.info('[PPT生成] 开始生成PPT:', description);

            // 解析用户意图
            const intent = this._parseIntent(description);
            logger.info('[PPT生成] 解析意图:', intent);

            // 使用LLM生成内容
            const content = await this._generateContentWithLLM(intent);

            // 生成PPTX文件
            const result = await this._createPPTX(intent, content);

            return {
                success: true,
                message: 'PPT已生成！',
                filePath: result.filepath,
                fileName: result.filename,
                downloadUrl: result.url,
                slides: content.slides.length,
                preview: content.preview
            };

        } catch (error) {
            logger.error('[PPT生成] 失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 解析用户描述中的意图，识别模板类型和主题
     * @param {string} description - 用户描述文本
     * @returns {Object} 意图对象，包含 template/title/topic/originalDescription
     */
    _parseIntent(description) {
        const desc = description.toLowerCase();
        let template = 'generic';
        let title = 'PPT演示文稿';

        // 识别模板类型
        if (/(商业计划书|business plan|创业计划|投资计划书)/.test(description)) {
            template = 'business';
        } else if (/(工作汇报|周报|月报|日报|述职)/.test(description)) {
            template = 'report';
        } else if (/(产品介绍|产品演示)/.test(description)) {
            template = 'product';
        } else if (/(培训|课件|教学)/.test(description)) {
            template = 'training';
        } else if (/(方案|计划|提案)/.test(description)) {
            template = 'proposal';
        }

        // 识别主题 - 提取主题关键词
        let topic = '';

        // 匹配 "主题是XXX" 或 "关于XXX" 等模式
        const themePatterns = [
            /(?:主题是?|关于|主题：)\s*['"']?([^'"，,\n]+)/,
            /(?:做|生成|制作)\s*(?:一个|份)?\s*(?:商业计划书|PPT|幻灯片)\s*[,，]?\s*(?:主题是?|关于)?\s*['"']?([^'"，,\n]+)/,
            /(?:主题|题目)\s*[:：]?\s*['"']?([^'"，,\n]+)/
        ];

        for (const pattern of themePatterns) {
            const match = description.match(pattern);
            if (match && match[1]) {
                topic = match[1].trim();
                break;
            }
        }

        // 如果没找到，用关键词提取
        if (!topic) {
            const words = description.split(/[，,。.\s]+/).filter(w => w.length >= 2 && w.length <= 10);
            // 排除常见动词和助词
            const stopWords = ['商业', '计划书', 'PPT', '幻灯片', '生成', '制作', '帮我', '请', '给我', '关于', '主题'];
            topic = words.find(w => !stopWords.includes(w)) || words[0] || '';
        }

        title = topic ? `${topic}商业计划书` : '商业计划书';

        return {
            template,
            title,
            topic,
            originalDescription: description
        };
    }

    /**
     * @description 使用 LLM 生成 PPT 内容，失败时回退到默认内容
     * @param {Object} intent - 解析后的意图对象
     * @returns {Promise<Object>} 内容对象，包含 slides 数组和 preview 文本
     */
    async _generateContentWithLLM(intent) {
        const topic = intent.topic || '通用主题';

        // 构建精简的提示词
        const prompt = this._buildContentPrompt(intent);

        try {
            const axios = require('axios');
            const apiUrl = process.env.KIMI_API_URL;
            const apiKey = process.env.KIMI_API_KEY;

            if (!apiKey || !apiUrl) {
                logger.warn('[PPT生成] LLM API配置不完整');
                return this._generateDefaultContent(intent);
            }

            logger.info('[PPT生成] 调用LLM生成内容...');

            const response = await axios.post(apiUrl, {
                model: process.env.KIMI_MODEL || 'deepseek-v4-pro',
                messages: [{ role: 'user', content: prompt }],
                temperature: LLM_TEMPERATURE,
                max_tokens: LLM_MAX_TOKENS
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                timeout: LLM_TIMEOUT_MS
            });

            const content = response.data?.choices?.[0]?.message?.content;
            if (content) {
                logger.info('[PPT生成] LLM内容生成成功，长度:', content.length);
                const parsed = this._parseLLMContent(content, intent);
                if (parsed && parsed.slides && parsed.slides.length > 0) {
                    logger.info('[PPT生成] LLM内容解析成功，共', parsed.slides.length, '页');
                    return parsed;
                }
            }
        } catch (e) {
            logger.warn('[PPT生成] LLM生成失败:', e.message);
        }

        // 如果LLM失败，使用根据主题调整的默认内容
        return this._generateDefaultContent(intent);
    }

    /**
     * @description 构建发送给 LLM 的内容生成提示词
     * @param {Object} intent - 意图对象
     * @returns {string} 提示词文本
     */
    _buildContentPrompt(intent) {
        const topic = intent.topic || '通用主题';

        return `请为"${topic}"主题生成一份完整的商业计划书PPT内容。

要求：
1. 内容必须紧密围绕"${topic}"这个主题，体现行业/领域的专业性
2. 生成11页PPT内容，包括：封面、市场痛点、解决方案、产品介绍、市场分析、商业模式、竞争优势、运营数据、团队介绍、融资计划、联系方式
3. 每页需要有标题、要点列表
4. 市场分析部分要包含该主题相关的市场规模、用户数据
5. 解决方案要体现该主题的核心价值

请以JSON格式返回，格式如下：
{
  "slides": [
    {"type": "cover", "title": "封面标题", "subtitle": "副标题", "company": "公司名称"},
    {"type": "content", "title": "页面标题", "bullets": ["要点1", "要点2", "要点3"], "highlight": "高亮文字"},
    {"type": "chart", "title": "数据标题", "labels": ["Q1","Q2","Q3","Q4"], "data": [[1000,3000,8000,15000]], "highlights": ["指标1","指标2"]}
  ],
  "preview": "简要描述"
}

请只返回JSON，不要有任何其他文字：`;
    }

    /**
     * @description 解析 LLM 返回的 JSON 内容，支持 markdown 代码块包裹
     * @param {string} llmContent - LLM 返回的原始文本
     * @param {Object} intent - 意图对象
     * @returns {Object|null} 解析后的内容对象，解析失败返回 null
     */
    _parseLLMContent(llmContent, intent) {
        try {
            // 尝试提取JSON
            let jsonStr = llmContent.trim();

            // 去掉markdown代码块
            if (jsonStr.includes('```')) {
                const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (match) jsonStr = match[1].trim();
            }

            // 尝试解析JSON
            const content = JSON.parse(jsonStr);

            if (content.slides && Array.isArray(content.slides)) {
                return content;
            }
        } catch (e) {
            logger.warn('[PPT生成] JSON解析失败:', e.message);
            // 尝试提取JSON对象（可能有前后文字）
            try {
                const match = llmContent.match(/\{[\s\S]*\}/);
                if (match) {
                    const content = JSON.parse(match[0]);
                    if (content.slides && Array.isArray(content.slides)) {
                        return content;
                    }
                }
            } catch (e2) {
                logger.warn('[PPT生成] JSON二次解析失败');
            }
        }

        return null;
    }

    /**
     * @description 生成默认 PPT 内容（当 LLM 不可用时的回退方案），根据主题动态生成
     * @param {Object} intent - 意图对象
     * @returns {Object} 默认内容对象，包含 slides 数组和 preview 文本
     */
    _generateDefaultContent(intent) {
        const topic = intent.topic || intent.title.replace('商业计划书', '').trim() || '该项目';

        // 根据主题生成相关的内容
        return {
            slides: [
                {
                    type: 'cover',
                    title: `${topic}商业计划书`,
                    subtitle: '投资人路演 · 2026',
                    company: 'XX科技有限公司'
                },
                {
                    type: 'content',
                    title: '市场痛点',
                    bullets: [
                        `${topic}行业存在的主要问题和挑战`,
                        '现有解决方案的不足之处',
                        '用户未被满足的核心需求',
                        '市场痛点的规模和影响'
                    ],
                    highlight: `${topic}市场存在巨大机会`
                },
                {
                    type: 'content',
                    title: '解决方案',
                    bullets: [
                        `针对${topic}的创新解决方案`,
                        '核心技术优势和产品特点',
                        '如何解决市场痛点',
                        '差异化竞争优势'
                    ],
                    highlight: `用创新重新定义${topic}体验`
                },
                {
                    type: 'content',
                    title: '产品介绍',
                    bullets: [
                        `${topic}相关核心产品/服务`,
                        '主要功能和使用场景',
                        '目标用户群体',
                        '产品独特价值主张'
                    ],
                    highlight: '解决用户真实需求'
                },
                {
                    type: 'content',
                    title: '市场分析',
                    bullets: [
                        `${topic}市场规模和增长潜力`,
                        '目标用户画像和需求分析',
                        '竞争格局和主要对手',
                        '市场进入策略'
                    ],
                    highlight: `${topic}赛道处于快速发展期`
                },
                {
                    type: 'content',
                    title: '商业模式',
                    bullets: [
                        '产品/服务收入模式',
                        '定价策略和收费方式',
                        '渠道策略和合作伙伴',
                        '成本结构和盈利预期'
                    ],
                    highlight: '清晰可持续的商业模式'
                },
                {
                    type: 'content',
                    title: '竞争优势',
                    bullets: [
                        `${topic}领域的技术壁垒`,
                        '团队背景和行业经验',
                        '资源优势和网络效应',
                        '品牌影响力和用户口碑'
                    ],
                    highlight: '在竞争中处于领先地位'
                },
                {
                    type: 'chart',
                    title: '运营数据',
                    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
                    data: [[1000, 3000, 8000, 15000]],
                    highlights: [
                        `${topic}相关核心指标数据`,
                        '用户增长和活跃度',
                        '收入增长趋势',
                        '关键里程碑达成'
                    ]
                },
                {
                    type: 'content',
                    title: '团队介绍',
                    bullets: [
                        '创始人背景和创业经历',
                        '核心团队成员及专长',
                        '团队文化和工作方式',
                        '人才引进计划'
                    ],
                    highlight: '专业、有激情、战斗力强'
                },
                {
                    type: 'content',
                    title: '融资计划',
                    bullets: [
                        '本轮融资金额和估值',
                        '资金用途分配',
                        '下轮融资计划和时间表',
                        '长期发展目标和愿景'
                    ],
                    highlight: '高效使用每一分钱'
                },
                {
                    type: 'contact',
                    title: '联系我们',
                    contact: 'business@example.com',
                    phone: '400-XXX-XXXX',
                    website: 'www.example.com'
                }
            ],
            preview: `【${topic}商业计划书】共11页，涵盖市场分析、商业模式、融资计划等核心内容`
        };
    }

    /**
     * @description 创建 PPTX 文件，根据内容数据生成各类型幻灯片
     * @param {Object} intent - 意图对象
     * @param {Object} content - 内容对象，包含 slides 数组
     * @returns {Promise<Object>} 文件信息，包含 filepath/filename/url
     */
    async _createPPTX(intent, content) {
        const pptx = new PptxGenJS();

        // 设置演示文稿属性
        pptx.author = '小梦AI';
        pptx.title = intent.title;
        pptx.subject = intent.template;
        pptx.company = '';

        // 主题配色
        const theme = {
            primary: '2563EB',    // 蓝色
            secondary: '1E40AF',  // 深蓝
            accent: '3B82F6',     // 亮蓝
            text: '1F2937',       // 深灰
            light: 'F3F4F6',      // 浅灰
            white: 'FFFFFF'
        };

        // 生成每一页幻灯片
        for (let i = 0; i < content.slides.length; i++) {
            const slideData = content.slides[i];
            const slide = pptx.addSlide();

            switch (slideData.type) {
                case 'cover':
                    this._createCoverSlide(slide, slideData, theme);
                    break;
                case 'content':
                    this._createContentSlide(slide, slideData, theme);
                    break;
                case 'chart':
                    this._createChartSlide(slide, slideData, theme, pptx);
                    break;
                case 'contact':
                    this._createContactSlide(slide, slideData, theme);
                    break;
                default:
                    this._createContentSlide(slide, slideData, theme);
            }
        }

        // 保存文件
        const safeTitle = intent.title.replace(/[^\w一-龥]/g, '_').substring(0, MAX_FILENAME_LENGTH);
        const filename = `${safeTitle}_${Date.now()}.pptx`;
        const filepath = path.join(this.outputDir, filename);
        const url = `/uploads/ppt/${filename}`;

        await pptx.writeFile({ fileName: filepath });

        logger.info('[PPT生成] 文件已保存:', filepath);

        return { filepath, filename, url };
    }

    /**
     * @description 创建封面页幻灯片
     * @param {Object} slide - pptxgenjs slide 对象
     * @param {Object} data - 封面数据，包含 title/subtitle/company
     * @param {Object} theme - 主题配色
     * @returns {void}
     */
    _createCoverSlide(slide, data, theme) {
        slide.background = { color: theme.primary };

        slide.addText(data.title, {
            x: 0.5, y: 2.5, w: 9, h: 1.2,
            fontSize: 44, fontFace: 'Microsoft YaHei',
            color: theme.white, bold: true, align: 'center'
        });

        if (data.subtitle) {
            slide.addText(data.subtitle, {
                x: 0.5, y: 3.8, w: 9, h: 0.6,
                fontSize: 20, fontFace: 'Microsoft YaHei',
                color: theme.light, align: 'center'
            });
        }

        if (data.company) {
            slide.addText(data.company, {
                x: 0.5, y: 4.6, w: 9, h: 0.5,
                fontSize: 16, fontFace: 'Microsoft YaHei',
                color: theme.light, align: 'center'
            });
        }

        slide.addShape('rect', {
            x: 3.5, y: 1.8, w: 3, h: 0.05,
            fill: { color: theme.white }
        });
    }

    /**
     * @description 创建内容页幻灯片，包含标题、要点列表和高亮文字
     * @param {Object} slide - pptxgenjs slide 对象
     * @param {Object} data - 内容数据，包含 title/bullets/highlight
     * @param {Object} theme - 主题配色
     * @returns {void}
     */
    _createContentSlide(slide, data, theme) {
        slide.addShape('rect', {
            x: 0, y: 0, w: 10, h: 1,
            fill: { color: theme.primary }
        });

        slide.addText(data.title, {
            x: 0.5, y: 0.2, w: 9, h: 0.6,
            fontSize: 28, fontFace: 'Microsoft YaHei',
            color: theme.white, bold: true, margin: 0
        });

        if (data.bullets && data.bullets.length > 0) {
            const bulletItems = data.bullets.map((item, idx) => ({
                text: item,
                options: { bullet: true, breakLine: idx < data.bullets.length - 1 }
            }));

            slide.addText(bulletItems, {
                x: 0.8, y: 1.4, w: 8.4, h: 3.5,
                fontSize: 18, fontFace: 'Microsoft YaHei',
                color: theme.text, valign: 'top',
                paraSpaceAfter: 12
            });
        }

        if (data.highlight) {
            slide.addShape('roundRect', {
                x: 0.5, y: 5.0, w: 9, h: 0.6,
                fill: { color: theme.accent, transparency: 15 },
                line: { color: theme.accent, width: 1 }
            });

            slide.addText(data.highlight, {
                x: 0.5, y: 5.0, w: 9, h: 0.6,
                fontSize: 14, fontFace: 'Microsoft YaHei',
                color: theme.primary, align: 'center', valign: 'middle'
            });
        }

        slide.addText('— 1 —', {
            x: 8.5, y: 5.3, w: 1, h: 0.3,
            fontSize: 10, color: '999999', align: 'center'
        });
    }

    /**
     * @description 创建图表页幻灯片，包含数据表格和要点列表
     * @param {Object} slide - pptxgenjs slide 对象
     * @param {Object} data - 图表数据，包含 title/labels/data/highlights
     * @param {Object} theme - 主题配色
     * @param {Object} pptx - pptxgenjs 实例
     * @returns {void}
     */
    _createChartSlide(slide, data, theme, pptx) {
        slide.addShape('rect', {
            x: 0, y: 0, w: 10, h: 1,
            fill: { color: theme.primary }
        });

        slide.addText(data.title, {
            x: 0.5, y: 0.2, w: 9, h: 0.6,
            fontSize: 28, fontFace: 'Microsoft YaHei',
            color: theme.white, bold: true, margin: 0
        });

        // 显示数据表格
        if (data.labels && data.data) {
            const tableRows = [
                ['', ...data.labels],
                ['数据', ...(Array.isArray(data.data[0]) ? data.data[0] : data.data)]
            ];
            slide.addTable(tableRows, {
                x: 0.5, y: 1.3, w: 9, h: 1.5,
                colW: [1, 2, 2, 2, 2],
                border: { pt: 0.5, color: theme.light },
                fontFace: 'Microsoft YaHei',
                fontSize: 12,
                align: 'center',
                valign: 'middle'
            });
        }

        if (data.highlights && data.highlights.length > 0) {
            slide.addText(data.highlights.map((item, idx) => ({
                text: item,
                options: { bullet: true, breakLine: idx < data.highlights.length - 1 }
            })), {
                x: 0.8, y: 3.0, w: 8.4, h: 2.0,
                fontSize: 16, fontFace: 'Microsoft YaHei',
                color: theme.text, valign: 'top',
                paraSpaceAfter: 10
            });
        }
    }

    /**
     * @description 创建联系方式页幻灯片
     * @param {Object} slide - pptxgenjs slide 对象
     * @param {Object} data - 联系数据，包含 title/contact/phone/website
     * @param {Object} theme - 主题配色
     * @returns {void}
     */
    _createContactSlide(slide, data, theme) {
        slide.background = { color: theme.primary };

        slide.addText(data.title, {
            x: 0.5, y: 1.5, w: 9, h: 0.8,
            fontSize: 36, fontFace: 'Microsoft YaHei',
            color: theme.white, bold: true, align: 'center'
        });

        const contactItems = [];
        if (data.contact) contactItems.push(`📧 邮箱：${data.contact}`);
        if (data.phone) contactItems.push(`📞 电话：${data.phone}`);
        if (data.website) contactItems.push(`🌐 网站：${data.website}`);

        if (contactItems.length > 0) {
            slide.addText(
                contactItems.map((item, idx) => ({
                    text: item,
                    options: { breakLine: idx < contactItems.length - 1 }
                })),
                {
                    x: 2, y: 2.8, w: 6, h: 2,
                    fontSize: 18, fontFace: 'Microsoft YaHei',
                    color: theme.white, align: 'center',
                    paraSpaceAfter: 16
                }
            );
        }

        slide.addText('感谢您的关注！', {
            x: 0.5, y: 4.5, w: 9, h: 0.6,
            fontSize: 24, fontFace: 'Microsoft YaHei',
            color: theme.light, align: 'center'
        });
    }

    /**
     * @description 获取支持的 PPT 模板列表
     * @returns {Array<Object>} 模板列表，每项包含 id/name/description
     */
    getTemplates() {
        return [
            { id: 'business', name: '商业计划书', description: '包含市场分析、竞品、财务等核心模块' },
            { id: 'report', name: '工作汇报', description: '日报、周报、月报模板' },
            { id: 'product', name: '产品介绍', description: '产品功能和特点展示' },
            { id: 'training', name: '培训课件', description: '教学和培训材料' },
            { id: 'generic', name: '通用模板', description: '基础演示文稿' }
        ];
    }
}

module.exports = new PPTGenerator();