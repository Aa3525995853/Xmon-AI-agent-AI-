/**
 * @file websocketService.js
 * @description WebSocket 实时通信服务，双脑架构的"神经通路"，负责任务状态推送、工作大脑状态同步、客户端指令通道和多设备管理
 * @module services/websocketService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { Server } = require('socket.io');
const taskScheduler = require('../core/task-scheduler');
const workBrainClient = require('./workBrainClient');
const reviewHub = require('./review_hub');
const executor = require('./executor');
const { verifyToken } = require('../middleware/auth');

// ============================================================
// WebSocket 服务类
// ============================================================

class WebSocketService {
  /**
   * @description 构造函数，初始化连接设备映射
   */
  constructor() {
    this.io = null;
    this._taskListeners = [];
    this.connectedDevices = new Map();
  }

  /**
   * @description 初始化 WebSocket 服务，绑定认证中间件和事件处理器
   * @param {Object} httpServer - HTTP 服务器实例
   * @param {Object} [options={}] - 配置选项
   * @param {string} [options.corsOrigin='*'] - CORS 允许的来源
   * @param {string} [options.path='/ws'] - WebSocket 路径
   * @returns {Object} Socket.IO 实例
   */
  init(httpServer, options = {}) {
    this.io = new Server(httpServer, {
      cors: {
        origin: options.corsOrigin || '*',
        methods: ['GET', 'POST']
      },
      path: options.path || '/ws',
      pingInterval: 25000,
      pingTimeout: 10000
    });

    const enableAuth = process.env.ENABLE_AUTH === 'true';

    this.io.use((socket, next) => {
      if (!enableAuth) {
        socket._userId = 'legacy';
        socket.join('legacy');
        return next();
      }

      const token = socket.handshake.auth.token;
      if (!token) {
        console.warn(`[WS] 未提供 Token，拒绝连接: ${socket.id}`);
        return next(new Error('Authentication failed'));
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        console.warn(`[WS] Token 验证失败，拒绝连接: ${socket.id}`);
        return next(new Error('Authentication failed'));
      }

      socket._userId = decoded.userId;
      socket.join(`user:${decoded.userId}`);
      console.log(`[WS] 用户 ${decoded.userId} 认证成功: ${socket.id}`);
      next();
    });

    this.io.on('connection', (socket) => {
      const userId = socket._userId || 'legacy';
      console.log(`[WS] 客户端连接: ${socket.id} (用户: ${userId})`);

      socket.emit('init', {
        taskStatus: taskScheduler.getQueueStatus(),
        workbrainStatus: {
          available: workBrainClient._available,
          circuitBreaker: workBrainClient.getCircuitState()
        },
        userId
      });

      socket.on('device:register', (data) => {
        const { userId: regUserId, deviceType } = data;
        if (!regUserId || !deviceType) {
          socket.emit('device:register_result', { success: false, error: '缺少 userId 或 deviceType' });
          return;
        }

        const validTypes = ['pc', 'mobile'];
        if (!validTypes.includes(deviceType)) {
          socket.emit('device:register_result', { success: false, error: `deviceType 必须为 ${validTypes.join('/')}` });
          return;
        }

        const effectiveUserId = enableAuth ? userId : regUserId;

        if (enableAuth && userId !== 'legacy' && userId !== regUserId) {
          socket.emit('device:register_result', { success: false, error: '注册的 userId 与认证用户不匹配' });
          return;
        }

        if (!this.connectedDevices.has(effectiveUserId)) {
          this.connectedDevices.set(effectiveUserId, {});
        }
        const devices = this.connectedDevices.get(effectiveUserId);
        devices[deviceType] = socket.id;

        socket._registeredUserId = effectiveUserId;
        socket._deviceType = deviceType;

        socket.join(`user:${effectiveUserId}`);

        console.log(`[WS] 设备注册: ${effectiveUserId} / ${deviceType} (${socket.id})`);

        socket.emit('device:register_result', {
          success: true,
          userId: effectiveUserId,
          deviceType,
          onlineDevices: Object.keys(devices)
        });

        this.io.to(`user:${effectiveUserId}`).emit('device:online', {
          userId: effectiveUserId,
          deviceType,
          socketId: socket.id,
          onlineDevices: Object.keys(devices)
        });
      });

      socket.on('device:message', (data) => {
        const { targetDevice, message } = data;
        if (!targetDevice || !message) {
          socket.emit('device:message_result', { success: false, error: '缺少 targetDevice 或 message' });
          return;
        }

        const effectiveUserId = socket._registeredUserId || socket._userId || 'legacy';

        const devices = this.connectedDevices.get(effectiveUserId);
        if (!devices || !devices[targetDevice]) {
          socket.emit('device:message_result', { success: false, error: `目标设备 ${targetDevice} 不在线` });
          return;
        }

        const targetSocketId = devices[targetDevice];
        this.io.to(targetSocketId).emit('device:message', {
          from: socket._deviceType || 'unknown',
          fromSocketId: socket.id,
          message,
          timestamp: Date.now()
        });

        socket.emit('device:message_result', { success: true, targetDevice });
      });

      socket.on('task:cancel', async (taskId) => {
        let ok = taskScheduler.cancel(taskId);
        if (!ok) {
          try {
            const result = await executor.cancel(taskId);
            ok = !!result;
          } catch (err) {
            ok = false;
          }
        }
        socket.emit('task:cancel_result', { taskId, success: ok });
      });

      socket.on('task:prioritize', (taskId) => {
        const ok = taskScheduler.prioritize(taskId);
        socket.emit('task:prioritize_result', { taskId, success: ok });
      });

      socket.on('task:status', () => {
        socket.emit('task:status_update', taskScheduler.getQueueStatus());
      });

      socket.on('workbrain:status', () => {
        socket.emit('workbrain:status_update', {
          available: workBrainClient._available,
          circuitBreaker: workBrainClient.getCircuitState(),
          metrics: workBrainClient.getMetrics()
        });
      });

      socket.on('workbrain:metrics', () => {
        socket.emit('workbrain:metrics_update', workBrainClient.getMetrics());
      });

      socket.on('brain:state', (state) => {
        const effectiveUserId = socket._registeredUserId || socket._userId || 'legacy';
        if (effectiveUserId !== 'legacy') {
          socket.to(`user:${effectiveUserId}`).emit('brain:state_change', state);
        } else {
          socket.broadcast.emit('brain:state_change', state);
        }
      });

      socket.on('task:dispatch', (data) => {
        const { task, from } = data;
        const effectiveUserId = socket._registeredUserId || socket._userId || 'legacy';
        const devices = this.connectedDevices.get(effectiveUserId);
        if (devices && devices.pc) {
          this.io.to(devices.pc).emit('task:dispatch', {
            task,
            from: from || socket._deviceType || 'unknown',
            timestamp: Date.now()
          });
          socket.emit('task:dispatch_result', { success: true, targetDevice: 'pc' });
        } else {
          socket.emit('task:dispatch_result', { success: false, error: 'PC端不在线' });
        }
      });

      socket.on('chat:sync', (data) => {
        const { role, content, timestamp } = data;
        const effectiveUserId = socket._registeredUserId || socket._userId || 'legacy';
        socket.to(`user:${effectiveUserId}`).emit('chat:sync', {
          role,
          content,
          from: socket._deviceType || 'unknown',
          timestamp: timestamp || Date.now()
        });
      });

      socket.on('emotion:sync', (data) => {
        const { emotion, expression } = data;
        const effectiveUserId = socket._registeredUserId || socket._userId || 'legacy';
        socket.to(`user:${effectiveUserId}`).emit('emotion:sync', {
          emotion,
          expression,
          from: socket._deviceType || 'unknown',
          timestamp: Date.now()
        });
      });

      socket.on('pc:status', (data) => {
        const effectiveUserId = socket._registeredUserId || socket._userId || 'legacy';
        const devices = this.connectedDevices.get(effectiveUserId);
        if (devices && devices.mobile) {
          this.io.to(devices.mobile).emit('pc:status', {
            ...data,
            timestamp: Date.now()
          });
        }
      });

      // ==================== 工作大脑 2.0 事件处理 ====================
      socket.on('review:respond', (data) => {
        const { reviewId, response } = data;
        const effectiveUserId = socket._userId || 'legacy';

        reviewHub.respond(reviewId, response).then(result => {
          socket.emit('review:response_result', { reviewId, result });
          // 广播给所有该用户的连接
          this.io.to(`user:${effectiveUserId}`).emit('review:responded', {
            reviewId,
            response,
            result
          });
        }).catch(err => {
          socket.emit('review:response_result', { reviewId, error: err.message });
        });
      });

      socket.on('intent:clarify', (data) => {
        const { taskId, answer, options } = data;
        executor.respondToClarification(taskId, answer, options).then(result => {
          socket.emit('intent:clarify_result', { taskId, result });
        }).catch(err => {
          socket.emit('intent:clarify_result', { taskId, error: err.message });
        });
      });

      socket.on('disconnect', (reason) => {
        const registeredUserId = socket._registeredUserId;
        const deviceType = socket._deviceType;

        if (registeredUserId && deviceType) {
          const devices = this.connectedDevices.get(registeredUserId);
          if (devices && devices[deviceType] === socket.id) {
            delete devices[deviceType];

            if (Object.keys(devices).length === 0) {
              this.connectedDevices.delete(registeredUserId);
            } else {
              this.io.to(`user:${registeredUserId}`).emit('device:offline', {
                userId: registeredUserId,
                deviceType,
                onlineDevices: Object.keys(devices)
              });
            }

            console.log(`[WS] 设备注销: ${registeredUserId} / ${deviceType}`);
          }
        }

        console.log(`[WS] 客户端断开: ${socket.id} (${reason})`);
      });
    });

    this._bindTaskEvents();
    this._bindWorkBrainEvents();

    console.log(`[WS] WebSocket 服务已启动 (认证: ${enableAuth ? '已启用' : '未启用'})`);
    return this.io;
  }

  /**
   * @description 绑定任务相关事件到服务总线，转发任务状态变更
   * @returns {void}
   */
  _bindTaskEvents() {
    const serviceBus = require('../core/service-bus');

    const handlers = {
      'task:queued': (data) => this._broadcast('task:queued', data, data.userId),
      'task:started': (data) => this._broadcast('task:started', data, data.userId),
      'task:completed': (data) => {
        const taskId = data.id || data.taskId;
        console.log('[WS] 收到 task:completed 事件:', taskId, '结果:', data.result ? '有' : '无');
        this._broadcast('task:completed', data, data.userId);
        this._sendPushNotification(data.userId, {
          title: '✅ 任务完成',
          body: data.command ? `${data.command} 已完成` : '任务已完成',
          type: 'task_completed',
          tag: `task-${taskId || Date.now()}`
        });
      },
      'task:failed': (data) => {
        const taskId = data.id || data.taskId;
        this._broadcast('task:failed', data, data.userId);
        this._sendPushNotification(data.userId, {
          title: '❌ 任务失败',
          body: data.command ? `${data.command} 失败` : '任务执行失败',
          type: 'task_failed',
          tag: `task-${taskId || Date.now()}`
        });
      },
      'task:cancelled': (data) => this._broadcast('task:cancelled', data, data.userId),
      'task:degraded': (data) => this._broadcast('task:degraded', data, data.userId),
      'task:priority_changed': (data) => this._broadcast('task:priority_changed', data, data.userId),

      // 步骤级事件（任务编排器新增）
      'task:step_progress': (data) => this._broadcast('task:step_progress', data, data.userId),
      'step:start': (data) => this._broadcast('step:start', data, data.userId),
      'step:progress': (data) => this._broadcast('step:progress', data, data.userId),
      'step:complete': (data) => this._broadcast('step:complete', data, data.userId),
      'step:ask': (data) => this._broadcast('step:ask', data, data.userId),
      'task:complete': (data) => {
        const normalized = { ...data, id: data.id || data.taskId, status: data.status || 'completed' };
        this._broadcast('task:complete', data, data.userId);
        this._broadcast('task:completed', normalized, data.userId);
      },
      'task:fail': (data) => {
        const normalized = { ...data, id: data.id || data.taskId, status: data.status || 'failed' };
        this._broadcast('task:fail', data, data.userId);
        this._broadcast('task:failed', normalized, data.userId);
      },

      // 工作大脑 2.0 事件
      'review:new': (data) => this._broadcast('review:new', data, data.taskId ? undefined : undefined),
      'review:responded': (data) => this._broadcast('review:responded', data),
      'review:auto_approved': (data) => this._broadcast('review:auto_approved', data),
      'review:expired': (data) => this._broadcast('review:expired', data),
      'review:cancelled': (data) => this._broadcast('review:cancelled', data),
      'intent:understood': (data) => this._broadcast('intent:understood', data),
      'input:processed': (data) => this._broadcast('input:processed', data),
      'input:error': (data) => this._broadcast('input:error', data),

      // 工作区日志（新增）
      'work:log': (data) => {
        console.log('[WS] 收到 work:log 事件:', data.message ? data.message.substring(0, 30) : 'no message');
        this._broadcast('work:log', data, data.userId);
      },

      'workbrain:unstable': (data) => this._broadcast('workbrain:unstable', data)
    };

    for (const [event, handler] of Object.entries(handlers)) {
      serviceBus.subscribe(event, handler);
      this._taskListeners.push({ event, handler });
    }
  }

  /**
   * @description 绑定工作大脑健康监控事件，检测上下线变化并推送通知
   * @returns {void}
   */
  _bindWorkBrainEvents() {
    const originalStartMonitor = workBrainClient.startHealthMonitor.bind(workBrainClient);
    let prevAvailable = workBrainClient._available;

    workBrainClient.startHealthMonitor = function(intervalMs) {
      originalStartMonitor(intervalMs);

      const originalTimer = workBrainClient._healthCheckTimer;
      if (originalTimer) {
        clearInterval(originalTimer);
      }

      workBrainClient._healthCheckTimer = setInterval(async () => {
        const wasAvailable = workBrainClient._available;
        const nowAvailable = await workBrainClient.healthCheck();

        if (wasAvailable && !nowAvailable) {
          console.warn('[工作大脑] ⚠️ 工作大脑不可用！');
          if (wsService.io) {
            wsService._broadcast('workbrain:offline', {
              timestamp: Date.now(),
              circuitBreaker: workBrainClient.getCircuitState()
            });
          }
        } else if (!wasAvailable && nowAvailable) {
          console.log('[工作大脑] ✅ 工作大脑恢复了！');
          if (wsService.io) {
            wsService._broadcast('workbrain:online', {
              timestamp: Date.now(),
              circuitBreaker: workBrainClient.getCircuitState()
            });
          }
        }

        if (wsService.io) {
          wsService._broadcast('workbrain:health_tick', {
            available: nowAvailable,
            circuitBreaker: workBrainClient.getCircuitState(),
            timestamp: Date.now()
          });
        }
      }, intervalMs || 15000);
    };
  }

  /**
   * @description 广播事件，支持按用户房间定向推送
   * @param {string} event - 事件名称
   * @param {Object} data - 事件数据
   * @param {string} [userId] - 目标用户ID，为空则全局广播
   * @returns {void}
   */
  _broadcast(event, data, userId) {
    if (!this.io) return;
    if (userId && userId !== 'legacy') {
      this.io.to(`user:${userId}`).emit(event, data);
    } else {
      this.io.emit(event, data);
    }
  }

  /**
   * @description 发送 PWA 推送通知
   * @param {string} userId - 用户ID
   * @param {Object} payload - 推送内容
   * @returns {Promise<void>}
   */
  async _sendPushNotification(userId, payload) {
    try {
      const { sendPushNotification } = require('../routes/push_routes');
      await sendPushNotification(userId === 'legacy' ? null : userId, payload);
    } catch (e) {
      console.error('[WS] 推送通知失败:', e.message);
    }
  }

  /**
   * @description 向指定 Socket 连接发送事件
   * @param {string} socketId - Socket ID
   * @param {string} event - 事件名称
   * @param {Object} data - 事件数据
   * @returns {void}
   */
  emitToClient(socketId, event, data) {
    if (!this.io) return;
    this.io.to(socketId).emit(event, data);
  }

  /**
   * @description 向指定用户的所有连接发送事件
   * @param {string} userId - 用户ID
   * @param {string} event - 事件名称
   * @param {Object} data - 事件数据
   * @returns {void}
   */
  emitToUser(userId, event, data) {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * @description 获取当前连接的客户端数量
   * @returns {number} 连接数
   */
  getConnectedCount() {
    return this.io ? this.io.engine.clientsCount : 0;
  }

  /**
   * @description 获取在线设备列表，支持按用户过滤
   * @param {string} [userId] - 用户ID，为空则返回所有用户的在线设备
   * @returns {Object|Array} 在线设备列表
   */
  getOnlineDevices(userId) {
    if (!userId) {
      const result = {};
      for (const [uid, devices] of this.connectedDevices) {
        result[uid] = Object.keys(devices);
      }
      return result;
    }
    const devices = this.connectedDevices.get(userId);
    return devices ? Object.keys(devices) : [];
  }

  /**
   * @description 关闭 WebSocket 服务，取消事件订阅并释放资源
   * @returns {void}
   */
  shutdown() {
    const serviceBus = require('../core/service-bus');

    for (const { event, handler } of this._taskListeners) {
      serviceBus.unsubscribe(event, handler);
    }
    this._taskListeners = [];

    this.connectedDevices.clear();

    if (this.io) {
      this.io.close();
      this.io = null;
      console.log('[WS] WebSocket 服务已关闭');
    }
  }
}

const wsService = new WebSocketService();

module.exports = wsService;
module.exports.WebSocketService = WebSocketService;
module.exports.connectedDevices = wsService.connectedDevices;
