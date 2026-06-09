/**
 * @file checkpoint_manager.js
 * @description 检查点管理器 - 在任务执行过程中保存和恢复状态快照，
 *              支持任务失败后回滚到最近的检查点重新执行
 * @module services/healer
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class CheckpointManager {
    /**
     * @description 构造函数，初始化检查点存储
     */
    constructor() {
        /** 检查点存储映射，键为计划ID，值为状态快照 */
        this.checkpoints = new Map();
    }

    /**
     * @description 保存指定计划的检查点状态
     * @param {string} planId - 计划唯一标识
     * @param {Object} state - 需要保存的状态快照
     * @returns {void}
     */
    save(planId, state) {
        this.checkpoints.set(planId, { ...state, timestamp: Date.now() });
    }

    /**
     * @description 获取指定计划的检查点状态
     * @param {string} planId - 计划唯一标识
     * @returns {Object|undefined} 检查点状态，不存在则返回 undefined
     */
    get(planId) {
        return this.checkpoints.get(planId);
    }

    /**
     * @description 清除指定计划的检查点
     * @param {string} planId - 计划唯一标识
     * @returns {boolean} 是否成功删除
     */
    clear(planId) {
        return this.checkpoints.delete(planId);
    }

    /**
     * @description 清除所有检查点
     * @returns {void}
     */
    clearAll() {
        this.checkpoints.clear();
    }

    /**
     * @description 获取当前保存的检查点数量
     * @returns {number} 检查点数量
     */
    size() {
        return this.checkpoints.size;
    }
}

module.exports = new CheckpointManager();