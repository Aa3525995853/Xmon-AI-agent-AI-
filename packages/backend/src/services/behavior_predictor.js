/**
 * @file 行为预测服务
 * @description 基于用户行为历史进行预测，支持行为转移矩阵、时间习惯、用户习惯等多种预测方法
 *              用于主动服务中的上下文预判功能
 * @module services/behavior_predictor
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

/** 行为预测数据文件路径 */
const BEHAVIOR_FILE = dataPath('behavior_predictions.json');
/** 单个会话最大记录数 */
const MAX_SESSION_LENGTH = 30;
/** 历史记录最大保留条数 */
const MAX_HISTORY_LENGTH = 500;
/** 预测记录最大保留条数 */
const MAX_PREDICTIONS_LENGTH = 100;

// ============================================================
// BehaviorPredictor 类
// ============================================================

/**
 * 行为预测服务
 * 基于用户行为历史进行预测
 * @class
 */
class BehaviorPredictor {
    /**
     * 构造函数
     */
    constructor() {
        /** @type {Object} 预测数据 */
        this.data = this.load();
        /** @type {Array} 当前会话的行为记录 */
        this.sessionActions = [];
        /** @type {number} 单个会话最大记录数 */
        this.maxSessionLength = MAX_SESSION_LENGTH;
    }

    /**
     * 从磁盘加载数据
     * @returns {Object} 预测数据
     */
    load() {
        try {
            if (fs.existsSync(BEHAVIOR_FILE)) {
                return JSON.parse(fs.readFileSync(BEHAVIOR_FILE, 'utf-8'));
            }
        } catch (e) {
            console.error('[BehaviorPredictor] 加载行为数据失败:', e.message);
        }
        return this.getDefaultData();
    }

