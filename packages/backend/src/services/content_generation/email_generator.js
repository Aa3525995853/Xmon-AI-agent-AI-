/**
 * @file email_generator.js
 * @description 邮件生成器 - 支持模板填充和 LLM 智能撰写邮件，
 *              集成 Nodemailer 实现 SMTP 发送，提供邮件模板管理
 * @module services/content_generation
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const nodemailer = require('nodemailer');
const { logger } = require('../../utils/logger');

// ============================================================
// 常量定义：邮件模板与默认配置
// ============================================================

/** 默认 SMTP 主机地址 */
const DEFAULT_SMTP_HOST = 'smtp.gmail.com';

/** 默认 SMTP 端口 */
const DEFAULT_SMTP_PORT = 587;

// 邮件模板
const EMAIL_TEMPLATES = {
    report: {
        subject: '[{date}] {title}',
        body: `# {title}\n\n**日期**: {date}\n\n## 内容\n{content}\n\n---\n由小梦自动生成`
    },
    meeting: {
        subject: '[会议通知] {title}',
        body: `# {title}\n\n**时间**: {time}\n**地点**: {location}\n\n## 议程\n{agenda}\n\n## 备注\n{notes}\n\n---\n由小梦自动生成`
    },
    invoice: {
        subject: '[发票] {amount} - {date}',
        body: `# 发票通知\n\n**金额**: {amount}\n**日期**: {date}\n**类型**: {type}\n\n## 明细\n{details}\n\n---\n由小梦自动生成`
    },
    notification: {
        subject: '[通知] {title}',
        body: `# {title}\n\n{content}\n\n---\n由小梦自动生成`
    }
};

// ============================================================
// EmailGenerator 类：邮件生成与发送核心逻辑
// ============================================================

class EmailGenerator {
    constructor() {
        this.templates = EMAIL_TEMPLATES;
        /** SMTP 传输器缓存，避免重复创建连接 */
        this.smtpConfigs = new Map();
    }

