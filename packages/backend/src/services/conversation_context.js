/**
 * @file 对话上下文记忆
 * @description 自然语言参数补全的核心，解决代词指代问题
 *              用户说"帮我搜索这个" → 知道"这个"是什么
 *              用户说"把它复制到桌面" → 知道"它"是哪个文件
 * @module services/conversation_context
 * @version 1.0.0
 * @date 2026-06-06
 */

const fs = require('fs');
const path = require('path');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 常量定义
// ============================================================

/** 上下文有效期（30分钟无交互则过期） */
const CONTEXT_EXPIRY = 30 * 60 * 1000;
/** 上下文存储文件路径 */
const CONTEXT_FILE = dataPath('conversation_context.json');

// ============================================================
// ConversationContext 类
// ============================================================

/**
 * 对话上下文管理器
 * 用于解析代词、记忆上次提到的文件/链接/快递等
 * @class
 */
class ConversationContext {
  /**
   * 构造函数
   */
  constructor() {
    this.context = {
      lastUrl: null,
      lastUrls: [],
      lastFile: null,
      lastFiles: [],
      lastImage: null,
      lastImages: [],
      lastSearchQuery: null,
      lastExpressNumber: null,
      lastLocation: null,
      lastContact: null,
      lastMessage: null,
      lastAction: null,
      updatedAt: null
    };
    this.load();
  }

  /**
   * 从磁盘加载上下文数据
   * @returns {boolean} 是否成功加载
   */
  load() {
    try {
      if (fs.existsSync(CONTEXT_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
        // 检查是否过期
        if (data.updatedAt && (Date.now() - data.updatedAt) < CONTEXT_EXPIRY) {
          this.context = { ...this.context, ...data };
        }
      }
    } catch (_) {
      // 加载失败时使用默认上下文
    }
  }

  /**
   * 保存上下文到磁盘
   */
  save() {
    try {
      const dir = path.dirname(CONTEXT_FILE);
      ensureDir(dir);
      this.context.updatedAt = Date.now();
      fs.writeFileSync(CONTEXT_FILE, JSON.stringify(this.context, null, 2), 'utf8');
    } catch (_) {
      // 保存失败时静默忽略
    }
  }

  // 更新上下文
  update(text, metadata = {}) {
    this.load();

    // 检测 URL
    const urlPattern = /https?:\/\/[^\s<>""']+/g;
    const urls = text.match(urlPattern) || [];
    if (urls.length > 0) {
      this.context.lastUrls = [...urls, ...this.context.lastUrls].slice(0, 5);
      this.context.lastUrl = urls[0];
    }

    // 检测文件路径
    const filePatterns = [
      /[A-Za-z]:\\[\w\\]+[\w\\.]+/g,  // Windows 路径
      /\/[\w\/\.-]+\.[\w]+/g,           // Unix 路径
    ];
    let files = [];
    for (const pattern of filePatterns) {
      files = [...files, ...(text.match(pattern) || [])];
    }
    if (files.length > 0) {
      this.context.lastFiles = [...files, ...this.context.lastFiles].slice(0, 5);
      this.context.lastFile = files[0];
    }

    // 检测快递单号（常见格式）
    const expressPattern = /[A-Za-z0-9]{10,30}/g;
    const potentialExpress = text.match(expressPattern);
    if (potentialExpress) {
      // 过滤掉可能是普通数字的内容
      for (const num of potentialExpress) {
        if (num.length >= 10 && /[A-Z]/i.test(num)) {
          this.context.lastExpressNumber = num;
          break;
        }
      }
    }

    // 检测位置（简单模式）
    const locationPatterns = [
      /(?:在|去|到|来自)([^\s,，。！？]{2,10}(?:市|区|县|省|镇|村|路))/
    ];
    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        this.context.lastLocation = match[1];
        break;
      }
    }

    // 检测联系方式
    const phonePattern = /1[3-9]\d{9}/g;
    const phones = text.match(phonePattern);
    if (phones && phones.length > 0) {
      this.context.lastContact = phones[0];
    }

    // 检测搜索意图
    const searchPatterns = [
      /搜(一下|索)?(.+)/,
      /查(一下|询)?(.+)/,
      /帮我(搜|查)(.+)/,
      /look up (.+)/i,
      /search for (.+)/i
    ];
    for (const pattern of searchPatterns) {
      const match = text.match(pattern);
      if (match) {
        const query = (match[2] || match[1] || '').trim();
        if (query && query.length > 1 && query.length < 100) {
          this.context.lastSearchQuery = query;
        }
        break;
      }
    }

    // 从 metadata 更新
    if (metadata.url) this.context.lastUrl = metadata.url;
    if (metadata.file) this.context.lastFile = metadata.file;
    if (metadata.image) this.context.lastImage = metadata.image;
    if (metadata.expressNumber) this.context.lastExpressNumber = metadata.expressNumber;
    if (metadata.searchQuery) this.context.lastSearchQuery = metadata.searchQuery;
    if (metadata.location) this.context.lastLocation = metadata.location;

    this.save();
  }

