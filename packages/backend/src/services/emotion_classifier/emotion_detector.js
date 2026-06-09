/**
 * @file emotion_detector.js
 * @description 情感检测器 - 核心情感词典、否定词/程度副词处理、情感动量和趋势分析
 * @module emotion_classifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/** 情感动量权重 - 历史情感对当前分类的影响程度 */
const MOMENTUM_WEIGHT = 0.3;

/** 情感历史最大长度 */
const MAX_HISTORY_LENGTH = 10;

/** 强情感阈值 - 超过此分数认为情感强烈 */
const STRONG_EMOTION_THRESHOLD = 3;

/** 中等情感阈值 */
const MODERATE_EMOTION_THRESHOLD = 1.5;

/** 弱情感阈值 - 低于此分数认为是中性 */
const WEAK_EMOTION_THRESHOLD = 0.1;

class EmotionDetector {
    constructor() {
        this.emotions = ['angry', 'disgust', 'fear', 'distressed', 'happy', 'suffering', 'sad'];
        this.emotionLabels = {
            angry: '愤怒', disgust: '反感', fear: '恐惧',
            distressed: '内心辛苦', happy: '快乐',
            suffering: '困苦', sad: '悲伤'
        };

        // 核心情感词典
        this.lexicon = {
            angry: '生气 愤怒 火大 暴怒 恼火 气愤 怒气 火冒三丈 咬牙切齿 恨不得 讨厌 烦 烦死 滚 混蛋 该死 气死 可恶 恨 怨 埋怨 不满 抗议 反对 拒绝 否定 批评 指责 骂 吵 打架 冲突 斗争 反抗 叛逆 暴躁 急躁 不耐烦 受不了 够了 闭嘴 别说了 烦不烦 哼 真是的 太过分了'.split(' '),
            disgust: '恶心 反感 厌恶 嫌弃 鄙视 瞧不起 看不起 轻蔑 蔑视 不屑 厌烦 厌倦 腻 受够 排斥 回避 躲避 远离 脏 臭 丑 难看 难听 难闻 难吃 差劲 烂 垃圾 废物 没用 虚伪 做作 假 装 恶心死了 想吐 呃 受不了'.split(' '),
            fear: '害怕 恐惧 怕 担心 担忧 焦虑 紧张 不安 慌张 慌乱 惊恐 惊吓 吓 吓死 恐怖 可怕 吓人 惊悚 慌 忐忑 七上八下 坐立不安 心惊胆战 提心吊胆 胆战心惊 毛骨悚然 不寒而栗 后怕 畏惧 畏缩 退缩 逃避 躲开 不敢 万一 可能 也许 或许 大概 恐怕'.split(' '),
            distressed: '累 疲惫 疲劳 累死了 好累 辛苦 心累 压力 压抑 郁闷 憋屈 委屈 无奈 无助 迷茫 困惑 纠结 矛盾 挣扎 煎熬 折磨 痛苦 难受 不舒服 不自在 拘束 心乱 心烦 心焦 心堵 胸闷 喘不过气 沉重 负担 包袱 责任 义务 必须 不得不 只能 只好 没办法 无可奈何 力不从心 疲于奔命 应接不暇 焦头烂额 心力交瘁'.split(' '),
            happy: '开心 高兴 快乐 愉快 欢喜 喜悦 兴奋 激动 惊喜 欣慰 满足 幸福 甜蜜 温暖 感动 感激 感谢 喜欢 爱 享受 舒服 惬意 轻松 自在 畅快 痛快 爽 棒 完美 成功 胜利 赢 达标 完成 实现 获得 收获 进步 成长 提升 好转 顺利 幸运 好运 福气 缘分 巧合 正好 刚好 恰好 理想 满意 如意 顺心 顺遂 哈哈 嘻嘻 嘿嘿 呵呵 哇 耶 太棒了 真好 厉害 牛 赞 推荐 支持 加油 表扬 夸奖 称赞 羡慕 向往 期待 盼望 希望 憧憬 梦想 目标 计划 努力 奋斗 拼搏 坚持 信心 自信 相信 信任 放心 安心 踏实 搞定 完工 下班 放假 休息 睡觉 美食 有趣 有意义 有价值 有用 有效 天气不错 天气好 阳光明媚 晴朗 清爽 舒适 宜人'.split(' '),
            suffering: '苦 痛苦 疼 痛 难受 受罪 遭罪 受苦 受难 煎熬 折磨 摧残 伤害 损害 损失 失去 缺失 缺乏 缺少 不足 不够 不行 不能 不会 不懂 不知道 不明白 不理解 不清楚 不确定 不肯定 不放心 不安心 不踏实 不稳 不定 困难 艰难 艰辛 艰苦 困苦 穷困 贫困 贫穷 穷 缺钱 缺爱 缺时间 缺精力 缺能力 缺资源 缺机会 缺运气 倒霉 不幸 悲惨 凄惨 凄凉 悲凉 哀伤 忧伤 忧愁 愁 发愁 苦恼 烦恼 烦心 闹心 堵心 糟心 反胃 头晕 头疼 肚子疼 胃疼 心疼 胸闷 气短 无力 虚弱 憔悴 消瘦 苍白 病态 不健康 生病 疾病 病症 症状 不适 不安 不宁 不眠 失眠 睡不着 睡不好 噩梦 恶梦 烦躁 暴躁 易怒 易哭 脆弱 敏感 多疑 猜忌 嫉妒 恨 怨 埋怨 抱怨 诉苦 哭诉 哭泣 流泪 落泪 哭 呜咽 哽咽 抽泣 嚎啕大哭 崩溃 垮掉 倒下 放弃 绝望 无望 没希望 没前途 没出路 没未来 迷茫 迷失 迷失方向 失去目标 失去动力 失去兴趣 失去热情 失去活力 失去生机 死气沉沉 麻木 迟钝 呆滞 僵硬 僵化 固化 定势 惯性 习惯 习以为常 见怪不怪 无所谓 不在乎 不关心 不在意 不重视 不珍惜 不感激 不感恩 不满足 不知足 贪心 贪婪 渴求 渴望 欲望 想要 想拥有 想获得 想实现 想完成'.split(' '),
            sad: '难过 伤心 悲伤 悲痛 哀伤 忧伤 忧愁 愁 发愁 苦恼 伤心 难过 痛苦 疼 痛 心酸 心碎 心凉 心寒 心灰 心灰意冷 失望 失落 沮丧 懊丧 颓丧 消沉 低落 郁闷 压抑 憋屈 委屈 冤枉 冤屈 不平 不公 悲惨 凄惨 凄凉 悲凉 想哭 流泪 落泪 哭泣 哭 呜咽 哽咽 抽泣 崩溃 垮掉 倒下 放弃 无望 没希望 没前途 没出路 没未来 迷茫 迷失 失去目标 失去动力 失去兴趣 失去热情 失去活力 失去生机 孤独 寂寞 孤单 孤寂 冷清 荒凉 荒芜 空虚 空洞 茫然 失去方向 失去自我 失去自信 失去自尊 失去尊严 迷茫 困惑 无聊 乏味 没意思'.split(' ')
        };

        // 否定词
        this.negations = '不 没 无 非 莫 勿 别 未 休 毋 没 没有 不是 不算 不要 不能 不会 不可 不得 不必 不用 不该 不想 不愿 不肯 不敢 不宜 不适 不利 不良 不佳 不善 不妙 不好 不对 不行 不成'.split(' ');

        // 程度副词
        this.intensifiers = {
            strong: '非常 特别 极其 极度 十分 相当 很 太 最 极 绝 巨 超 无比 万分 不胜 何等 多么 那么 这么 如此 这般 这样 那样'.split(' '),
            moderate: '比较 挺 蛮 颇 有些 有点 稍微 略 略微 稍 稍稍 略略 多多少少 多少 一些 一点 一点儿 一下 一般 普通 寻常 平常'.split(' '),
            weak: 'barely 几乎不 简直不 不太 不怎么 没多少 没多大 没什么 无所谓 不在乎'.split(' ')
        };

        this.emotionHistory = [];
        this.maxHistoryLength = MAX_HISTORY_LENGTH;
    }

