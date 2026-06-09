/**
 * 文本处理工具模块
 * 提供文本清洗、格式化、分割等通用功能
 */

import { IntentType } from '../types';

/**
 * 句子边界正则
 */
const SENTENCE_BOUNDARY = /[。！？.!?]/;

/**
 * 允许的风格标签白名单
 */
export const ALLOWED_STYLES = [
    '开心', '悲伤', '生气', '惊讶',
    '调皮', '温柔', '俏皮', '撒娇',
    '悄悄话', '夹子音', '台湾腔',
    '东北话', '四川话', '河南话', '粤语',
    '唱歌', '变快', '变慢', '平静'
] as const;

/**
 * 复杂问题关键词
 */
export const COMPLEX_KEYWORDS = [
    '怎么', '如何', '为什么', '解释', '分析', '代码', '编程', '算法',
    '计算', '数学', '逻辑', '推理', '步骤', '教程', '方法', '方案',
    '比较', '区别', '差异', '优缺点', '评价', '建议', '规划', '计划',
    '生成', '写一篇', '写一个', '翻译', '总结', '概括', '提取',
    '是什么', '什么意思', '原理', '机制', '流程', '架构', '设计',
    '表演', '绝活', '才艺', '展示'
] as const;

/**
 * 书面语到口语的映射
 */
