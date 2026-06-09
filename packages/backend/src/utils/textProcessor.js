/**
 * @file textProcessor.js
 * @description 文本处理工具模块，提供文本清洗、格式化、分割、Markdown 转换、
 *              情绪提取、敏感信息检测等通用功能，服务于聊天回复处理和 TTS 文本预处理
 * @module utils/textProcessor
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：常量定义
// 功能说明：定义句子边界正则、风格标签白名单、复杂问题关键词等常量
// ============================================================

/**
 * 句子边界正则
 */
const SENTENCE_BOUNDARY = /[。！？.!?]/;

/**
 * 允许的风格标签白名单
 */
const ALLOWED_STYLES = [
    '开心', '悲伤', '生气', '惊讶',
    '调皮', '温柔', '俏皮', '撒娇',
    '悄悄话', '夹子音', '台湾腔',
    '东北话', '四川话', '河南话', '粤语',
    '唱歌', '变快', '变慢', '平静'
];

/**
 * 复杂问题关键词
 */
const COMPLEX_KEYWORDS = [
    '怎么', '如何', '为什么', '解释', '分析', '代码', '编程', '算法',
    '计算', '数学', '逻辑', '推理', '步骤', '教程', '方法', '方案',
    '比较', '区别', '差异', '优缺点', '评价', '建议', '规划', '计划',
    '生成', '写一篇', '写一个', '翻译', '总结', '概括', '提取',
    '是什么', '什么意思', '原理', '机制', '流程', '架构', '设计',
    '表演', '绝活', '才艺', '展示'
];

/**
 * 书面语到口语的映射
 */
const ORAL_MAPPINGS = {
    '首先': '第一呢',
    '其次': '然后啊',
    '再次': '还有啊',
    '最后': '最后呢',
    '总之': '总的来说啊',
    '综上所述': '所以啊',
    '但是': '不过呢',
    '然而': '可是啊',
    '因此': '所以啊',
    '因为': '因为嘛',
    '非常': '挺',
    '十分': '挺',
    '极其': '特别',
    '相当': '挺'
};

/**
 * 填充词映射
 */
const FILLERS = {
    neutral: ['呃……', '那个……', '我想啊……', '其实吧……'],
    happy: ['哎呀……', '对了……', '嘿……'],
    sad: ['唉……', '那个……', '说实话……'],
    thinking: ['嗯……', '让我想想……', '这个嘛……']
};

// ============================================================
// 模块名称：风格标签与情绪提取
// 功能说明：提取文本中的情绪标签，支持 <style> 和括号两种格式
// ============================================================

/**
 * @description 提取 <style>情绪</style> 标签或括号内的情绪标记
 * @param {string} text - 原始文本
 * @returns {{emotion: string, text: string}} 提取的情绪和剩余文本
 */
function extractStyleTag(text) {
    const parenMatch = text.match(/^\(([^)]+)\)\s*(.*)/);
    if (parenMatch) {
        return { emotion: parenMatch[1], text: parenMatch[2].trim() };
    }
    const match = text.match(/^<style>(.*?)<\/style>(.*)/);
    if (match) {
        return { emotion: match[1], text: match[2].trim() };
    }
    return { emotion: '调皮', text: text.trim() };
}

// ============================================================
// 模块名称：意图检测与文本分类
// 功能说明：检测用户输入的意图类型和复杂度
// ============================================================

/**
 * @description 检测用户输入的意图类型，根据关键词判断是编程任务还是日常聊天
 * @param {string} userText - 用户输入文本
 * @returns {'coding'|'chat'} 意图类型：coding 为编程任务，chat 为日常聊天
 */
