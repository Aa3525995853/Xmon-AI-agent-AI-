/**
 * @file response_enhancer.js
 * @description 响应增强器 - 根据情感类型为回复添加语气词、表情和高情商回复模板
 * @module emotion_classifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/** 各情感类型对应的语气词库 */
const particles = {
    happy: ['哈哈', '嘻嘻', '嘿嘿', '哇', '耶', '太棒啦', '真好呢', '开心~', '好耶', '真不错'],
    sad: ['唉', '呜呜', '好难过', '心疼', '抱抱', '别难过', '唉...', '呜呜呜'],
    angry: ['哼', '真是的', '气死我了', '太过分了', '哎呀', '可恶', '混蛋'],
    disgust: ['呃', '好恶心', '受不了', '真是的', '天哪', '拜托'],
    fear: ['啊', '好可怕', '吓死我了', '担心', '别怕', '天哪', '救命'],
    distressed: ['唉', '好累', '辛苦了', '不容易', '心疼你', '唉...', '真不容易'],
    suffering: ['唉', '真难', '不容易', '辛苦了', '挺住', '加油', '会好的'],
    neutral: ['嗯', '哦', '这样啊', '了解', '明白', '嗯嗯', '好的', '知道了']
};

/** 各情感类型对应的表情映射 */
const emojiMap = {
    happy: ['😊', '😄', '🥰', '✨', '🎉'],
    sad: ['😢', '😭', '💔', '😔'],
    angry: ['😠', '😡', '💢', '😤'],
    disgust: ['🤢', '😒', '🙄', '😑'],
    fear: ['😨', '😰', '😱', '💦'],
    distressed: ['😓', '😥', '😰', '💦'],
    suffering: ['😣', '😖', '💢', '😫'],
    neutral: ['😌', '😊', '💭', '✨']
};

/** 各情感类型的响应策略 - 定义应对方式、语气风格和优先事项 */
const responseStrategies = {
    angry: {
        approach: 'calm_validation',
        tone: 'gentle_firm',
        priority: ['de-escalate', 'validate', 'redirect']
    },
    disgust: {
        approach: 'neutral_acknowledge',
        tone: 'respectful_distance',
        priority: ['acknowledge', 'space', 'alternative']
    },
    fear: {
        approach: 'reassurance_support',
        tone: 'warm_protective',
        priority: ['reassure', 'ground', 'empower']
    },
    distressed: {
        approach: 'empathy_relief',
        tone: 'understanding_gentle',
        priority: ['validate', 'relief', 'support']
    },
    happy: {
        approach: 'celebration_share',
        tone: 'warm_enthusiastic',
        priority: ['celebrate', 'share', 'amplify']
    },
    suffering: {
        approach: 'companion_strength',
        tone: 'steady_compassionate',
        priority: ['accompany', 'strengthen', 'hope']
    },
    sad: {
        approach: 'comfort_presence',
        tone: 'gentle_present',
        priority: ['comfort', 'presence', 'gentle_hope']
    },
    neutral: {
        approach: 'neutral_attentive',
        tone: 'balanced_attentive',
        priority: ['listen', 'respond', 'continue']
    }
};

/** 高情商回复模板 - 每种情感类型预置多条共情回复 */
const empathyTemplates = {
    angry: [
        '我能感受到你现在真的很生气。发生了什么事让你这么恼火？',
        '听起来你现在很委屈，愿意跟我说说吗？',
        '我理解你的愤怒，这种感受确实很难受。'
    ],
    disgust: [
        '嗯，这确实让人不舒服。你现在的感受我能理解。',
        '遇到这种事确实挺让人反感的。',
        '我能理解你的感受，这种体验确实不好。'
    ],
    fear: [
        '别担心，我在这里陪着你。',
        '感到害怕是正常的，我们一起面对。',
        '我理解你的担心，慢慢来，有我在。'
    ],
    distressed: [
        '你最近一定很累吧。',
        '听起来你承受了很多压力，需要休息一下。',
        '我能感受到你的辛苦，你已经做得很好了。'
    ],
    happy: [
        '看到你开心我也很高兴！',
        '太棒了！这真是个好消息！',
        '哇！真的吗？太为你高兴了！'
    ],
    suffering: [
        '这段时间你一定过得很不容易。',
        '我能感受到你的痛苦，但请相信会好起来的。',
        '你比想象中更坚强，我会一直陪着你。'
    ],
    sad: [
        '想哭就哭出来吧，我陪着你。',
        '失去重要的人/事确实很难过。',
        '你的感受我懂，允许自己悲伤一会儿。'
    ],
    neutral: [
        '嗯嗯，我在听，继续说。',
        '了解了，还有吗？',
        '这样啊，我明白了。'
    ]
};

class ResponseEnhancer {
    /**
     * @description 获取指定情感的随机语气词
     * @param {string} emotion - 情感类型
     * @param {number} count - 需要的语气词数量
     * @returns {Array<string>} 语气词数组
     */
    getParticles(emotion, count = 1) {
        const pool = particles[emotion] || particles.neutral;
        const selected = [];
        for (let i = 0; i < count; i++) {
            selected.push(pool[Math.floor(Math.random() * pool.length)]);
        }
        return selected;
    }

    /**
     * @description 获取指定情感的随机表情
     * @param {string} emotion - 情感类型
     * @returns {string} 表情符号
     */
    getEmoji(emotion) {
        const pool = emojiMap[emotion] || emojiMap.neutral;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    /**
     * @description 增强回复 - 根据情感类型添加语气词和表情
     * @param {string} text - 原始回复文本
     * @param {string} emotion - 情感类型
     * @returns {string} 增强后的回复文本
     */
    enhanceResponse(text, emotion) {
        const particle = this.getParticles(emotion, 1)[0];
        const emoji = this.getEmoji(emotion);

        let enhanced = text;
        if (emotion === 'happy') {
            enhanced = `${particle}，${text} ${emoji}`;
        } else if (emotion === 'sad' || emotion === 'suffering') {
            enhanced = `${particle}... ${text} ${emoji}`;
        } else if (emotion === 'angry') {
            enhanced = `${particle}！${text} ${emoji}`;
        } else {
            enhanced = `${text} ${particle} ${emoji}`;
        }

        return enhanced;
    }

    /**
     * @description 获取指定情感的响应策略
     * @param {string} emotion - 情感类型
     * @returns {Object} 响应策略 { approach, tone, priority }
     */
    getResponseStrategy(emotion) {
        return responseStrategies[emotion] || responseStrategies.neutral;
    }

    /**
     * @description 生成高情商回复 - 从模板中随机选择一条共情回复
     * @param {string} userEmotion - 用户情感类型
     * @returns {string} 高情商回复文本
     */
    generateEmpathyResponse(userEmotion) {
        const pool = empathyTemplates[userEmotion] || empathyTemplates.neutral;
        return pool[Math.floor(Math.random() * pool.length)];
    }
}

module.exports = new ResponseEnhancer();