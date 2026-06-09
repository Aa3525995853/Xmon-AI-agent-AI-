/**
 * @file healthRoutes.js
 * @description 健康检查路由模块，提供系统整体健康状态、详细健康信息、
 *              存活探针和就绪探针等接口，用于监控和负载均衡
 * @module routes
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-06
 */

const express = require('express');
const router = express.Router();
const llmService = require('../services/llm_service');
const { checkTTSHealth } = require('../services/tts_registry');
const { logger } = require('../utils/logger');

// ============================================================
// 模块名称：基础与详细健康检查
// 功能说明：系统整体健康状态、详细健康信息（含内存/CPU）
// ============================================================

/**
 * @description 基础健康检查，检测 LLM（Mimo/工作大脑/Kimi）和 TTS 服务的可用性，
 *              所有服务正常返回 200，否则返回 503
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 status、timestamp、uptime、services 信息
 */
router.get('/', async (req, res) => {
    try {
        const health = {
            status: 'ok',
            timestamp: Date.now(),
            uptime: process.uptime(),
            services: {}
        };

        // 检查 LLM 服务（三层路由：Mimo闲聊 + 工作大脑 + 火山引擎兜底）
        let llmOk = false;
        try {
            const llmHealth = await llmService.checkHealth();
            health.services.llm = {
                mimo: llmHealth.mimo.available ? 'ok' : 'unavailable',
                workbrain: llmHealth.workbrain.available ? 'ok' : 'unavailable',
                kimi: llmHealth.kimi.available ? 'ok' : 'unavailable',
                latency: {
                    mimo: llmHealth.mimo.latency,
                    workbrain: llmHealth.workbrain.latency,
                    kimi: llmHealth.kimi.latency
                },
                workbrainCircuitBreaker: llmHealth.workbrain.circuitBreaker || null
            };
            // 至少有一个 LLM 服务可用
            llmOk = llmHealth.mimo.available || llmHealth.workbrain.available || llmHealth.kimi.available;
        } catch (error) {
            logger.error('[健康检查] LLM 服务检查失败', { error: error.message });
            health.services.llm = { status: 'error', error: error.message };
            llmOk = false;
        }

        // 检查 TTS 服务
        let ttsOk = false;
        try {
        const ttsHealth = await checkTTSHealth();
            health.services.tts = {
           provider: ttsHealth.provider,
                status: ttsHealth.available ? 'ok' : 'unavailable',
                latency: ttsHealth.latency,
             error: ttsHealth.error
            };
         ttsOk = ttsHealth.available;
        } catch (error) {
            logger.error('[健康检查] TTS 服务检查失败', { error: error.message });
      health.services.tts = { status: 'error', error: error.message };
          ttsOk = false;
        }

        // 判断整体状态
        const allServicesOk = llmOk && ttsOk;
        health.status = allServicesOk ? 'ok' : 'degraded';

        // 根据状态返回不同的 HTTP 状态码
        const statusCode = health.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(health);

    } catch (error) {
        logger.error('[健康检查] 检查失败', { error: error.message, stack: error.stack });
        res.status(500).json({
        status: 'error',
            timestamp: Date.now(),
            error: error.message
        });
    }
});

/**
 * @description 详细健康检查，返回系统内存、CPU 使用情况及各服务的完整健康详情
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 status、timestamp、uptime、memory、cpu、services 详细信息
 */
router.get('/detailed', async (req, res) => {
    try {
        const health = {
            status: 'ok',
            timestamp: Date.now(),
          uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
          services: {}
        };

        // LLM 服务详细信息
        try {
            const llmHealth = await llmService.checkHealth();
            health.services.llm = llmHealth;
        } catch (error) {
            logger.error('[健康检查] LLM 详细检查失败', { error: error.message });
            health.services.llm = { error: error.message };
        }

        // TTS 服务详细信息
     try {
            const ttsHealth = await checkTTSHealth();
            health.services.tts = ttsHealth;
        } catch (error) {
          logger.error('[健康检查] TTS 详细检查失败', { error: error.message });
            health.services.tts = { error: error.message };
        }

        res.json(health);

    } catch (error) {
        logger.error('[健康检查] 详细检查失败', { error: error.message, stack: error.stack });
        res.status(500).json({
          status: 'error',
            timestamp: Date.now(),
            error: error.message
        });
    }
});

// ============================================================
// 模块名称：存活与就绪探针
// 功能说明：负载均衡器存活探针、Kubernetes 就绪探针
// ============================================================

/**
 * @description 存活探针，用于负载均衡器判断进程是否存活，始终返回 200
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，包含 status: 'alive' 和 timestamp
 */
router.get('/liveness', (req, res) => {
    res.status(200).json({ status: 'alive', timestamp: Date.now() });
});

/**
 * @description 就绪探针，用于 Kubernetes 判断服务是否就绪。
 *              检查必要的环境变量（MIMO_API_KEY、MIMO_API_URL）是否已配置
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @returns {Object} JSON 响应，就绪返回 200，未就绪返回 503
 */
router.get('/readiness', async (req, res) => {
    try {
        // 快速检查关键服务是否配置
        const ready =
          !!process.env.MIMO_API_KEY &&
            !!process.env.MIMO_API_URL;

        const workbrainReady = true;

        if (ready) {
            res.status(200).json({
                status: 'ready',
                timestamp: Date.now(),
                workbrain: workbrainReady ? 'ready' : 'not_ready'
            });
        } else {
            res.status(503).json({
                status: 'not_ready',
             timestamp: Date.now(),
             reason: '缺少必要的环境变量配置'
            });
        }
    } catch (error) {
        logger.error('[健康检查] 就绪检查失败', { error: error.message });
        res.status(503).json({
            status: 'not_ready',
            timestamp: Date.now(),
            error: error.message
        });
    }
});

module.exports = router;