    /**
     * 保存数据到磁盘
     */
    save() {
        try {
            fs.writeFileSync(BEHAVIOR_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
        } catch (e) {
            console.error('[BehaviorPredictor] 保存行为数据失败:', e.message);
        }
    }

    /**
     * 获取默认数据
     * @returns {Object} 默认数据对象
     */
    getDefaultData() {
        return {
            actionHistory: [],          // 行为历史
            transitionMatrix: {},       // 行为转移矩阵
            timeActionMap: {},          // 时间-行为映射
            userHabits: {},             // 用户习惯
            predictions: [],            // 预测记录
            stats: {                    // 统计信息
                totalActions: 0,
                correctPredictions: 0,
                totalPredictions: 0,
                accuracy: 0
            }
        };
    }

    /**
     * 记录一次行为
     * @param {Object} action - 行为对象
     * @returns {Object} 行为记录
     */
    recordAction(action) {
        const actionRecord = {
            type: action.type || 'unknown',
            intent: action.intent || 'unknown',
            tools: action.tools || [],
            topic: action.topic || '',
            emotion: action.emotion || 'neutral',
            timestamp: Date.now(),
            hour: new Date().getHours(),
            dayOfWeek: new Date().getDay(),
            sessionId: action.sessionId || 'default'
        };

        this.updateTransitionMatrix(actionRecord);
        this.updateTimeActionMap(actionRecord);
        this.updateUserHabits(actionRecord);

        this.sessionActions.push(actionRecord);
        if (this.sessionActions.length > this.maxSessionLength) {
            this.sessionActions.shift();
        }

        this.data.actionHistory.push(actionRecord);
        if (this.data.actionHistory.length > MAX_HISTORY_LENGTH) {
            this.data.actionHistory = this.data.actionHistory.slice(-300);
        }

        this.data.stats.totalActions++;

        if (this.data.predictions.length > 0) {
            const latestPrediction = this.data.predictions[this.data.predictions.length - 1];
            if (latestPrediction.predictedAction === actionRecord.type ||
                latestPrediction.predictedIntent === actionRecord.intent) {
                this.data.stats.correctPredictions++;
            }
            this.data.stats.totalPredictions++;
            this.data.stats.accuracy = this.data.stats.totalPredictions > 0
                ? this.data.stats.correctPredictions / this.data.stats.totalPredictions
                : 0;
        }

        this.save();
        return actionRecord;
    }

    updateTransitionMatrix(action) {
        if (this.sessionActions.length === 0) return;

        const prevAction = this.sessionActions[this.sessionActions.length - 1];
        const fromKey = `${prevAction.type}:${prevAction.intent}`;
        const toKey = `${action.type}:${action.intent}`;

        if (!this.data.transitionMatrix[fromKey]) {
            this.data.transitionMatrix[fromKey] = {};
        }

        this.data.transitionMatrix[fromKey][toKey] =
            (this.data.transitionMatrix[fromKey][toKey] || 0) + 1;
    }

    updateTimeActionMap(action) {
        const timeKey = `${action.hour}_${action.dayOfWeek}`;

        if (!this.data.timeActionMap[timeKey]) {
            this.data.timeActionMap[timeKey] = {};
        }

        const actionKey = `${action.type}:${action.intent}`;
        this.data.timeActionMap[timeKey][actionKey] =
            (this.data.timeActionMap[timeKey][actionKey] || 0) + 1;
    }

    updateUserHabits(action) {
        const habitKey = `${action.type}_${action.intent}`;

        if (!this.data.userHabits[habitKey]) {
            this.data.userHabits[habitKey] = {
                count: 0,
                avgHour: 0,
                hours: [],
                commonEmotions: {},
                commonTopics: {},
                lastSeen: null
            };
        }

        const habit = this.data.userHabits[habitKey];
        habit.count++;
        habit.hours.push(action.hour);
        if (habit.hours.length > 50) habit.hours = habit.hours.slice(-30);
        habit.avgHour = habit.hours.reduce((a, b) => a + b, 0) / habit.hours.length;
        habit.commonEmotions[action.emotion] = (habit.commonEmotions[action.emotion] || 0) + 1;
        if (action.topic) {
            habit.commonTopics[action.topic] = (habit.commonTopics[action.topic] || 0) + 1;
        }
        habit.lastSeen = Date.now();
    }

    predict(currentAction) {
        const predictions = [];

        const transitionPred = this.predictFromTransitions(currentAction);
        if (transitionPred) predictions.push(transitionPred);

        const timePred = this.predictFromTime();
        if (timePred) predictions.push(timePred);

        const habitPred = this.predictFromHabits(currentAction);
        if (habitPred) predictions.push(habitPred);

        const sequencePred = this.predictFromSequence();
        if (sequencePred) predictions.push(sequencePred);

        predictions.sort((a, b) => b.probability - a.probability);

        const topPredictions = predictions.slice(0, 3);

        this.data.predictions.push({
            timestamp: Date.now(),
            currentAction: `${currentAction.type}:${currentAction.intent}`,
            predictedAction: topPredictions[0]?.predictedAction || 'unknown',
            predictedIntent: topPredictions[0]?.predictedIntent || 'unknown',
            probability: topPredictions[0]?.probability || 0,
            allPredictions: topPredictions
        });

        if (this.data.predictions.length > 100) {
            this.data.predictions = this.data.predictions.slice(-50);
        }

        this.save();
        return topPredictions;
    }

    predictFromTransitions(currentAction) {
        const fromKey = `${currentAction.type}:${currentAction.intent}`;
        const transitions = this.data.transitionMatrix[fromKey];

        if (!transitions) return null;

        const total = Object.values(transitions).reduce((a, b) => a + b, 0);
        if (total < 3) return null;

        const sorted = Object.entries(transitions).sort((a, b) => b[1] - a[1]);
        const [topKey, topCount] = sorted[0];
        const [predictedType, predictedIntent] = topKey.split(':');

        return {
            method: 'transition',
            predictedAction: predictedType,
            predictedIntent,
            probability: Math.min(topCount / total, 0.95),
            description: `基于行为转移模式，用户接下来可能${predictedIntent === 'chat' ? '继续聊天' : predictedIntent === 'coding' ? '写代码' : predictedIntent === 'search' ? '搜索信息' : '进行' + predictedIntent}`,
            suggestedResponse: this.getSuggestedResponse(predictedIntent)
        };
    }

    predictFromTime() {
        const hour = new Date().getHours();
        const dayOfWeek = new Date().getDay();
        const timeKey = `${hour}_${dayOfWeek}`;
        const timeActions = this.data.timeActionMap[timeKey];

        if (!timeActions) return null;

        const total = Object.values(timeActions).reduce((a, b) => a + b, 0);
        if (total < 3) return null;

        const sorted = Object.entries(timeActions).sort((a, b) => b[1] - a[1]);
        const [topKey, topCount] = sorted[0];
        const [predictedType, predictedIntent] = topKey.split(':');

        return {
            method: 'time_pattern',
            predictedAction: predictedType,
            predictedIntent,
            probability: Math.min(topCount / total * 0.8, 0.85),
            description: `基于时间习惯（${hour}:00，${this.getDayName(dayOfWeek)}），用户通常${predictedIntent === 'chat' ? '聊天' : predictedIntent === 'coding' ? '写代码' : predictedIntent}`,
            suggestedResponse: this.getSuggestedResponse(predictedIntent)
        };
    }

    predictFromHabits(currentAction) {
        const habitKey = `${currentAction.type}_${currentAction.intent}`;
        const habit = this.data.userHabits[habitKey];

        if (!habit || habit.count < 3) return null;

        const topEmotion = Object.entries(habit.commonEmotions)
            .sort((a, b) => b[1] - a[1])[0];
        const topTopic = Object.entries(habit.commonTopics)
            .sort((a, b) => b[1] - a[1])[0];

        return {
            method: 'habit',
            predictedAction: currentAction.type,
            predictedIntent: currentAction.intent,
            probability: Math.min(habit.count / 20, 0.9),
            description: `基于用户习惯，${currentAction.intent}时通常情绪${topEmotion ? topEmotion[0] : '平静'}${topTopic ? '，话题:' + topTopic[0] : ''}`,
            suggestedResponse: this.getSuggestedResponse(currentAction.intent, topEmotion?.[0])
        };
    }

    predictFromSequence() {
        if (this.sessionActions.length < 2) return null;

        const last2 = this.sessionActions.slice(-2).map(a => `${a.type}:${a.intent}`).join('→');
        const candidates = [];

        for (const [fromKey, transitions] of Object.entries(this.data.transitionMatrix)) {
            const total = Object.values(transitions).reduce((a, b) => a + b, 0);
            if (total < 2) continue;

            for (const [toKey, count] of Object.entries(transitions)) {
                candidates.push({
                    from: fromKey,
                    to: toKey,
                    probability: count / total
                });
            }
        }

        const matching = candidates.filter(c => last2.endsWith(c.from.split(':')[1]));
        if (matching.length === 0) return null;

        matching.sort((a, b) => b.probability - a.probability);
        const best = matching[0];
        const [predictedType, predictedIntent] = best.to.split(':');

        return {
            method: 'sequence',
            predictedAction: predictedType,
            predictedIntent,
            probability: best.probability * 0.7,
            description: `基于对话序列模式，预测下一步为${predictedIntent}`,
            suggestedResponse: this.getSuggestedResponse(predictedIntent)
        };
    }

    getSuggestedResponse(intent, emotion = null) {
        const suggestions = {
            chat: {
                neutral: '保持轻松对话风格',
                happy: '用欢快的语气回应',
                sad: '给予温暖安慰',
                default: '自然地继续对话'
            },
            coding: {
                default: '准备代码编辑环境和相关工具'
            },
            search: {
                default: '预加载搜索工具，准备信息检索'
            },
            system: {
                default: '准备系统控制工具'
            }
        };

        const intentSuggestions = suggestions[intent] || suggestions.chat;
        return intentSuggestions[emotion] || intentSuggestions.default || '自然回应';
    }

    getDayName(day) {
        return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day] || '';
    }