function detectIntent(userText) {
    const codeKeywords = /代码|编程|报错|bug|前端|后端|脚本|写个|怎么实现|函数|变量|html|css|js|python|java|程序|开发|框架|库|api|数据库|sql|算法|数据结构|正则|表达式|组件|模块|类|接口|调试|错误|异常|git|github|docker|服务器|部署|修改|改一下|改了|修复/i;
    if (!codeKeywords.test(userText)) {
        return 'chat';
    }

    // 有明确行动指示的请求 → coding
    const actionablePatterns = /帮我(写|生成|创建|制作|开发|实现|改|修复)|写一个|生成一个|创建一个|写段|写个(脚本|程序|函数|代码)|把(报错|错误|问题)修复/i;
    if (actionablePatterns.test(userText)) {
        return 'coding';
    }

    // 【修复】即使模糊的请求，只要涉及代码/技术问题，也应该标记为 task
    // 让 LLM 来决定是否需要主动追问
    return 'coding';
}

/**
 * 根据文本内容获取最大 token 数
 * @param {string} text - 用户输入文本
 * @returns {number} 最大 token 数
 */
function getMaxTokens(text) {
    // 故事类请求：需要长回复
    if (/讲.*故事|童话|寓言|传说|小说|续写/.test(text)) {
        return 1500;
    }

    // 食谱/教程/步骤类请求：需要长回复
    if (/食谱|做法|怎么做|烹饪|炒菜|做菜|食材|配料|步骤|教程/.test(text)) {
        return 1000;
    }

    // 数学/计算/分析类：需要较长的回复
    if (/计算|求解|证明|分析|推导|方程|微积分|积分|求.*解|模型|公式|定理|欧拉|拉普拉斯|浓度|稀释|溶质|溶剂|溶液|盐.*水|微分|积分/.test(text)) {
        return 8000;
    }

    // 复杂问题：中等长度
    if (COMPLEX_KEYWORDS.some(kw => text.includes(kw))) {
        return 600;
    }

    // 简单对话：短回复
    return 300;
}

/**
 * @description 判断文本是否包含复杂问题关键词
 * @param {string} text - 用户输入文本
 * @returns {boolean} 是否为复杂问题
 */
function isComplexQuestion(text) {
    return COMPLEX_KEYWORDS.some(kw => text.includes(kw));
}

// ============================================================
// 模块名称：句子分割与合并
// 功能说明：按句子边界分割文本，合并短句以减少 TTS 调用次数
// ============================================================

/**
 * @description 按句子边界（。！？.!?；；）分割文本，超过50字的片段强制截断
 * @param {string} text - 原始文本
 * @returns {string[]} 句子数组
 */
function splitBySentence(text) {
    let sentences = [];
    let current = '';
    for (const char of text) {
        current += char;
        if (SENTENCE_BOUNDARY.test(char) || current.length >= 50) {
            current = current.trim();
            if (current) sentences.push(current);
            current = '';
        }
    }
    if (current.trim()) sentences.push(current.trim());
    return sentences;
}

/**
 * @description 合并短句（总长度小于30字的相邻句子），减少 TTS 调用次数
 * @param {string[]} sentences - 句子数组
 * @returns {string[]} 合并后的句子数组
 */
function mergeShortSentences(sentences) {
    if (sentences.length <= 1) return sentences;
    const merged = [];
    let buf = '';
    for (const s of sentences) {
        if (buf.length + s.length < 30) {
            buf += s;
        } else {
            if (buf) merged.push(buf);
            buf = s;
        }
    }
    if (buf) merged.push(buf);
    return merged;
}

// ============================================================
// 模块名称：HTML/代码/表情清理
// 功能说明：移除文本中的 HTML 标签、代码块、表情符号和颜文字
// ============================================================

/**
 * @description 删除文本中的 HTML 标签（div、span、br、p 等），br 和 p 转换为换行
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function removeHtmlTags(text) {
    let cleaned = text;
    cleaned = cleaned.replace(/<div[^>]*>/g, '');
    cleaned = cleaned.replace(/<\/div>/g, '');
    cleaned = cleaned.replace(/<span[^>]*>/g, '');
    cleaned = cleaned.replace(/<\/span>/g, '');
    cleaned = cleaned.replace(/<br\s*\/?>/g, '\n');
    cleaned = cleaned.replace(/<p[^>]*>/g, '\n');
    cleaned = cleaned.replace(/<\/p>/g, '');
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    return cleaned;
}

/**
 * @description 删除文本中的代码块（三反引号和单反引号包裹的内容）
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function removeCodeBlocks(text) {
    let cleaned = text.replace(/```[\s\S]*?```/g, '');
    cleaned = cleaned.replace(/`[^`]*`/g, '');
    return cleaned;
}

/**
 * 
 */