    /**
     * @description 应用情感动量 - 将历史情感分数与当前分数加权融合，实现平滑过渡
     * @param {Object} currentScores - 当前各情感分数
     * @returns {Object} 动量调整后的各情感分数
     */
    applyMomentum(currentScores) {
        if (this.emotionHistory.length === 0) return currentScores;

        const momentumWeight = MOMENTUM_WEIGHT;
        const adjusted = {};

        this.emotions.forEach(e => {
            const historyAvg = this.emotionHistory
                .slice(-3)
                .reduce((sum, h) => sum + (h.scores[e] || 0), 0) / Math.min(3, this.emotionHistory.length);

            adjusted[e] = currentScores[e] * (1 - momentumWeight) + historyAvg * momentumWeight;
        });

        return adjusted;
    }

    /**
     * @description 确定最终情感 - 根据融合分数选择主导情感，计算置信度和强度
     * @param {Object} scores - 各情感类型的融合分数
     * @returns {Object} 最终情感结果 { emotion, confidence, intensity, scores, details }
     */
    determineEmotion(scores) {
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        const [topEmotion, topScore] = sorted[0];
        const [, secondScore] = sorted[1];

        const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
        const confidence = totalScore > 0 ? topScore / totalScore : 0;

        let intensity = 'weak';
        if (topScore > STRONG_EMOTION_THRESHOLD) intensity = 'strong';
        else if (topScore > MODERATE_EMOTION_THRESHOLD) intensity = 'moderate';

        if (topScore <= WEAK_EMOTION_THRESHOLD) {
            return {
                emotion: 'neutral',
                confidence: 1 - confidence,
                intensity: 'weak',
                scores,
                details: { topScore, secondScore, gap: 0 }
            };
        }

        return {
            emotion: topEmotion,
            confidence,
            intensity,
            scores,
            details: {
                topScore,
                secondScore,
                gap: topScore - secondScore,
                allScores: sorted
            }
        };
    }

