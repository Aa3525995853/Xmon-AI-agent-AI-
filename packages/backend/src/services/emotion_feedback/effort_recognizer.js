/**
 * @file effort_recognizer.js
 * @description 努力认可器 - 根据任务难度生成努力肯定语，
 *              并基于耗时和错误数评估任务难度等级
 * @module services/emotion_feedback
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义：努力肯定语与难度阈值
// ============================================================

/** 按难度分级的努力肯定语 */
const EFFORT_PHRASES = {
    success: [
        '虽然花了不少时间，但结果很完美',
        '过程有点曲折，但结果不错',
        '中间遇到点小问题，不过都解决了',
        '花了一番功夫，但值得'
    ],
    easy: [
        '轻松搞定', '小意思', '分分钟的事', '不费吹灰之力',
        '三下五除二就搞定了', '小case'
    ]
};

/** 困难任务的时间阈值（毫秒），30 分钟 */
const HARD_TIME_THRESHOLD = 30 * 60 * 1000;

/** 简单任务的时间阈值（毫秒），5 分钟 */
const EASY_TIME_THRESHOLD = 5 * 60 * 1000;

/** 困难任务的错误数阈值 */
const HARD_ERROR_THRESHOLD = 3;

// ============================================================
// EffortRecognizer 类：努力认可与难度评估
// ============================================================

class EffortRecognizer {
    /**
     * @description 根据任务难度获取努力肯定语
     * @param {string} effort - 难度等级（easy/normal/hard/complex）
     * @param {Object} [details] - 任务详情
     * @returns {string|null} 努力肯定语，普通难度返回 null
     */
    getPhrase(effort, details) {
        if (effort === 'easy') {
            return this.randomPick(EFFORT_PHRASES.easy);
        }

        if (effort === 'hard' || effort === 'complex') {
            return this.randomPick(EFFORT_PHRASES.success);
        }

        return null;
    }

    /**
     * @description 评估任务难度，综合耗时和错误数量判断
     * @param {Object} taskResult - 任务结果
     * @param {Object} [taskResult.details] - 任务详情
     * @param {number} [taskResult.details.errors] - 错误数量
     * @param {number} [taskResult.details.complexSteps] - 复杂步骤数
     * @param {number} [taskResult.timeSpent] - 任务耗时（毫秒）
     * @returns {string} 难度等级（easy/normal/hard）
     */
    assessDifficulty(taskResult) {
        const { details, timeSpent } = taskResult;

        // 基于时间评估
        if (timeSpent > HARD_TIME_THRESHOLD) return 'hard';
        if (timeSpent < EASY_TIME_THRESHOLD) return 'easy';

        // 基于错误数量评估
        if (details?.errors > HARD_ERROR_THRESHOLD) return 'hard';
        if (details?.errors === 0 && details?.complexSteps < 2) return 'easy';

        return 'normal';
    }

    /**
     * @description 从数组中随机选择一个元素
     * @param {Array} array - 候选数组
     * @returns {*} 随机选中的元素
     */
    randomPick(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

module.exports = new EffortRecognizer();