function removeEmojis(text) {
    // 1. 过滤 Unicode Emoji
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]/gu;
    let cleaned = text.replace(emojiRegex, '');

    // 2. 过滤颜文字 - 匹配括号内的颜文字
    const kaomojiRegex = /[（\(][^）\(\n]{0,30}[｡◠‿◕╯°□´•ᵕ✿♥┻━︵╮╭╰╯][^）\(\n]{0,30}[）\)]/gu;
    cleaned = cleaned.replace(kaomojiRegex, (match) => {
        const kaomojiChars = (match.match(/[｡◠‿◕╯°□´•ᵕ✿♥┻━︵╮╭╰╯]/gu) || []).length;
        return kaomojiChars >= 2 ? '' : match;
    });

    // 3. 过滤残留的颜文字符号组合
    const residualKaomojiRegex = /[╯╮╭╰][︵┻━┳]+/gu;
    cleaned = cleaned.replace(residualKaomojiRegex, '');
    cleaned = cleaned.replace(/[┻━┳]+/gu, '');

    // 4. 过滤单独的颜文字字符
    const kaomojiCharsRegex = /[｡◠‿◕╯°□´•ᵕ✿♥┻━┳╮╭╰╯･ω・∀▽△▿▵◡⊙◉◐◑◒◓☆★✧✦♡❤❥❣❦❧︵]/gu;
    cleaned = cleaned.replace(kaomojiCharsRegex, '');

    return cleaned;
}

/**
 * 删除括号内的内容
 * @description @p文本中aram {（中文括号和英文括号）string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function removeBracketContent(text) {
    let cleaned = text.replace(/（[^）]*）/g, '');
    cleaned = cleaned.replace(/\([^)]*\)/g, '');
    return cleaned;
}

/**
 * @description 清理文本中的多余空白字符，合并连续空格，移除标点后的多余空格
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function cleanWhitespace(text) {
    return text
        .replace(/\s+/g, ' ')
        .replace(/，\s+/g, '，')
        .replace(/。\s+/g, '。')
        .replace(/！\s+/g, '！')
        .replace(/？\s+/g, '？')
        .trim();
}

function stripMarkdown(text) {
    let cleaned = text;
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/__(.+?)__/g, '$1');
    cleaned = cleaned.replace(/_(.+?)_/g, '$1');
    cleaned = cleaned.replace(/~~(.+?)~~/g, '$1');
    cleaned = cleaned.replace(/`{3}[\s\S]*?`{3}/g, '');
    cleaned = cleaned.replace(/`(.+?)`/g, '$1');
    cleaned = cleaned.replace(/^\|(.+)\|$/gm, (match) => {
        return match.split('|').filter(c => c.trim() && !/^[-:\s]+$/.test(c)).map(c => c.trim()).join('，');
    });
    cleaned = cleaned.replace(/^[-*+]\s+/gm, '');
    cleaned = cleaned.replace(/^\d+\.\s+/gm, '');
    cleaned = cleaned.replace(/^>\s+/gm, '');
    cleaned = cleaned.replace(/^---+$/gm, '');
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned;
}

/**
 * @description 将行内 Markdown 语法转换为 HTML 标签（加粗、斜体、删除线、代码、链接）
 * @param {string} text - 包含行内 Markdown 语法的文本
 * @returns {string} 转换后的 HTML 文本
 */
function inlineMd(text) {
    let r = text;
    r = r.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    r = r.replace(/\*(.+?)\*/g, '<em>$1</em>');
    r = r.replace(/~~(.+?)~~/g, '<del>$1</del>');
    r = r.replace(/`(.+?)`/g, '<code>$1</code>');
    r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return r;
}

function buildTable(rows) {
    if (rows.length === 0) return '';
    let html = '<table>';
    let isHeader = true;
    for (const row of rows) {
        if (/^\|[\s:|-]+\|$/.test(row)) { isHeader = false; continue; }
        const cells = row.replace(/^\|/, '').replace(/\|$/, '').split('|');
        const tag = isHeader ? 'th' : 'td';
        html += '<tr>';
        for (const cell of cells) {
            html += `<${tag}>${inlineMd(cell.trim())}</${tag}>`;
        }
        html += '</tr>';
        if (isHeader) isHeader = false;
    }
    html += '</table>';
    return html;
}

/**
 * @description 将列表项数组转换为 HTML 列表（有序或无序）
 * @param {string[]} items - 列表项数组
 * @param {string} type - 列表类型：'ol' 为有序列表，其他为无序列表
 * @returns {string} HTML 列表字符串
 */
function buildList(items, type) {
    if (items.length === 0) return '';
    const tag = type === 'ol' ? 'ol' : 'ul';
    let html = `<${tag}>`;
    for (const item of items) {
        html += `<li>${inlineMd(item)}</li>`;
    }
    html += `</${tag}>`;
    return html;
}

function closeBlocks(result, inTable, tableRows, inList, listType, listItems) {
    if (inTable) result.push(buildTable(tableRows));
    if (inList) result.push(buildList(listItems, listType));
}

/**
 * @description 将完整的 Markdown 文本转换为 HTML，支持标题、表格、列表、分隔线、段落等
 * @param {string} text - Markdown 格式文本
 * @returns {string} 转换后的 HTML 字符串
 */
function markdownToHtml(text) {
    if (!text || typeof text !== 'string') return '';

    const lines = text.split('\n');
    let result = [];
    let inTable = false;
    let tableRows = [];
    let inList = false;
    let listType = '';
    let listItems = [];

    for (let i = 0; i < lines.length; i++) {
        let trimmed = lines[i].trim();

        if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
            closeBlocks(result, inTable, tableRows, inList, listType, listItems);
            inTable = false; tableRows = [];
            inList = false; listItems = [];
            result.push('<hr>');
            continue;
        }

        const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headerMatch) {
            closeBlocks(result, inTable, tableRows, inList, listType, listItems);
            inTable = false; tableRows = [];
            inList = false; listItems = [];
            const level = headerMatch[1].length;
            result.push(`<h${level}>${inlineMd(headerMatch[2])}</h${level}>`);
            continue;
        }

        if (/^\|(.+)\|$/.test(trimmed)) {
            if (inList) {
                result.push(buildList(listItems, listType));
                inList = false; listItems = [];
            }
            if (!inTable) { inTable = true; tableRows = []; }
            tableRows.push(trimmed);
            continue;
        } else if (inTable) {
            result.push(buildTable(tableRows));
            inTable = false; tableRows = [];
        }

        const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        if (ulMatch) {
            if (inTable) {
                result.push(buildTable(tableRows));
                inTable = false; tableRows = [];
            }
            if (!inList || listType !== 'ul') {
                if (inList) result.push(buildList(listItems, listType));
                inList = true; listType = 'ul'; listItems = [];
            }
            listItems.push(ulMatch[1]);
            continue;
        }

        const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            if (inTable) {
                result.push(buildTable(tableRows));
                inTable = false; tableRows = [];
            }
            if (!inList || listType !== 'ol') {
                if (inList) result.push(buildList(listItems, listType));
                inList = true; listType = 'ol'; listItems = [];
            }
            listItems.push(olMatch[1]);
            continue;
        }

        if (inList) {
            result.push(buildList(listItems, listType));
            inList = false; listItems = [];
        }

        if (trimmed === '') continue;

        result.push(`<p>${inlineMd(trimmed)}</p>`);
    }

    closeBlocks(result, inTable, tableRows, inList, listType, listItems);

    return result.join('\n');
}

