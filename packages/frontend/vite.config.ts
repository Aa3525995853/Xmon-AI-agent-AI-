/**
 * @file vite.config.ts
 * @description Vite 构建配置 - 前后端分离架构
 * @module frontend
 * @version 2.0.0
 * @date 2026-06-06
 *
 * 架构说明：
 *   - 前端由 Vite dev server 独立运行（端口 5173）
 *   - 仅通过 proxy 转发 API/WebSocket/健康检查请求到后端（端口 3000）
 *   - 前端静态资源（包括 Live2D 模型）由 Vite 直接从 public/ 目录服务
 *   - 不再代理 /Neuro_Live2D_Module 到后端，避免后端暴露不必要的文件
 */

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],

  server: {
    port: 5173,

    // ============================================================
    // 代理配置：仅转发 API/WebSocket 请求到后端
    // 前端静态资源（包括 Live2D 模型 public/live2d/）由 Vite 直接服务
    // 安全说明：不再代理前端资源请求到后端，实现前后端完全分离
    // ============================================================
    proxy: {
      /** REST API 请求代理到后端 Express 服务 */
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      /** WebSocket 连接代理到后端（用于流式任务事件推送） */
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true
      },
      /** 健康检查端点代理到后端（用于监控探针） */
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