const ORAL_MAPPINGS: Record<string, string> = {
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
const FILLERS: Record<string, string[]> = {
    neutral: ['呃……', '那个……', '我想啊……', '其实吧……'],
    happy: ['哎呀……', '对了……', '嘿……'],
    sad: ['唉……', '那个……', '说实话……'],
    thinking: ['嗯……', '让我想想……', '这个嘛……']
};

/**
 * 风格标签提取结果
 */
export interface StyleTagResult {
    emotion: string;
    text: string;
}

/**
 * 文本处理选项
 */
export interface ProcessTextOptions {
    addFillers?: boolean;
    shouldOralize?: boolean;
    emotion?: string;
}

/**
 * 提取 <style>情绪</style> 标签
 * @param text - 原始文本
 * @returns 情绪和清理后的文本
 */
export function extractStyleTag(text: string): StyleTagResult {
    const match = text.match(/^<style>(.*?)<\/style>(.*)/);
    if (match) {
        return { emotion: match[1], text: match[2].trim() };
    }
    return { emotion: '调皮', text: text.trim() };
}

/**
 * 检测用户意图
 * @param userText - 用户输入文本
 * @returns 'coding' | 'chat'
 */
export function detectIntent(userText: string): IntentType {
    const codeKeywords = /代码|编程|报错|bug|前端|后端|脚本|写个|怎么实现|函数|变量|html|css|js|python|java|程序|开发|框架|库|api|数据库|sql|算法|数据结构|正则|表达式|组件|模块|类|接口|调试|错误|异常|git|github|docker|服务器|部署/i;
    if (codeKeywords.test(userText)) {
        return 'coding';
    }
    return 'chat';
}

/**
 * 根据文本内容获取最大 token 数
 * @param text - 用户输入文本
 * @returns 最大 token 数
 */
export function getMaxTokens(text: string): number {
    // 故事类请求：需要长回复
    if (/讲.*故事|童话|寓言|传说|小说|续写/.test(text)) {
        return 800;
    }

    // 复杂问题：中等长度
    if (COMPLEX_KEYWORDS.some(kw => text.includes(kw))) {
     return 400;
    }

    // 简单对话：短回复
    return 200;
}

/**
 * 判断是否为复杂问题
 * @param text - 用户输入文本
 * @returns 是否为复杂问题
 */
export function isComplexQuestion(text: string): boolean {
    return COMPLEX_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * 按句子分割文本
 * @param text - 原始文本
 * @returns 句子数组
 */
export function splitBySentence(text: string): string[] {
    const sentences: string[] = [];
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
 * 合并短句，减少 TTS 调用次数
 * @param sentences - 句子数组
 * @returns 合并后的句子数组
 */
export function mergeShortSentences(sentences: string[]): string[] {
    if (sentences.length <= 1) return sentences;
    const merged: string[] = [];
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

/**
 * 删除 HTML 标签
 * @param text - 原始文本
 * @returns 清理后的文本
 */
export function removeHtmlTags(text: string): string {
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
 * 删除代码块
 * @param text - 原始文本
 * @returns 清理后的文本
 */
export function removeCodeBlocks(text: string): string {
    let cleaned = text.replace(/```[\s\S]*?```/g, '');
    cleaned = cleaned.replace(/`[^`]*`/g, '');
    return cleaned;
}

/**
 * 删除表情符号
 * @param text - 原始文本
 * @returns 清理后的文本
 */
export function removeEmojis(text: string): string {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]/gu;
    return text.replace(emojiRegex, '');
}

/**
 * 删除括号内的内容
 * @param text - 原始文本
 * @returns 清理后的文本
 */
export function removeBracketContent(text: string): string {
    let cleaned = text.replace(/（[^）]*）/g, '');
    cleaned = cleaned.replace(/\([^)]*\)/g, '');
    return cleaned;
}

/**
 * 清理空白字符
 * @param text - 原始文本
 * @returns 清理后的文本
 */
export function cleanWhitespace(text: string): string {
    return text
        .replace(/\s+/g, ' ')
        .replace(/，\s+/g, '，')
        .replace(/。\s+/g, '。')
        .replace(/！\s+/g, '！')
        .replace(/？\s+/g, '？')
        .trim();
}

/**
 * 删除书面化停顿词和省略号
 * @param text - 原始文本
 * @returns 清理后的文本
 */
export function removeWrittenFillers(text: string): string {
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

    // 清理多余空格和标点
  cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/，+/g, '，');
    cleaned = cleaned.replace(/。+/g, '。');
    cleaned = cleaned.replace(/！+/g, '！');
    cleaned = cleaned.replace(/？+/g, '？');

    return cleaned.trim();
}

/**
 * 口语化改造
 * @param text - 原始文本
 * @returns 口语化后的文本
 */
export function oralize(text: string): string {
    let oralized = text;
    for (const [written, oral] of Object.entries(ORAL_MAPPINGS)) {
        const regex = new RegExp(written, 'g');
        oralized = oralized.replace(regex, oral);
    }
    return oralized;
}

/**
 * 智能添加填充词
 * @param text - 原始文本
 * @param emotion - 情绪类型
 * @returns 添加填充词后的文本
 */
export function addFillers(text: string, emotion: string = 'neutral'): string {
    if (Math.random() < 0.3 && !text.includes('……')) {
        const emotionFillers = FILLERS[emotion] || FILLERS.neutral;
        const filler = emotionFillers[Math.floor(Math.random() * emotionFillers.length)];

        if (text.startsWith('<style>')) {
            const styleEnd = text.indexOf('</style>') + 8;
            return text.slice(0, styleEnd) + filler + text.slice(styleEnd);
        }
        return filler + text;
    }
    return text;
}

/**
 * 提取情绪标签
 * @param text - 原始文本
 * @returns 情绪标签
 */
export function extractEmotion(text: string): string {
    const styleMatch = text.match(/<style>(.*?)<\/style>/);
    if (styleMatch) {
        const raw = styleMatch[1];
        const emotionMap: Record<string, string> = {
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

/**
 * 清理用于显示的文本
 * @param text - 原始文本
 * @returns 清理后的文本
 */
export function cleanForDisplay(text: string): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let cleaned = text;
    cleaned = removeWrittenFillers(cleaned);
    cleaned = removeHtmlTags(cleaned);
    cleaned = removeCodeBlocks(cleaned);
    cleaned = removeEmojis(cleaned);
    cleaned = cleanWhitespace(cleaned);

    return cleaned;
}

/**
 * 清理用于 TTS 的文本
 * @param text - 原始文本
 * @returns 清理后的文本
 */
export function cleanForTTS(text: string): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let cleaned = text;
    cleaned = removeWrittenFillers(cleaned);
    // 先移除style标签（在removeHtmlTags之前）
    cleaned = cleaned.replace(/<style>.*?<\/style>/gs, '');
    cleaned = removeHtmlTags(cleaned);
    cleaned = removeCodeBlocks(cleaned);
    cleaned = removeEmojis(cleaned);
    cleaned = removeBracketContent(cleaned);
    cleaned = cleanWhitespace(cleaned);

    return cleaned;
}

/**
 * 完整文本处理流程
 * @param text - 原始文本
 * @param options - 处理选项
 * @returns 处理后的文本
 */
export function processText(text: string, options: ProcessTextOptions = {}): string {
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