// ============================================================
// 模块名称：书面化文本清理与口语化改造
// 功能说明：移除书面化停顿词、省略号，将书面语转为口语
// ============================================================

/**
 * @description 删除书面化停顿词和省略号，清理重复标点
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function removeWrittenFillers(text) {
    let cleaned = text;
    
    // 删除省略号
    cleaned = cleaned.replace(/\.{3,}/g, '');
    cleaned = cleaned.replace(/…{2,}/g, '');
    cleaned = cleaned.replace(/\.\s*\.\s*\./g, '');
    
    // 删除书面化停顿词
    const fillers = [
        '嗯…', '嗯...', '嗯……',
        '就是这样', '就是', '这样',
        '那个…', '那个...', '那个……',
        '这个…', '这个...', '这个……',
        '啊…', '啊...', '啊……',
        '呃…', '呃...', '呃……'
    ];
    
    for (const filler of fillers) {
        const pattern = new RegExp(filler.replace(/\./g, '\\.').replace(/…/g, '…'), 'gi');
        cleaned = cleaned.replace(pattern, '');
    }
    
    cleaned = cleaned.replace(/[^\S\n]+/g, ' ');
    cleaned = cleaned.replace(/，+/g, '，');
    cleaned = cleaned.replace(/。+/g, '。');
    cleaned = cleaned.replace(/！+/g, '！');
    cleaned = cleaned.replace(/？+/g, '？');
    
    return cleaned.trim();
}

/**
 * 口语化改造
 * @param {string} text - 原始文本
 * @returns {string} 口语化后的文本
 */
