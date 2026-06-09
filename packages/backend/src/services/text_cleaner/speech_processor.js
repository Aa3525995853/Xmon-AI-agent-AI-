/**
 * @file speech_processor.js
 * @description 语音处理器 - 口语化转换、长句缩短、填充词添加、HTML清理
 * @module services/text_cleaner
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义：填充词配置
// 说明：按情感类型分组，用于TTS口语化时增加自然感
// ============================================================
const FILLERS = {
    neutral: ['嗯', '那个', '这个'],
    happy: ['哈哈', '呀', '嗯嗯'],
    sad: ['嗯', '...', '好吧'],
    thinking: ['让我想想', '这个嘛', '嗯...']
};

class SpeechProcessor {
    /**
     * @description 口语化处理，将书面化表达转换为口语表达，保留风格标签
     * @param {string} text - 待处理文本
     * @returns {string} 口语化后的文本
     */
    oralize(text) {
        if (!text) return '';

        let oral = text;

        // 保留风格标签
        const styles = [];
        oral = oral.replace(/<style>.*?<\/style>/gi, (m) => {
            styles.push(m);
            return `__STYLE_${styles.length - 1}__`;
        });

        // 移除书面化表达
        oral = oral
            .replace(/\b因此\b/g, '所以')
            .replace(/\b然而\b/g, '但是')
            .replace(/\b但是\b/g, '不过')
            .replace(/\b此外\b/g, '还有')
            .replace(/\b并且\b/g, '而且')
            .replace(/\b由于\b/g, '因为')
            .replace(/\b虽然\b/g, '虽然')
            .replace(/\b如果\b/g, '要是')
            .replace(/\b那么\b/g, '那')
            .replace(/\b可能\b/g, '说不定')
            .replace(/\b大约\b/g, '大概')
            .replace(/\b关于\b/g, '关于')
            .replace(/\b对于\b/g, '对于');

        // 恢复风格标签
        styles.forEach((s, i) => {
            oral = oral.replace(`__STYLE_${i}__`, s);
        });

        return oral;
    }

    /**
     * @description 缩短长句，将超过50字的句子按连接词拆分为多个短句
     * @param {string} text - 待处理文本
     * @returns {string} 缩短句子后的文本
     */
    shortenSentences(text) {
        if (!text) return '';

        // 按标点分割
        const sentences = text.split(/([。！？；\n])/);
        const result = [];

        for (let i = 0; i < sentences.length; i += 2) {
            const sentence = sentences[i];
            const punctuation = sentences[i + 1] || '';

            if (sentence.length > 50) {
                // 拆分为多个短句
                const clauses = this._splitLongSentence(sentence);
                result.push(clauses.join('。'));
            } else {
                result.push(sentence);
            }

            if (punctuation) {
                result.push(punctuation);
            }
        }

        return result.join('');
    }

    /**
     * @description 按连接词拆分长句，无法拆分时截断并加省略号
     * @param {string} text - 长句文本
     * @returns {string[]} 拆分后的短句数组
     * @private
     */
    _splitLongSentence(text) {
        // 按连接词拆分
        const connectors = ['，然后', '，并且', '，而且', '，同时', '，接着', '，于是', '，所以', '，但是', '，不过', '，因为', '，如果'];

        let remaining = text;
        const clauses = [];

        for (const conn of connectors) {
            if (remaining.includes(conn)) {
                const parts = remaining.split(conn);
                clauses.push(parts[0]);
                remaining = parts.slice(1).join(conn);
            }
        }

        if (clauses.length === 0) {
            // 无法拆分，截断
            clauses.push(text.substring(0, 45) + '...');
        } else {
            clauses.push(remaining);
        }

        return clauses.filter(c => c.trim());
    }

    /**
     * @description 在句首添加填充词，使TTS朗读更自然
     * @param {string} text - 待处理文本
     * @param {string} [emotion='neutral'] - 情感类型，决定使用哪组填充词
     * @returns {string} 添加填充词后的文本
     */
    addFillers(text, emotion = 'neutral') {
        if (!text) return '';

        const fillers = FILLERS[emotion] || FILLERS.neutral;
        const randomFiller = fillers[Math.floor(Math.random() * fillers.length)];

        // 在句首添加填充词
        const sentences = text.split(/([。！？\n])/);
        const result = [];

        for (let i = 0; i < sentences.length; i += 2) {
            const sentence = sentences[i].trim();
            const punctuation = sentences[i + 1] || '';

            if (sentence && i > 0) {
                result.push(randomFiller + '，' + sentence);
            } else if (sentence) {
                result.push(sentence);
            }

            if (punctuation) {
                result.push(punctuation);
            }
        }

        return result.join('');
    }

    /**
     * @description 移除书面填充词（如"实际上"、"总而言之"等），使表达更简洁
     * @param {string} text - 待处理文本
     * @returns {string} 移除书面填充词后的文本
     */
    removeWrittenFillers(text) {
        if (!text) return '';

        const writtenFillers = [
            '实际上', '事实上', '简单来说', '总的来说',
            '一般来说', '通常来说', '可以说', '换句话说',
            '也就是说', '总而言之', '综上所述'
        ];

        let cleaned = text;
        for (const filler of writtenFillers) {
            cleaned = cleaned.replace(new RegExp(`^${filler}，?`, 'g'), '');
        }

        return cleaned.trim();
    }

    /**
     * @description 清理HTML标签并转换HTML实体为普通字符，用于TTS文本准备
     * @param {string} html - 包含HTML标签和实体的文本
     * @returns {string} 纯文本内容
     */
    stripHtmlToText(html) {
        if (!html) return '';

        let text = html;

        // 移除标签
        text = text.replace(/<[^>]+>/g, '');

        // 转换实体
        text = text
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

        return text.trim();
    }
}

module.exports = new SpeechProcessor();