    getContextForLLM(currentAction = {}) {
        const predictions = this.predict(currentAction);

        if (predictions.length === 0) return '';

        const parts = ['[行为预测]'];
        predictions.forEach(p => {
            parts.push(`- ${p.description}（概率${(p.probability * 100).toFixed(0)}%，建议: ${p.suggestedResponse}）`);
        });

        if (this.data.stats.accuracy > 0) {
            parts.push(`预测准确率: ${(this.data.stats.accuracy * 100).toFixed(0)}%`);
        }

        return parts.join('\n');
    }

    getStats() {
        return {
            totalActions: this.data.stats.totalActions,
            predictionAccuracy: this.data.stats.accuracy,
            totalPredictions: this.data.stats.totalPredictions,
            correctPredictions: this.data.stats.correctPredictions,
            habitsCount: Object.keys(this.data.userHabits).length,
            transitionPatterns: Object.keys(this.data.transitionMatrix).length,
            topHabits: Object.entries(this.data.userHabits)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 5)
                .map(([key, val]) => ({
                    habit: key,
                    count: val.count,
                    avgHour: Math.round(val.avgHour),
                    topEmotion: Object.entries(val.commonEmotions).sort((a, b) => b[1] - a[1])[0]?.[0]
                }))
        };
    }
}

module.exports = new BehaviorPredictor();
