/**
 * 文本清洗拦截器
 * 解决TTS"读标签"问题 - 过滤所有动作标签，只保留风格标签
 */

/**
 * 文本处理选项
 */
export interface TextProcessOptions {
    addFillers?: boolean;
    oralize?: boolean;
    emotion?: string;
}

class TextCleaner {
    private allowedStyles: string[];
    private actionTagsToRemove: string[];
    private emotionTagsToRemove: string[];

    constructor() {
        // 允许的风格标签白名单（只有这些会被保留）
        this.allowedStyles = [
          '开心', '悲伤', '生气', '惊讶',
            '调皮', '温柔', '俏皮', '撒娇',
            '悄悄话', '夹子音', '台湾腔',
            '东北话', '四川话', '河南话', '粤语',
      '唱歌', '变快', '变慢', '平静'
        ];

        // 需要删除的动作标签（这些会被TTS读出来，必须删除）
        this.actionTagsToRemove = [
            '轻笑', '大笑', '微笑',
            '叹气', '深呼吸', '喘气',
            '小声', '大声', '提高音量',
            '思考', '停顿', '沉默片刻',
            '紧张', '放松', '疲惫',
          '咳嗽', '清嗓子',
            '难过', '温柔地', '轻声', '有气无力',
          '语速加快', '语速变慢'
        ];

        // 情绪/语气标签列表（显示时不显示，但动作描写要保留）
        this.emotionTagsToRemove = [
            '平静', '温柔', '轻声', '轻声地', '温柔地', '慵懒', '懒洋洋',
            '开心', '悲伤', '生气', '惊讶', '调皮', '俏皮', '撒娇',
            '悄悄话', '夹子音', '台湾腔', '东北话', '四川话', '河南话', '粤语',
            '唱歌', '变快', '变慢', '难过', '有气无力',
         '语速加快', '语速变慢', '提高音量', '小声', '大声',
          '轻笑', '大笑', '微笑', '叹气', '深呼吸', '喘气',
        '思考', '停顿', '沉默片刻', '紧张', '放松', '疲惫',
            '咳嗽', '清嗓子'
        ];
    }

    /**
     * 检测并删除游离的情绪词
     * 删除文本中任意位置的情绪词（包括直接相邻的）
     */
    detectAndMoveEmotionWord(text: string): string {
        if (!text || typeof text !== 'string') {
            return text;
        }

        let cleaned = text;

        // 删除所有情绪词，无论前后是否有空格或标点
        // 使用单词边界来避免部分匹配
        for (const emotion of this.allowedStyles) {
            // 匹配独立的情绪词（前后是字符串边界、空格或标点）
            const pattern = new RegExp(
             `(^|[，。！？、\\s])${emotion}([，。！？、\\s]|$)`,
              'gi'
            );
          cleaned = cleaned.replace(pattern, '$1$2');
        }

        // 再次清理：直接相邻的情绪词（如"平静"紧跟在其他字符后）
        for (const emotion of this.allowedStyles) {
            const pattern = new RegExp(emotion, 'gi');
            cleaned = cleaned.replace(pattern, '');
        }

        // 清理多余空格
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
    }

    /**
     * 主清洗函数 - 彻底删除所有动作标签
     * @param text - 原始文本（LLM输出）
     * @returns 清洗后的文本
     */
    clean(text: string): string {
        if (!text || typeof text !== 'string') {
            return '';
        }

        let cleaned = text;

        // 0. 检测并移动游离的情绪词到前面加括号
      cleaned = this.detectAndMoveEmotionWord(cleaned);

        // 1. 删除CSS代码块和样式标签
        cleaned = this.removeCssCode(cleaned);

        // 2. 删除HTML标签
        cleaned = this.removeHtmlTags(cleaned);

        // 3. 删除代码块
        cleaned = this.removeCodeBlocks(cleaned);

        // 4. 提取并处理全局风格标签 <style>...</style>
    cleaned = this.extractAndNormalizeStyle(cleaned);

        // 5. 删除所有表情符号（emoji）
        cleaned = this.removeEmojis(cleaned);

      // 6. 删除所有圆括号内的动作标签
        cleaned = this.removeAllActionTags(cleaned);

        // 7. 清理多余空格和格式
        cleaned = this.cleanWhitespace(cleaned);

        // 8. 确保风格标签在开头
        cleaned = this.ensureStyleAtBeginning(cleaned);

        return cleaned;
    }

