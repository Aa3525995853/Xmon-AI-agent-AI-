/**
 * 指代词解析器
 */

const REFERENCE_PATTERNS = [
    { pattern: /^(就|那|那就这么|就这样)/, type: 'confirm' },
    { pattern: /^(它|它们|那个|这个)/, type: 'noun' },
    { pattern: /^(和之前一样|跟之前一样|同样的)/, type: 'same' },
    { pattern: /^(再说一遍|重新)/, type: 'repeat' }
];

const QUANTITY_PATTERNS = [
    { pattern: /^(一个|1个|一个人)/, value: 1 },
    { pattern: /^(两个|2个|两个人)/, value: 2 },
    { pattern: /^(三个|3个|三个人)/, value: 3 },
    { pattern: /^(几个|若干)/, value: null }
];

const CONFIRM_WORDS = ['好的', '行', '可以', '没问题', '嗯', '是的', '对', '没错'];

class PronounResolver {
    /**
     * 检测是否是确认类回复
     */
    isConfirmationReply(text) {
        const trimmed = text.trim();
        if (trimmed.length < 20 && CONFIRM_WORDS.some(c => trimmed.startsWith(c))) {
            return true;
        }
        // 只有时间或数量
        if (trimmed.length < 15 && /今天|明天|后天|下[一二三四五六日]/.test(trimmed)) return true;
        if (trimmed.length < 10 && QUANTITY_PATTERNS.some(q => q.pattern.test(trimmed))) return true;
        return false;
    }

    /**
     * 检测是否包含数量表达
     */
    containsQuantity(text) {
        return QUANTITY_PATTERNS.some(q => q.pattern.test(text));
    }

    /**
     * 提取数量实体
     */
    extractQuantity(text) {
        for (const q of QUANTITY_PATTERNS) {
            if (q.pattern.test(text)) {
                return { raw: q.pattern.toString(), value: q.value, type: 'quantity' };
            }
        }
        const numMatch = text.match(/\d+/);
        if (numMatch) {
            return { raw: numMatch[0], value: parseInt(numMatch[0]), type: 'number' };
        }
        return null;
    }

    /**
     * 解析指代词
     */
    resolve(text, context) {
        const resolved = {};
        const entities = {};

        // 检查确认类指代
        if (REFERENCE_PATTERNS[0].pattern.test(text)) {
            if (context.currentTask) {
                resolved.inherits = true;
                entities = { ...context.currentTask.entities };
            }
        }

        // 检查"和之前一样"类
        for (const ref of REFERENCE_PATTERNS) {
            if (ref.pattern.test(text) && ref.type === 'same' && context.lastTask) {
                resolved.inherits = true;
                entities = { ...context.lastTask.entities };
            }
        }

        return { resolved, entities };
    }
}

module.exports = new PronounResolver();