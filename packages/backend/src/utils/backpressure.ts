/**
 * 背压控制工具
 * 用于流式响应的流量控制，防止内存溢出和客户端过载
 */

import { Response } from 'express';

/**
 * 背压控制器配置选项
 */
export interface BackpressureOptions {
    highWaterMark?: number;
  lowWaterMark?: number;
    maxQueueSize?: number;
}

/**
 * 队列项
 */
interface QueueItem {
    event: string;
    data: string;
    size: number;
    timestamp: number;
}

/**
 * 背压控制器统计信息
 */
export interface BackpressureStats {
    queueLength: number;
    queueSize: number;
    totalSent: number;
    droppedCount: number;
    isPaused: boolean;
    isDraining: boolean;
    bufferedAmount: number;
}

/**
 * 背压控制器接口
 */
export interface BackpressureController {
    sendSSE: (event: string, data: any) => boolean;
    flush: () => Promise<void>;
    pause: () => void;
    resume: () => void;
    getStats: () => BackpressureStats;
    isWritable: () => boolean;
}

/**
 * 创建带背压控制的 SSE 发送器
 * @param res - Express响应对象
 * @param options - 配置选项
 * @returns 带背压控制的发送器
 */
export function createBackpressureController(
    res: Response,
    options: BackpressureOptions = {}
): BackpressureController {
    const {
        highWaterMark = 64 * 1024,    // 64KB
      lowWaterMark = 16 * 1024,     // 16KB
        maxQueueSize = 100
    } = options;

    let queue: QueueItem[] = [];
    let queueSize = 0;
    let isDraining = false;
    let isPaused = false;
    let totalSent = 0;
    let droppedCount = 0;

    // 检查响应是否仍然可写
    function isWritable(): boolean {
        return res && !res.writableEnded && !res.destroyed;
    }

    // 获取响应缓冲区大小
    function getBufferedAmount(): number {
        return res.socket ? res.socket.writableLength : 0;
    }

    // 等待可写空间
    async function waitForDrain(): Promise<boolean> {
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

    // 处理队列
    async function processQueue(): Promise<void> {
        if (isPaused || isDraining || queue.length === 0) return;

        while (queue.length > 0 && isWritable()) {
            const buffered = getBufferedAmount();

        // 如果缓冲区超过高水位线，暂停发送
            if (buffered >= highWaterMark) {
                await waitForDrain();
          continue;
            }

         const item = queue.shift();
            if (!item) break;

            queueSize -= item.size;

            try {
                const canContinue = res.write(item.data);
           totalSent += item.size;

                // 如果返回 false，等待 drain 事件
            if (!canContinue) {
                  await waitForDrain();
                }
            } catch (err) {
              const error = err as Error;
                console.error('[背压] 写入错误:', error.message);
          break;
            }
        }
    }

    /**
     * 发送 SSE 事件
     * @param event - 事件名称
     * @param data - 事件数据
     * @returns 是否成功加入队列
     */
    function sendSSE(event: string, data: any): boolean {
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
     * 刷新队列，确保所有数据发送完毕
     */
    async function flush(): Promise<void> {
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
     * 暂停发送
     */
    function pause(): void {
        isPaused = true;
        console.log('[背压] 发送已暂停');
    }

    /**
     * 恢复发送
     */
    function resume(): void {
        isPaused = false;
        console.log('[背压] 发送已恢复');
        processQueue();
    }

    /**
     * 获取统计信息
     */
    function getStats(): BackpressureStats {
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

    // 监听客户端关闭
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

/**
 * 流控包装器选项
 */
export interface StreamThrottlerOptions {
    chunkSize?: number;
    delayMs?: number;
}

/**
 * 流控包装器接口
 */
export interface StreamThrottler {
    write: (data: Buffer | string) => Promise<void>;
    end: () => Promise<void>;
}

/**
 * 写入函数类型
 */
type WriteFn = (chunk: Buffer, callback: (err?: Error) => void) => void;

/**
 * 简单的流控包装器
 * 用于非 SSE 的流式响应
 */
export function createStreamThrottler(
    writeFn: WriteFn,
    options: StreamThrottlerOptions = {}
): StreamThrottler {
    const {
        chunkSize = 16 * 1024,      // 16KB 每块
        delayMs = 10                 // 每块间隔
    } = options;

    let buffer = Buffer.alloc(0);
    let isWriting = false;

    async function write(data: Buffer | string): Promise<void> {
        buffer = Buffer.concat([buffer, Buffer.from(data)]);

        if (isWriting) return;
        isWriting = true;

        while (buffer.length > 0) {
        const chunk = buffer.slice(0, chunkSize);
            buffer = buffer.slice(chunkSize);

            await new Promise<void>((resolve, reject) => {
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

    async function end(): Promise<void> {
    if (buffer.length > 0) {
            await write(Buffer.alloc(0));
        }
    }

    return { write, end };
}