    /**
     * 删除括号内的语气/情绪标签，保留动作描写
     */
    removeEmotionTagBrackets(text: string): string {
        let cleaned = text;

        // 删除中文括号内的语气标签
        const cnBracketRegex = new RegExp(
      `（(${this.emotionTagsToRemove.join('|')})）`,
            'g'
        );
        cleaned = cleaned.replace(cnBracketRegex, '');

        // 删除英文括号内的语气标签
        const enBracketRegex = new RegExp(
            `\((${this.emotionTagsToRemove.join('|')})\\)`,
            'g'
        );
        cleaned = cleaned.replace(enBracketRegex, '');

        return cleaned;
    }

    /**
   * 清理用于显示 - 只删除语气/情绪标签，保留动作描写
     * @param text - 原始文本
     * @returns 显示用文本
     */
    cleanForDisplay(text: string): string {
        if (!text || typeof text !== 'string') {
            return '';
        }

     let cleaned = text;

        // 0. 删除书面化停顿词和省略号
        cleaned = this.removeWrittenFillers(cleaned);

        // 1. 删除末尾游离的情绪词（如"你好～下午好啊～平静"中的"平静"）
        cleaned = this.detectAndMoveEmotionWord(cleaned);

        // 2. 删除括号内的语气/情绪标签（不删除动作描写）
        cleaned = this.removeEmotionTagBrackets(cleaned);

        // 3. 删除CSS代码块和样式标签
        cleaned = this.removeCssCode(cleaned);

        // 4. 删除HTML标签
        cleaned = this.removeHtmlTags(cleaned);

        // 5. 删除代码块
    cleaned = this.removeCodeBlocks(cleaned);

        // 6. 提取并处理全局风格标签 <style>...</style>
        cleaned = this.extractAndNormalizeStyle(cleaned);

        // 6. 删除所有表情符号（emoji）
        cleaned = this.removeEmojis(cleaned);

        // 7. 清理多余空格和格式
      cleaned = this.cleanWhitespace(cleaned);

        // 8. 确保风格标签在开头
        cleaned = this.ensureStyleAtBeginning(cleaned);

        return cleaned;
    }

    /**
     * 清理用于TTS - 删除所有情绪标签，防止TTS读出来
     * @param text - 原始文本
     * @returns TTS用文本
     */
    cleanForTTS(text: string): string {
        if (!text || typeof text !== 'string') {
            return '';
        }

        let cleaned = text;

        // 0. 删除书面化停顿词和省略号
      cleaned = this.removeWrittenFillers(cleaned);

        // 1. 检测并移动游离的情绪词到前面加括号
        cleaned = this.detectAndMoveEmotionWord(cleaned);

        // 2. 删除CSS代码块和样式标签
        cleaned = this.removeCssCode(cleaned);

        // 3. 删除HTML标签
        cleaned = this.removeHtmlTags(cleaned);

        // 4. 删除代码块
        cleaned = this.removeCodeBlocks(cleaned);

        // 5. 提取并处理全局风格标签 <style>...</style>
      cleaned = this.extractAndNormalizeStyle(cleaned);

        // 6. 删除所有表情符号（emoji）
        cleaned = this.removeEmojis(cleaned);

        // 7. 删除所有圆括号内的标签（情绪标签不读出来）
        cleaned = this.removeAllActionTags(cleaned);

        // 8. 清理多余空格和格式
        cleaned = this.cleanWhitespace(cleaned);

        // 9. 确保风格标签在开头（但也要删除）
        cleaned = this.removeStyleTags(cleaned);

        return cleaned;
    }

    /**
     * 删除所有<style>标签（用于TTS）
     */
    removeStyleTags(text: string): string {
        return text.replace(/<style>.*?<\/style>/g, '').trim();
    }

