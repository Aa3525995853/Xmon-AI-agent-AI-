/**
 * @file suggestion_engine.js
 * @description 建议引擎 - 根据任务类型和上下文生成主动建议，
 *              帮助用户在任务完成后发现下一步操作
 * @module services/emotion_feedback
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// SuggestionEngine 类：建议生成核心逻辑
// ============================================================

class SuggestionEngine {
    /**
     * @description 根据任务类型获取对应的建议
     * @param {Object} taskResult - 任务结果
     * @param {string} taskResult.taskType - 任务类型
     * @param {Object} context - 上下文信息
     * @param {boolean} [context.hasMeetingTomorrow] - 明天是否有会议
     * @param {string} [context.suggestedTime] - 建议的时间
     * @returns {{text: string, action: string, confidence: number}|null} 建议对象，无匹配返回 null
     */
    getTaskSuggestion(taskResult, context) {
        const { taskType } = taskResult;

        const taskSuggestions = {
            'organize_invoice': {
                text: '报销单已经准备好了，要我现在帮你打印出来吗？',
                action: 'print',
                confidence: 0.7
            },
            'generate_report': {
                text: context.hasMeetingTomorrow
                    ? `明天会议很满，建议把汇报时间定在${context.suggestedTime || '下午3点'}，需要我帮你预约会议室吗？`
                    : '汇报内容已经准备好了，要我再润色一下吗？',
                action: context.hasMeetingTomorrow ? 'book_meeting' : 'polish_report',
                confidence: context.hasMeetingTomorrow ? 0.85 : 0.6
            },
            'organize_files': {
                text: '桌面清爽多了！要我把快捷方式也重新排列一下吗？',
                action: 'organize_shortcuts',
                confidence: 0.7
            },
            'send_email': {
                text: '邮件发出去了，要我帮你跟进一下回复吗？',
                action: 'track_reply',
                confidence: 0.5
            }
        };

        return taskSuggestions[taskType] || null;
    }

    /**
     * @description 根据上下文生成建议，如长时间工作提醒和未完成任务提示
     * @param {Object} context - 上下文信息
     * @param {number} [context.sessionDuration] - 会话持续时间（毫秒）
     * @param {Array} [context.unfinishedTasks] - 未完成任务列表
     * @returns {Array<{text: string, action: string, confidence: number}>} 建议列表
     */
    getContextSuggestions(context) {
        const suggestions = [];

        // 长时间工作提醒
        if (context.sessionDuration && context.sessionDuration > 60 * 60 * 1000) {
            suggestions.push({
                text: '连续工作挺久的了，要不要休息一下？',
                action: 'remind_break',
                confidence: 0.75
            });
        }

        // 有未完成任务
        if (context.unfinishedTasks && context.unfinishedTasks.length > 0) {
            suggestions.push({
                text: `还有${context.unfinishedTasks.length}个待办，要不要我帮你梳理一下优先级？`,
                action: 'prioritize_tasks',
                confidence: 0.65
            });
        }

        return suggestions;
    }
}

module.exports = new SuggestionEngine();