function oralize(text) {
    let oralized = text;
    for (const [written, oral] of Object.entries(ORAL_MAPPINGS)) {
        const regex = new RegExp(written, 'g');
        oralized = oralized.replace(regex, oral);
    }
    return oralized;
}

/**
 * 智能添加填充词
 * @param {string} text - 原始文本
 * @param {string} emotion - 情绪类型
 * @returns {string} 添加填充词后的文本
 */
function addFillers(text, emotion = 'neutral') {
    if (Math.random() < 0.3 && !text.includes('……')) {
        const emotionFillers = FILLERS[emotion] || FILLERS.neutral;
        const filler = emotionFillers[Math.floor(Math.random() * emotionFillers.length)];

        if (text.startsWith('<style>')) {
            const styleEnd = text.indexOf('</style>') + 8;
            return text.slice(0, styleEnd) + filler + text.slice(styleEnd);
        }
        const parenMatch = text.match(/^(\([^)]+\))\s*/);
        if (parenMatch) {
            return parenMatch[1] + filler + text.slice(parenMatch[0].length);
        }
        return filler + text;
    }
    return text;
}

/**
 * @description 从文本中提取情绪标签，支持括号格式和 <style> 标签格式，
 *              也支持通过关键词检测情绪，默认返回"调皮"
 * @param {string} text - 原始文本
 * @returns {string} 情绪标签（开心/悲伤/生气/惊讶/温柔/调皮）
 */
function extractEmotion(text) {
    const parenMatch = text.match(/^\(([^)]+)\)/);
    if (parenMatch) {
        const raw = parenMatch[1];
        const tokens = raw.split(/\s+/);
        const emotionMap = {
            '开心': '开心', '悲伤': '悲伤', '生气': '生气',
            '惊讶': '惊讶', '温柔': '温柔', '调皮': '调皮',
            '俏皮': '调皮', '撒娇': '调皮', '平静': '温柔',
            'calm': '温柔', 'happy': '开心', 'sad': '悲伤',
        };
        for (const token of tokens) {
            if (emotionMap[token]) return emotionMap[token];
        }
    }
    const styleMatch = text.match(/<style>(.*?)<\/style>/);
    if (styleMatch) {
        const raw = styleMatch[1];
        const emotionMap = {
            '开心': '开心', '悲伤': '悲伤', '生气': '生气',
            '惊讶': '惊讶', '温柔': '温柔', '调皮': '调皮',
            '俏皮': '调皮', '撒娇': '调皮', '平静': '温柔',
            'calm': '温柔', 'happy': '开心', 'sad': '悲伤',
        };
        return emotionMap[raw] || '开心';
    }
    if (/开心|高兴|快乐|哈哈|嘻嘻|耶|太棒/.test(text)) return '开心';
    if (/难过|伤心|呜呜|失望|遗憾/.test(text)) return '悲伤';
    if (/生气|讨厌|烦|愤怒/.test(text)) return '生气';
    if (/哇|天哪|真的吗|不会吧|竟然/.test(text)) return '惊讶';
    return '调皮';
}

