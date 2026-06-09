/**
 * 聊天路由模块
 * 处理聊天相关的 HTTP 请求
 */

import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { chatRoute, voiceChatRoute } from '../controllers/chatController';

// 运行时路径配置（统一管理 data/logs/uploads）
import { UPLOADS_DIR, ensureDir } from '../config/runtimePaths';

const router: Router = express.Router();

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 确保上传目录存在
        ensureDir(UPLOADS_DIR);
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname) || '.wav';
        cb(null, uniqueName + ext);
    }
});

const upload = multer({ storage: storage });

/**
 * POST /api/chat/text
 * 文本聊天接口（返回 JSON）
 */
router.post('/text', async (req: Request, res: Response) => {
    await chatRoute(req, res);
});

/**
 * POST /api/chat
 * 语音聊天接口（上传音频文件，返回音频）
 */
router.post('/', upload.single('audio'), async (req: Request, res: Response) => {
    await voiceChatRoute(req, res);
});

/**
 * POST /api/chat/clear
 * 清空对话历史
 */
router.post('/clear', (req: Request, res: Response) => {
    try {
        // 这里应该调用 memoryService 清空历史
        res.json({ success: true, message: '对话历史已清空' });
    } catch (error) {
        const err = error as Error;
      console.error('[错误] 清空历史失败:', err);
      res.status(500).json({ error: '清空历史失败', message: err.message });
    }
});

/**
 * GET /api/chat/history
 * 获取对话历史
 */
router.get('/history', (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 6;
      // 这里应该调用 memoryService 获取历史
        res.json({ success: true, history: [] });
    } catch (error) {
        const err = error as Error;
        console.error('[错误] 获取历史失败:', err);
        res.status(500).json({ error: '获取历史失败', message: err.message });
    }
});

export default router;