    /**
     * @description 撰写邮件，优先使用模板填充，无匹配模板时使用 LLM 智能生成
     * @param {Object} params - 撰写参数
     * @param {string} [params.template] - 模板名称（report/meeting/invoice/notification）
     * @param {Object} params.data - 模板变量数据或 LLM 生成所需的上下文数据
     * @param {string} [params.tone='formal'] - 语气风格（formal/casual/friendly）
     * @param {string} [params.language='zh'] - 语言（zh/en）
     * @returns {Promise<{success: boolean, content: {subject: string, body: string, template: string}}>} 撰写结果
     * @throws {Error} 当模板填充或 LLM 生成失败时抛出异常
     */
    async compose(params) {
        const { template, data, tone = 'formal', language = 'zh' } = params;

        try {
            // 使用模板或直接生成
            let subject, body;

            if (template && this.templates[template]) {
                const tmpl = this.templates[template];
                subject = this._fillTemplate(tmpl.subject, data);
                body = this._fillTemplate(tmpl.body, data);
            } else {
                // 使用 LLM 生成
                const generated = await this._generateWithLLM(data, tone, language);
                subject = generated.subject;
                body = generated.body;
            }

            return {
                success: true,
                content: { subject, body, template }
            };

        } catch (error) {
            logger.error('[邮件生成] 撰写失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * @description 发送邮件，通过 SMTP 传输器将邮件发送给指定收件人
     * @param {Object} params - 发送参数
     * @param {string|Array<string>} params.to - 收件人地址，支持单个或数组
     * @param {string} params.subject - 邮件主题
     * @param {string} params.body - 邮件正文（Markdown 格式，会自动转换为 HTML）
     * @param {Array} [params.attachments=[]] - 附件列表
     * @param {Object} [params.smtpConfig] - SMTP 配置，不提供则使用环境变量默认配置
     * @returns {Promise<{success: boolean, messageId: string, accepted: Array}>} 发送结果
     * @throws {Error} 当 SMTP 认证失败或连接异常时抛出异常
     */
    async send(params) {
        const { to, subject, body, attachments, smtpConfig } = params;

        try {
            // 获取或创建 transporter
            const transporter = this._getTransporter(smtpConfig);

            // 构建邮件
            const mailOptions = {
                from: smtpConfig?.from || process.env.SMTP_FROM,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject,
                text: this._htmlToText(body),
                html: this._markdownToHtml(body),
                attachments: attachments || []
            };

            // 发送
            const info = await transporter.sendMail(mailOptions);

            logger.info('[邮件发送] 成功:', info.messageId);

            return {
                success: true,
                messageId: info.messageId,
                accepted: info.accepted
            };

        } catch (error) {
            logger.error('[邮件发送] 失败:', error);
            return {
                success: false,
                message: this._classifyEmailError(error)
            };
        }
    }

    /**
     * @description 获取或创建 SMTP 传输器，支持从参数或环境变量读取配置
     * @param {Object|string} [smtpConfig] - SMTP 配置对象或 JSON 字符串
     * @returns {Object} Nodemailer 传输器实例
     */
    _getTransporter(smtpConfig) {
        const config = smtpConfig || process.env.SMTP_CONFIG;

        if (typeof config === 'string') {
            try {
                const parsed = JSON.parse(config);
                return this._createTransporter(parsed);
            } catch (e) {
                // JSON 解析失败时回退到环境变量默认配置
            }
        }

        // 使用环境变量中的默认 SMTP 配置
        return this._createTransporter({
            host: process.env.SMTP_HOST || DEFAULT_SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || String(DEFAULT_SMTP_PORT)),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }

    /**
     * @description 创建 Nodemailer SMTP 传输器
     * @param {Object} config - SMTP 配置
     * @param {string} config.host - SMTP 主机地址
     * @param {number} config.port - SMTP 端口
     * @param {boolean} config.secure - 是否使用 SSL/TLS
     * @param {Object} config.auth - 认证信息（user + pass）
     * @returns {Object} Nodemailer 传输器实例
     */
    _createTransporter(config) {
        return nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: config.auth
        });
    }

    /**
     * @description 使用 {key} 占位符填充模板字符串
     * @param {string} template - 包含 {key} 占位符的模板字符串
     * @param {Object} data - 占位符键值对映射
     * @returns {string} 填充后的字符串
     */
    _fillTemplate(template, data) {
        let result = template;
        for (const [key, value] of Object.entries(data)) {
            result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
        }
        return result;
    }

    /**
     * @description 使用 LLM 智能生成邮件主题和正文，当无匹配模板时调用
     * @param {Object} data - 邮件上下文数据
     * @param {string} tone - 语气风格（formal/casual/friendly）
     * @param {string} language - 语言（zh/en）
     * @returns {Promise<{subject: string, body: string}>} 生成的邮件主题和正文
     */
    async _generateWithLLM(data, tone, language) {
        const llmService = require('../llm_service');

        const prompt = `请帮我撰写一封邮件。

要求：
- 语气：${tone === 'formal' ? '正式' : tone === 'casual' ? '随意' : '友好'}
- 语言：${language === 'zh' ? '中文' : '英文'}
- 内容相关：${JSON.stringify(data)}

请生成邮件主题和正文，格式为：
{
  "subject": "主题",
  "body": "正文（支持Markdown格式）"
}`;

        const result = await llmService.generateReply(prompt, '');

        try {
            // 尝试解析 LLM 返回的 JSON 格式，提取主题和正文
            const parsed = JSON.parse(result.text || result);
            return {
                subject: parsed.subject || '无主题',
                body: parsed.body || ''
            };
        } catch (e) {
            // JSON 解析失败时，将整个返回内容作为正文
            return {
                subject: '无主题',
                body: result.text || result
            };
        }
    }

    /**
     * @description 将 HTML 转换为纯文本，去除标签并还原常见实体
     * @param {string} html - HTML 内容
     * @returns {string} 纯文本内容
     */
    _htmlToText(html) {
        return html
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .trim();
    }

    /**
     * @description 将 Markdown 简单转换为 HTML，支持标题/加粗/斜体/换行
     * @param {string} md - Markdown 内容
     * @returns {string} HTML 内容
     */
    _markdownToHtml(md) {
        return md
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');
    }

    /**
     * @description 根据错误码分类邮件发送错误，返回用户友好的中文错误提示
     * @param {Error} error - Nodemailer 抛出的错误对象
     * @returns {string} 分类后的中文错误信息
     */
    _classifyEmailError(error) {
        if (error.code === 'EAUTH') {
            return 'SMTP认证失败，请检查邮箱配置';
        }
        if (error.code === 'ECONNECTION') {
            return '无法连接到邮件服务器';
        }
        if (error.code === 'EMESSAGE') {
            return '邮件内容格式错误';
        }
        return error.message || '发送失败';
    }

    /**
     * @description 获取所有可用的邮件模板名称列表
     * @returns {Array<string>} 模板名称数组
     */
    getTemplates() {
        return Object.keys(this.templates);
    }
}

module.exports = new EmailGenerator();