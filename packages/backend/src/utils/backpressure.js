/**
 * @file backpressure.js
 * @description 背压控制工具，用于流式响应的流量控制，防止内存溢出和客户端过载。
 *              提供 SSE 背压控制器和流式节流器两种机制。
 * @module utils/backpressure
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 模块名称：SSE 背压控制器
// 功能说明：创建带背压控制的 SSE 发送器，管理发送队列和缓冲区
// ============================================================

/**
 * @description 创建带背压控制的 SSE 发送器，当客户端缓冲区超过高水位线时自动暂停发送，
 *              等待 drain 事件后继续。队列满时优先丢弃非关键事件，保留 text/done/error 事件。
 * @param {Object} res - Express 响应对象
 * @param {Object} [options={}] - 配置选项
 * @param {number} [options.highWaterMark=65536] - 高水位线（字节），默认 64KB
 * @param {number} [options.lowWaterMark=16384] - 低水位线（字节），默认 16KB
 * @param {number} [options.maxQueueSize=100] - 最大队列大小
 * @returns {{sendSSE: Function, flush: Function, pause: Function, resume: Function, getStats: Function, isWritable: Function}} 背压控制器
 */
function createBackpressureController(res, options = {}) {
    const {
        highWaterMark = 64 * 1024,    // 64KB
        lowWaterMark = 16 * 1024,     // 16KB
        maxQueueSize = 100
    } = options;

    let queue = [];
    let queueSize = 0;
    let isDraining = false;
    let isPaused = false;
    let totalSent = 0;
    let droppedCount = 0;

    /** @description 检查响应是否仍然可写 */
    function isWritable() {
        return res && !res.writableEnded && !res.destroyed;
    }

    // 获取响应缓冲区大小
    function getBufferedAmount() {
        return res.socket ? res.socket.writableLength : 0;
    }

    // 等待可写空间
    async function waitForDrain() {
        if (!isWritable()) return false;
        
        const buffered = getBufferedAmount();
        if (buffered < highWaterMark) return true;

        isDraining = true;
        console.log(`[背压] 缓冲区已满 (${buffered} bytes)，等待 drain 事件...`);

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log('[背压] 等待 drain 超时，强制继续');
                isDraining = false;
                resolve(true);
            }, 5000);

            res.once('drain', () => {
                clearTimeout(timeout);
                isDraining = false;
                console.log('[背压] 收到 drain 事件，继续发送');
                resolve(true);
            });
        });
    }

    /**
     * @description 处理发送队列，逐项发送并检查背压
     * @returns {Promise<void>}
     */
    async function processQueue() {
        if (isPaused || isDraining || queue.length === 0) return;

        while (queue.length > 0 && isWritable()) {
            const buffered = getBufferedAmount();
            
            // 如果缓冲区超过高水位线，暂停发送
            if (buffered >= highWaterMark) {
                await waitForDrain();
                continue;
            }

            const item = queue.shift();
            queueSize -= item.size;

            try {
                const canContinue = res.write(item.data);
                totalSent += item.size;

                // 如果返回 false，等待 drain 事件
                if (!canContinue) {
                    await waitForDrain();
                }
            } catch (err) {
                console.error('[背压] 写入错误:', err.message);
                break;
            }
        }
    }

    /**
     * 发送 SSE 事件
     * @param {string} event - 事件名称
     * @param {Object} data - 事件数据
     * @returns {boolean} 是否成功加入队列
     */
    function sendSSE(event, data) {
        if (!isWritable()) {
            console.log('[背压] 响应已关闭，丢弃事件:', event);
            return false;
        }

        const sseData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        const size = Buffer.byteLength(sseData, 'utf8');

        // 如果队列已满，丢弃最旧的数据（保留 text 和 done 事件）
        if (queue.length >= maxQueueSize) {
            const importantEvents = ['text', 'done', 'error'];
            const canDrop = queue.findIndex(item => !importantEvents.includes(item.event));
            
            if (canDrop !== -1) {
                const dropped = queue.splice(canDrop, 1)[0];
                queueSize -= dropped.size;
                droppedCount++;
                console.log(`[背压] 队列已满，丢弃事件: ${dropped.event}`);
            } else if (!importantEvents.includes(event)) {
                // 如果都是重要事件且当前事件不重要，丢弃当前
                droppedCount++;
                console.log(`[背压] 队列已满，丢弃当前事件: ${event}`);
                return false;
            }
        }

        queue.push({
            event,
            data: sseData,
            size,
            timestamp: Date.now()
        });
        queueSize += size;

        // 立即尝试处理队列
        processQueue();

        return true;
    }

    /**
     * @description 刷新队列，确保所有数据发送完毕后关闭响应
     * @returns {Promise<void>}
     */
    async function flush() {
        console.log(`[背压] 刷新队列，剩余 ${queue.length} 个事件`);
        
        while (queue.length > 0 && isWritable()) {
            await processQueue();
            
            // 短暂等待，让数据实际发送
            if (queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        if (isWritable()) {
            res.end();
        }

        console.log(`[背压] 统计: 发送 ${totalSent} bytes, 丢弃 ${droppedCount} 个事件`);
    }

    /**
     * @description 暂停发送
     * @returns {void}
     */
    function pause() {
        isPaused = true;
        console.log('[背压] 发送已暂停');
    }

    /**
     * 恢复发送
     */
    function resume() {
        isPaused = false;
        console.log('[背压] 发送已恢复');
        processQueue();
    }

    /**
     * 获取统计信息
     */
    function getStats() {
        return {
            queueLength: queue.length,
            queueSize,
            totalSent,
            droppedCount,
            isPaused,
            isDraining,
            bufferedAmount: getBufferedAmount()
        };
    }

    // 监听客户端关闭事件，清空队列防止内存泄漏
    res.on('close', () => {
        console.log('[背压] 客户端断开连接');
        queue = [];
        queueSize = 0;
    });

    return {
        sendSSE,
        flush,
        pause,
        resume,
        getStats,
        isWritable
    };
}

// ============================================================
// 模块名称：流式节流器
// 功能说明：用于非 SSE 的流式响应，按块大小和间隔控制写入速率
// ============================================================

/**
 * @description 创建简单的流控包装器，按指定块大小和间隔分块写入数据
 * @param {Function} writeFn - 写入函数，接受 (chunk, callback) 参数
 * @param {Object} [options={}] - 配置选项
 * @param {number} [options.chunkSize=16384] - 每块大小（字节），默认 16KB
 * @param {number} [options.delayMs=10] - 每块间隔（毫秒）
 * @returns {{write: Function, end: Function}} 流控包装器，包含 write 和 end 方法
 */
function createStreamThrottler(writeFn, options = {}) {
    const {
        chunkSize = 16 * 1024,      // 16KB 每块
        delayMs = 10                 // 每块间隔
    } = options;

    let buffer = Buffer.alloc(0);
    let isWriting = false;

    /**
     * @description 将数据写入缓冲区并按块大小分块发送
     * @param {string|Buffer} data - 待写入的数据
     * @returns {Promise<void>}
     */
    async function write(data) {
        buffer = Buffer.concat([buffer, Buffer.from(data)]);

        if (isWriting) return;
        isWriting = true;

        while (buffer.length > 0) {
            const chunk = buffer.slice(0, chunkSize);
            buffer = buffer.slice(chunkSize);

            await new Promise((resolve, reject) => {
                writeFn(chunk, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            if (buffer.length > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        isWriting = false;
    }

    /**
     * @description 刷新剩余缓冲区数据并结束写入
     * @returns {Promise<void>}
     */
    async function end() {
        if (buffer.length > 0) {
            await write(Buffer.alloc(0));
        }
    }

    return { write, end };
}

module.exports = {
    createBackpressureController,
    createStreamThrottler
};