// ============================================================
// 模块名称：显示文本清理
// 功能说明：清理文本用于前端显示，保留 Markdown 转 HTML
// ============================================================

/**
 * @description 清理文本用于前端显示，移除风格标签、情绪前缀、HTML 标签、
 *              代码块和表情符号，并将 Markdown 转换为 HTML
 * @param {string} text - 原始文本
 * @returns {string} 清理后的 HTML 文本
 */
function cleanForDisplay(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let cleaned = text;
    cleaned = removeWrittenFillers(cleaned);
    cleaned = cleaned.replace(/<style>.*?<\/style>/gs, '');
    cleaned = cleaned.replace(/^\([^)]+\)\s*/g, '');

    for (const emotion of ALLOWED_STYLES) {
        const beginPattern = new RegExp(`^${emotion}[\\s，。！？、]*`, 'i');
        cleaned = cleaned.replace(beginPattern, '');
    }

    cleaned = removeHtmlTags(cleaned);
    cleaned = removeCodeBlocks(cleaned);
    cleaned = removeEmojis(cleaned);
    cleaned = markdownToHtml(cleaned);
    
    return cleaned;
}

/**
 * 检测文本是否包含敏感信息（API Key、密钥等）
 * @returns {boolean} 是否包含敏感信息
 */
function containsSensitiveInfo(text) {
    if (!text || typeof text !== 'string') return false;

    // OpenAI / Anthropic / 通用 API Key 格式: sk-xxxxxxxx
    if (/\b(sk-[a-zA-Z0-9]{20,})\b/.test(text)) return true;

    // 其他常见密钥格式
    if (/\b(ak-[a-zA-Z0-9]{16,})\b/i.test(text)) return true;
    if (/\b(pk-[a-zA-Z0-9]{16,})\b/i.test(text)) return true;
    if (/\b(bearer\s+[a-zA-Z0-9_\-\.]{20,})\b/i.test(text)) return true;

    // 十六进制密钥 (32位以上)
    if (/\b[a-f0-9]{32,}\b/i.test(text)) return true;

    // Base64 编码的长字符串 (40字符以上)
    const base64Match = text.match(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g);
    if (base64Match) {
        for (const match of base64Match) {
            if (/^[A-Za-z0-9+/]*={0,2}$/.test(match)) return true;
        }
    }

    return false;
}

// ============================================================
// 模块名称：TTS 文本清理
// 功能说明：清理文本用于语音合成，移除不适合朗读的内容
// ============================================================

/**
 * @description 清理文本用于 TTS 语音合成。如果包含敏感信息则返回空字符串（不进行 TTS），
 *              否则依次移除风格标签、情绪前缀、Markdown、HTML、代码块、表情、括号内容和特殊符号
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本，包含敏感信息时返回空字符串
 */
function cleanForTTS(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // 如果包含敏感信息，不进行TTS
    if (containsSensitiveInfo(text)) {
        return '';
    }

    let cleaned = text;
    cleaned = removeWrittenFillers(cleaned);
    cleaned = cleaned.replace(/<style>.*?<\/style>/gs, '');
    cleaned = cleaned.replace(/^\([^)]+\)\s*/g, '');

    for (const emotion of ALLOWED_STYLES) {
        const beginPattern = new RegExp(`^${emotion}[\\s，。！？、]*`, 'i');
        cleaned = cleaned.replace(beginPattern, '');
    }

    cleaned = stripMarkdown(cleaned);
    cleaned = removeHtmlTags(cleaned);
    cleaned = removeCodeBlocks(cleaned);
    cleaned = removeEmojis(cleaned);
    cleaned = removeBracketContent(cleaned);

    // TTS 专用清理：移除特殊符号和 URL
    cleaned = cleanForTTSSymbols(cleaned);

    cleaned = cleanWhitespace(cleaned);

    return cleaned;
}