  // 解析代词，返回实际内容
  resolvePronouns(text) {
    if (!text) return { resolved: text, context: this.get() };

    let resolved = text;

    // 这个 / 那个 / 它 / 这 / 那
    const pronounPatterns = [
      // 这个 + 动作
      { pattern: /(?:帮我|把|将)?这?个?(?:东?[西]|链接|网址|页面|网页|网站)/g, type: 'url' },
      { pattern: /(?:帮我|把|将)?这?个?(?:文件|文档|表格|PPT|Word)/g, type: 'file' },
      { pattern: /(?:帮我|把|将)?这?个?(?:图片|照片|截图|图)/g, type: 'image' },
      { pattern: /(?:帮我|把|将)?这?个?(?:快递|包裹|物流)/g, type: 'express' },
      { pattern: /(?:帮我|把|将)?这?个?(?:地?[址]|地方|位置)/g, type: 'location' },

      // 单独的代词
      { pattern: /这个/gi, type: 'generic' },
      { pattern: /那个/gi, type: 'generic' },
      { pattern: /它/gi, type: 'generic' },

      // 它 + 名词
      { pattern: /(?:它|这个)的?(.+)/g, type: 'generic_with_noun' }
    ];

    // 替换"这个"
    if (/这?个?(?:东?[西]|链接|网址|页面)/.test(text)) {
      if (this.context.lastUrl) {
        resolved = resolved.replace(/(?:这?个?(?:东?[西]|链接|网址|页面|网站))/, this.context.lastUrl);
      }
    }

    // 替换"它"
    if (/它/.test(text) && !/它/.test(text.replace(/它/, ''))) {
      // 如果只剩"它"一个字，检查上文是什么
      if (this.context.lastFile) {
        resolved = resolved.replace(/它/, path.basename(this.context.lastFile));
      }
    }

    // 替换"这个快递"
    if (/快递|包裹|物流/.test(text) && this.context.lastExpressNumber) {
      resolved = resolved.replace(/这?个?(?:快递|包裹|物流)/, this.context.lastExpressNumber);
    }

    return {
      resolved: resolved,
      context: this.get(),
      changed: resolved !== text
    };
  }

  // 获取当前上下文摘要（用于注入 LLM）
  getSummary() {
    this.load();
    const parts = [];

    if (this.context.lastUrl) {
      parts.push(`上次分享的链接：${this.context.lastUrl}`);
    }
    if (this.context.lastFile) {
      parts.push(`上次提到的文件：${path.basename(this.context.lastFile)}`);
    }
    if (this.context.lastExpressNumber) {
      parts.push(`上次提到的快递单号：${this.context.lastExpressNumber}`);
    }
    if (this.context.lastSearchQuery) {
      parts.push(`上次搜索的内容：${this.context.lastSearchQuery}`);
    }
    if (this.context.lastLocation) {
      parts.push(`上次提到的地点：${this.context.lastLocation}`);
    }

    return parts.length > 0
      ? `【上下文记忆】${parts.join('；')}。如果用户说"这个"、"它"等代词，优先使用以上上下文。`
      : '';
  }

  // 获取完整上下文
  get() {
    this.load();
    return { ...this.context };
  }

  // 清除上下文
  clear() {
    this.context = {
      lastUrl: null,
      lastUrls: [],
      lastFile: null,
      lastFiles: [],
      lastImage: null,
      lastImages: [],
      lastSearchQuery: null,
      lastExpressNumber: null,
      lastLocation: null,
      lastContact: null,
      lastMessage: null,
      lastAction: null,
      updatedAt: null
    };
    try {
      if (fs.existsSync(CONTEXT_FILE)) fs.unlinkSync(CONTEXT_FILE);
    } catch (_) {}
  }

  // 从 URL 列表中获取
  getLastUrl() {
    this.load();
    return this.context.lastUrl;
  }

  // 从文件列表中获取
  getLastFile() {
    this.load();
    return this.context.lastFile;
  }

  // 从快递单号获取
  getLastExpress() {
    this.load();
    return this.context.lastExpressNumber;
  }
}

// 单例
let instance = null;

function getConversationContext() {
  if (!instance) {
    instance = new ConversationContext();
  }
  return instance;
}

module.exports = {
  ConversationContext,
  getConversationContext
};