    /**
     * 删除CSS代码
     * 移除CSS类定义、ID定义、属性声明等
     */
    removeCssCode(text: string): string {
        let cleaned = text;
        // 移除完整的CSS规则（.class { ... } 或 #id { ... } 或 @keyframes { ... }）
        // 支持后代选择器：.class1 .class2 { ... }
        // 使用平衡大括号匹配，处理嵌套和rgba()等包含}的情况
        cleaned = this.removeBalancedBraces(cleaned, /\.[a-zA-Z_-][\w-]*(?:\s+[a-zA-Z_-][\w-]*)*\s*\{/g);
        cleaned = this.removeBalancedBraces(cleaned, /#[a-zA-Z_-][\w-]*(?:\s+[a-zA-Z_-][\w-]*)*\s*\{/g);
        cleaned = this.removeBalancedBraces(cleaned, /@[a-zA-Z_-][\w-]*(?:\s+[a-zA-Z_-][\w-]*)*\s*\{/g);
        // 移除CSS属性声明（property: value;）
        cleaned = cleaned.replace(/[a-zA-Z-]+\s*:\s*[^;{}]+[;]?/g, '');
        // 移除颜色函数和十六进制颜色
        cleaned = cleaned.replace(/rgba?\([^)]*\)/g, '');
        cleaned = cleaned.replace(/#[0-9a-fA-F]{3,8}\b/g, '');
        // 移除孤立的CSS类名（如 .happy-bubble）
        cleaned = cleaned.replace(/\.[a-zA-Z_-][\w-]*(?:\s+[a-zA-Z_-][\w-]*)*/g, '');
        // 移除孤立的CSS at-rules（如 @keyframes）
    cleaned = cleaned.replace(/@[a-zA-Z_-][\w-]*(?:\s+[a-zA-Z_-][\w-]*)*/g, '');
        // 移除孤立的CSS关键字
        cleaned = cleaned.replace(/\b(?:background|font-family|list-style|text-align|display|margin|padding|border|box-shadow|border-radius|align-items|justify-content|font-size|font-weight|font-style|keyframes|linear-gradient)\b/g, '');
        return cleaned;
    }

    /**
     * 移除平衡的大括号内容
     */
    removeBalancedBraces(text: string, openPattern: RegExp): string {
      let result = text;
        let match: RegExpExecArray | null;
        // 需要重新创建正则，因为exec会改变lastIndex
        const regex = new RegExp(openPattern.source, 'g');

      while ((match = regex.exec(result)) !== null) {
            const startIndex = match.index;
            const openBraceIndex = startIndex + match[0].length - 1;
            let braceCount = 1;
            let endIndex = openBraceIndex + 1;

            while (braceCount > 0 && endIndex < result.length) {
           if (result[endIndex] === '{') braceCount++;
                else if (result[endIndex] === '}') braceCount--;
             endIndex++;
            }

            if (braceCount === 0) {
             result = result.substring(0, startIndex) + result.substring(endIndex);
              regex.lastIndex = startIndex;
            }
        }

        return result;
    }

    /**
     * 删除HTML标签（保留<style>风格标签用于TTS）
     */
    removeHtmlTags(text: string): string {
        let cleaned = text;
        // 只移除标签本身，保留标签内的文本内容
        cleaned = cleaned.replace(/<div[^>]*>/g, '');
      cleaned = cleaned.replace(/<\/div>/g, '');
        cleaned = cleaned.replace(/<span[^>]*>/g, '');
        cleaned = cleaned.replace(/<\/span>/g, '');
        cleaned = cleaned.replace(/<br\s*\/?>/g, '\n');
        cleaned = cleaned.replace(/<p[^>]*>/g, '\n');
        cleaned = cleaned.replace(/<\/p>/g, '');
        // 移除剩余的尖括号标签（但保留内容）
        cleaned = cleaned.replace(/<[^>]*>/g, '');
        return cleaned;
    }

    /**
     * 删除代码块
     */
    removeCodeBlocks(text: string): string {
        // 删除markdown代码块
        let cleaned = text.replace(/```[\s\S]*?```/g, '');
        // 删除行内代码
        cleaned = cleaned.replace(/`[^`]*`/g, '');
        return cleaned;
    }

    /**
     * 提取并规范化风格标签
     * 严格限制：必须是<style>xxx</style>格式，且xxx在白名单中
     */
    extractAndNormalizeStyle(text: string): string {
        // 匹配各种可能的风格标签格式
        const stylePatterns = [
            /<style>(.*?)<\/style>/gi,      // 正确格式
            /【style】(.*?)【\/style】/gi,   // 错误格式1
            /\[style\](.*?)\[\/style\]/gi,   // 错误格式2
          /\{style\}(.*?)\{\/style\}/gi,   // 错误格式3
            /style[:：](\S+)/gi              // style:开心 格式
        ];

        let styleContent: string | null = null;
        let cleanedText = text;

        // 提取第一个有效的风格标签
        for (const pattern of stylePatterns) {
            const match = cleanedText.match(pattern);
            if (match && match[1]) {
          const content = match[1].trim();
                // 检查是否在白名单中
              if (this.allowedStyles.includes(content)) {
                  styleContent = content;
             }
                // 移除匹配到的标签
              cleanedText = cleanedText.replace(match[0], '');
              break;
        }
        }

        // 如果有有效风格，添加到开头
        if (styleContent) {
            cleanedText = `<style>${styleContent}</style>${cleanedText}`;
        }

        return cleanedText;
    }

    /**
     * 删除所有表情符号（emoji）
     * 防止TTS读出emoji字符
     */
    removeEmojis(text: string): string {
      const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]/gu;
        return text.replace(emojiRegex, '');
    }

    /**
     * 删除所有圆括号内的动作标签
     * 这是关键：所有（xxx）格式的标签都会被删除，防止TTS读出来
     */
    removeAllActionTags(text: string): string {
        let cleaned = text.replace(/（[^）]*）/g, '');
        cleaned = cleaned.replace(/\([^)]*\)/g, '');
        return cleaned;
    }

    /**
     * 清理空白字符
   */
    cleanWhitespace(text: string): string {
        return text
            .replace(/\s+/g, ' ')      // 多个空格合并
            .replace(/，\s+/g, '，')    // 逗号后空格
            .replace(/。\s+/g, '。')    // 句号后空格
            .replace(/！\s+/g, '！')    // 感叹号后空格
          .replace(/？\s+/g, '？')    // 问号后空格
      .trim();
    }

    /**
     * 删除书面化停顿词和省略号
     * 让回复更符合语音交流习惯
     */
    removeWrittenFillers(text: string): string {
        let cleaned = text;

        // 删除省略号（各种形式）
    cleaned = cleaned.replace(/\.{3,}/g, '');           // ...
        cleaned = cleaned.replace(/…{2,}/g, '');            // ……
        cleaned = cleaned.replace(/\.\s*\.\s*\./g, '');     // . . .

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
     * 确保风格标签在开头
     */
    ensureStyleAtBeginning(text: string): string {
        const styleMatch = text.match(/<style>.*?<\/style>/);
        if (styleMatch) {
            const style = styleMatch[0];
        const rest = text.replace(style, '').trim();
            return `${style}${rest}`;
        }
        return text;
    }

    /**
     * 智能添加填充词和停顿
     * 让语音更像真人说话
     */
    addFillers(text: string, emotion: string = 'neutral'): string {
        const fillers: Record<string, string[]> = {
            neutral: ['呃……', '那个……', '我想啊……', '其实吧……'],
            happy: ['哎呀……', '对了……', '嘿……'],
            sad: ['唉……', '那个……', '说实话……'],
        thinking: ['嗯……', '让我想想……', '这个嘛……']
        };

        // 在句子开头随机添加填充词（30%概率）
        if (Math.random() < 0.3 && !text.includes('……')) {
            const emotionFillers = fillers[emotion] || fillers.neutral;
       const filler = emotionFillers[Math.floor(Math.random() * emotionFillers.length)];

            // 如果已经有风格标签，插在标签后面
            if (text.startsWith('<style>')) {
            const styleEnd = text.indexOf('</style>') + 8;
                return text.slice(0, styleEnd) + filler + text.slice(styleEnd);
            }
          return filler + text;
        }

        return text;
    }

    /**
     * 口语化改造
     * 将书面语转换为口语表达
     */
    oralize(text: string): string {
      const oralMappings: Record<string, string> = {
        // 连接词
            '首先': '第一呢',
         '其次': '然后啊',
            '再次': '还有啊',
        '最后': '最后呢',
          '总之': '总的来说啊',
            '综上所述': '所以啊',

            // 转折词
            '但是': '不过呢',
            '然而': '可是啊',
            '因此': '所以啊',
            '因为': '因为嘛',

            // 语气增强
            '非常': '挺',
            '十分': '挺',
            '极其': '特别',
            '相当': '挺'
        };

        let oralized = text;
        for (const [written, oral] of Object.entries(oralMappings)) {
            const regex = new RegExp(written, 'g');
            oralized = oralized.replace(regex, oral);
        }

        return oralized;
    }

    /**
     * 短句化
     * 将长句拆分为短句（每句不超过15个字）
     */
    shortenSentences(text: string): string {
        // 在长句子中插入自然停顿（用逗号分隔）
        // 注意：不再添加（停顿）标签，因为会被读出来
     return text;
    }

    /**
     * 完整处理流程
     */
    process(text: string, options: TextProcessOptions = {}): string {
        const {
            addFillers: shouldAddFillers = true,
          oralize: shouldOralize = true,
            emotion = 'neutral'
        } = options;

        let processed = this.clean(text);

        if (shouldOralize) {
            processed = this.oralize(processed);
        }

        if (shouldAddFillers) {
            processed = this.addFillers(processed, emotion);
        }

        return processed;
    }
}

export default new TextCleaner();