/**
 * 清理 TTS 中不适合朗读的符号
 * - 移除 / \ 命令行符号（但保留中文斜杠如 G2/G6 路径格式）
 * - 移除 URL
 * - 清理连续符号
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function cleanForTTSSymbols(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let cleaned = text;

    // 移除 URL
    cleaned = cleaned.replace(/https?:\/\/[^\s，、。！？；：""''（）()]+/gi, '');
    cleaned = cleaned.replace(/www\.[^\s，、。！？；：""''（）()]+/gi, '');

    // 移除命令行符号 / 但保留中文斜杠（如 G2/G6 格式）
    cleaned = removeCommandSlashes(cleaned);

    // 移除反引号 ` 但保留中文引号
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
    cleaned = cleaned.replace(/^`+$/gm, '');

    // 移除连续符号
    cleaned = cleaned.replace(/[|——]{2,}/g, '');
    cleaned = cleaned.replace(/[*#]{3,}/g, '');

    // 清理多余空白
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned;
}

/**
 * 移除命令路径中的斜杠，但保留中文格式如 G2/G6
 * @param {string} text - 输入文本
 * @returns {string} 清理后的文本
 */
function removeCommandSlashes(text) {
    // 保留中文斜杠（如 G2/G6）和中文前后的斜杠
    // 移除命令行风格的斜杠（如 /b /a-d 或 C:/）

    // 策略：先将中文斜杠格式保护起来，然后再移除其他斜杠
    const saved = [];
    let counter = 0;

    // 保护 G2/G6 格式（字母-斜杠-字母）
    let result = text.replace(/[A-Za-z]\/[A-Za-z]/g, (match) => {
        saved.push(match);
        return `__PROTECT_${counter++}__`;
    });

    // 移除命令行斜杠（字母/或/字母，但前面有空格或特殊符号）
    result = result.replace(/(?<![A-Za-z])\/(?=[A-Za-z])/g, '');
    result = result.replace(/(?<=[A-Za-z])\/(?![A-Za-z])/g, '');

    // 还原保护的格式
    saved.forEach((val, i) => {
        result = result.replace(`__PROTECT_${i}__`, val);
    });

    return result;
}

// ============================================================
// 模块名称：完整文本处理流程
// 功能说明：组合多个处理步骤，提供一站式文本处理入口
// ============================================================

/**
 * @description 完整文本处理流程：先清理用于显示，再可选进行口语化改造和填充词添加
 * @param {string} text - 原始文本
 * @param {Object} [options={}] - 处理选项
 * @param {boolean} [options.addFillers=true] - 是否添加填充词
 * @param {boolean} [options.shouldOralize=true] - 是否进行口语化改造
 * @param {string} [options.emotion='neutral'] - 情绪类型
 * @returns {string} 处理后的文本
 */
function processText(text, options = {}) {
    const {
        addFillers: shouldAddFillers = true,
        shouldOralize = true,
        emotion = 'neutral'
    } = options;

    let processed = cleanForDisplay(text);

    if (shouldOralize) {
        processed = oralize(processed);
    }

    if (shouldAddFillers) {
        processed = addFillers(processed, emotion);
    }

    return processed;
}

module.exports = {
    extractStyleTag,
    extractEmotion,

    detectIntent,
    isComplexQuestion,

    getMaxTokens,

    splitBySentence,
    mergeShortSentences,

    removeHtmlTags,
    removeCodeBlocks,
    removeEmojis,
    removeBracketContent,
    cleanWhitespace,
    removeWrittenFillers,
    stripMarkdown,
    markdownToHtml,
    cleanForDisplay,
    cleanForTTS,
    cleanForTTSSymbols,
    removeCommandSlashes,

    oralize,
    addFillers,
    processText,

    ALLOWED_STYLES,
    COMPLEX_KEYWORDS
};
