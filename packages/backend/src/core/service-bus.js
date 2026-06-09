/**
 * @file service-bus.js
 * @description 事件驱动通信总线，提供发布/订阅、请求-响应、请求缓冲和中间件机制
 * @module core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心职责：
 * 1. 插件间解耦通信（发布/订阅模式）
 * 2. 任务进度实时推送
 * 3. 系统事件广播（健康检查、降级、故障恢复）
 * 4. 请求缓冲（插件崩溃时暂存请求）
 */

const { EventEmitter } = require('events');

/** 默认最大事件监听器数量 */
const MAX_LISTENERS = 50;
/** 请求-响应模式默认超时时间（毫秒） */
const REQUEST_TIMEOUT = 30000;

class ServiceBus extends EventEmitter {
    /**
     * @description 构造函数，初始化频道、请求缓冲和中间件
     */
    constructor() {
        super();
        this.setMaxListeners(MAX_LISTENERS);

        this._channels = new Map();
        this._requestBuffer = new Map();
        this._middleware = [];
        this._stats = {
            published: 0,
            delivered: 0,
            buffered: 0,
            dropped: 0
        };
    }

    // ============================================================
    // 发布/订阅：核心消息通信
    // ============================================================

    /**
     * @description 订阅指定频道，返回取消订阅函数
     * @param {string} channel - 频道名称
     * @param {Function} handler - 消息处理函数
     * @returns {Function} 取消订阅函数
     */
    subscribe(channel, handler) {
        if (!this._channels.has(channel)) {
            this._channels.set(channel, []);
        }
        this._channels.get(channel).push(handler);
        this.on(channel, handler);
        return () => {
            const handlers = this._channels.get(channel);
            if (handlers) {
                const idx = handlers.indexOf(handler);
                if (idx !== -1) handlers.splice(idx, 1);
            }
            this.removeListener(channel, handler);
        };
    }

    /**
     * @description 发布消息到指定频道，经过中间件处理后广播
     * @param {string} channel - 频道名称
     * @param {*} data - 消息数据
     */
    publish(channel, data) {
        this._stats.published++;

        for (const mw of this._middleware) {
            try {
                const result = mw(channel, data);
                if (result === false) {
                    this._stats.dropped++;
                    return;
                }
                if (result && typeof result === 'object') {
                    data = result;
                }
            } catch (e) {
                console.warn('[ServiceBus] 中间件错误:', e.message);
            }
        }

        this.emit(channel, data);
        this._stats.delivered++;
    }

    // ============================================================
    // 请求-响应模式：支持异步等待响应的通信
    // ============================================================

    /**
     * @description 发送请求并等待响应，超时后拒绝
     * @param {string} channel - 请求频道
     * @param {*} data - 请求数据
     * @param {number} [timeout=REQUEST_TIMEOUT] - 超时时间（毫秒）
     * @returns {Promise<*>} 响应数据
     * @throws {Error} 超时时抛出 SERVICEBUS_TIMEOUT 错误
     */
    async request(channel, data, timeout = REQUEST_TIMEOUT) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._requestBuffer.delete(channel);
                reject(new Error(`SERVICEBUS_TIMEOUT: ${channel}`));
            }, timeout);

            const responseChannel = `${channel}:response:${Date.now()}`;

            this.once(responseChannel, (response) => {
                clearTimeout(timer);
                this._requestBuffer.delete(channel);
                resolve(response);
            });

            this.publish(channel, { ...data, _replyTo: responseChannel });
        });
    }

    /**
     * @description 注册频道响应处理器，收到请求后自动回复
     * @param {string} channel - 响应频道
     * @param {Function} handler - 响应处理函数
     */
    serve(channel, handler) {
        this.subscribe(channel, async (data) => {
            try {
                const result = await handler(data);
                if (data._replyTo) {
                    this.publish(data._replyTo, result);
                }
            } catch (e) {
                if (data._replyTo) {
                    this.publish(data._replyTo, { error: e.message });
                }
            }
        });
    }

    // ============================================================
    // 请求缓冲：插件崩溃时暂存请求，恢复后重放
    // ============================================================

    /**
     * @description 缓冲请求到指定频道，用于故障恢复后重放
     * @param {string} channel - 频道名称
     * @param {*} data - 请求数据
     */
    bufferRequest(channel, data) {
        if (!this._requestBuffer.has(channel)) {
            this._requestBuffer.set(channel, []);
        }
        this._requestBuffer.get(channel).push({ data, timestamp: Date.now() });
        this._stats.buffered++;
    }

    /**
     * @description 重放指定频道的缓冲请求，返回重放数量
     * @param {string} channel - 频道名称
     * @returns {number} 重放的请求数量
     */
    replayBuffered(channel) {
        const buffered = this._requestBuffer.get(channel) || [];
        this._requestBuffer.delete(channel);
        for (const { data } of buffered) {
            this.publish(channel, data);
        }
        return buffered.length;
    }

    // ============================================================
    // 中间件：消息发布前的拦截和变换
    // ============================================================

    /**
     * @description 注册中间件，中间件可拦截或变换发布的消息
     * @param {Function} middleware - 中间件函数，接收 (channel, data)，返回 false 拦截，返回对象替换 data
     */
    use(middleware) {
        this._middleware.push(middleware);
    }

    // ============================================================
    // 系统事件：预定义的系统级事件快捷方法
    // ============================================================

    /**
     * @description 发布任务进度事件
     * @param {string} taskId - 任务ID
     * @param {Object} progress - 进度信息
     */
    emitProgress(taskId, progress) {
        this.publish('progress', { taskId, ...progress, timestamp: Date.now() });
    }

    /**
     * @description 发布任务开始事件
     * @param {string} taskId - 任务ID
     * @param {Object} plan - 任务计划
     */
    emitTaskStart(taskId, plan) {
        this.publish('task:start', { taskId, plan, timestamp: Date.now() });
    }

    /**
     * @description 发布任务完成事件
     * @param {string} taskId - 任务ID
     * @param {*} result - 任务结果
     */
    emitTaskComplete(taskId, result) {
        this.publish('task:complete', { taskId, result, timestamp: Date.now() });
    }

    /**
     * @description 发布任务失败事件
     * @param {string} taskId - 任务ID
     * @param {Error} error - 错误对象
     */
    emitTaskFail(taskId, error) {
        this.publish('task:fail', { taskId, error: error.message, timestamp: Date.now() });
    }

    /**
     * @description 发布插件崩溃事件
     * @param {string} pluginName - 插件名称
     * @param {Error} error - 错误对象
     */
    emitPluginCrash(pluginName, error) {
        this.publish('plugin:crash', { pluginName, error: error.message, timestamp: Date.now() });
    }

    /**
     * @description 发布模型降级事件
     * @param {string} from - 降级前模型名称
     * @param {string} to - 降级后模型名称
     */
    emitModelDegradation(from, to) {
        this.publish('model:degradation', { from, to, timestamp: Date.now() });
    }

    // ============================================================
    // 状态查询：获取总线统计和频道信息
    // ============================================================

    /**
     * @description 获取总线统计信息
     * @returns {Object} 统计信息，包含发布数、投递数、缓冲数等
     */
    getStats() {
        return { ...this._stats, channels: this._channels.size, bufferSize: this._requestBuffer.size };
    }

    /**
     * @description 获取所有已注册的频道名称
     * @returns {Array<string>} 频道名称列表
     */
    getChannels() {
        return Array.from(this._channels.keys());
    }
}

module.exports = new ServiceBus();
