/**
 * @file progress_tracker.js
 * @description 进度追踪器 - 定时推送任务执行进度，按时间阶段显示不同状态
 * @module services/workBrainClient
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../../utils/logger');

/** 进度推送间隔（毫秒） */
const PROGRESS_INTERVAL = 4000;

/** 进度阶段定义 - 根据已用时间显示不同状态 */
const PROGRESS_STAGES = [
    { after: 0, status: 'thinking', message: '正在思考怎么完成...' },
    { after: 3000, status: 'planning', message: '正在规划执行步骤...' },
    { after: 8000, status: 'executing', message: '正在执行中...' },
    { after: 20000, status: 'processing', message: '正在处理数据...' },
    { after: 40000, status: 'generating', message: '正在生成结果...' },
    { after: 60000, status: 'finalizing', message: '快好了，正在收尾...' }
];

class ProgressTracker {
    constructor() {
        this.timer = null;
    }

    /**
     * @description 启动进度追踪，定时推送进度信息
     * @param {Function} onProgress - 进度回调函数
     * @param {number} startTime - 任务开始时间戳
     * @returns {void}
     */
    start(onProgress, startTime) {
        this.stop();

        this.timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            let currentStage = PROGRESS_STAGES[0];

            for (const stage of PROGRESS_STAGES) {
                if (elapsed >= stage.after) currentStage = stage;
            }

            if (onProgress) {
                onProgress({
                    status: currentStage.status,
                    message: currentStage.message,
                    elapsed
                });
            }
        }, PROGRESS_INTERVAL);

        logger.debug('[ProgressTracker] 进度追踪已启动');
    }

    /**
     * @description 停止进度追踪
     * @returns {void}
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger.debug('[ProgressTracker] 进度追踪已停止');
        }
    }
}

module.exports = new ProgressTracker();