    /**
     * @description 更新情感历史记录 - 超过上限时移除最旧的记录
     * @param {Object} result - 当前情感分类结果
     */
    updateHistory(result) {
        this.emotionHistory.push({
            emotion: result.emotion,
            scores: result.scores,
            timestamp: Date.now()
        });

        if (this.emotionHistory.length > this.maxHistoryLength) {
            this.emotionHistory.shift();
        }
    }

    /**
     * @description 获取情感趋势 - 根据最近5条历史判断情感走向
     * @returns {string} 趋势类型：'improving'（好转）、'declining'（下滑）、'stable'（稳定）
     */
    getEmotionTrend() {
        if (this.emotionHistory.length < 2) return 'stable';

        const recent = this.emotionHistory.slice(-5);
        const emotions = recent.map(h => h.emotion);

        const negativeEmotions = ['angry', 'disgust', 'fear', 'distressed', 'suffering', 'sad'];
        const positiveEmotions = ['happy'];

        const negativeCount = emotions.filter(e => negativeEmotions.includes(e)).length;
        const positiveCount = emotions.filter(e => positiveEmotions.includes(e)).length;

        if (negativeCount > positiveCount + 1) return 'declining';
        if (positiveCount > negativeCount + 1) return 'improving';
        return 'stable';
    }

    /**
     * @description 清空情感历史记录
     */
    clearHistory() {
        this.emotionHistory = [];
    }
}

module.exports = new EmotionDetector();