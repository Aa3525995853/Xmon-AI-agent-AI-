/**
 * @file broadcast.js
 * @description WebSocket 广播器 - 负责将审核事件通过 WebSocket 和 EventEmitter 双通道广播，
 *              确保前端客户端和后端内部均能接收到审核状态变更通知
 * @module review_hub
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 核心类：Broadcast
// 功能说明：双通道消息广播（WebSocket + EventEmitter）
// ============================================================

class Broadcast {

    /**
     * @description 构造函数，初始化 WebSocket 广播器引用
     */
    constructor() {
        /** @type {Function|null} WebSocket 广播函数 */
        this._broadcaster = null;
    }

    /**
     * @description 设置 WebSocket 广播器函数
     * @param {Function} broadcaster - 广播函数，签名为 (event: string, data: Object) => void
     * @returns {void}
     */
    setBroadcaster(broadcaster) {
        this._broadcaster = broadcaster;
    }

    /**
     * @description 广播消息到 WebSocket 客户端和 EventEmitter 监听器
     * @param {EventEmitter|null} hub - ReviewHub 实例，用于内部事件发射
     * @param {string} event - 事件名称
     * @param {Object} data - 事件数据
     * @returns {void}
     */
    broadcast(hub, event, data) {
        // 向 WebSocket 客户端广播
        if (this._broadcaster) {
            this._broadcaster(event, data);
        }
        // 向后端内部 EventEmitter 监听器广播
        if (hub) {
            hub.emit(event, data);
        }
    }
}

module.exports = new Broadcast();