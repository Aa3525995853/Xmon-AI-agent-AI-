/**
 * @file server.js
 * @description 小梦后端服务入口 - Express 主应用
 * @module backend
 * @version 2.0.0
 * @date 2024-01-01
 * 
 * 架构说明：
 * - 采用模块化架构，通过 dependencies.js 统一管理依赖注入
 * - 路由与业务逻辑分离，便于测试和维护
 * - 支持开发/生产环境切换，安全策略严格区分
 */

// 设置 UTF-8 编码（Windows 控制台中文显示）
if (process.platform === 'win32') {
    require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
}

// 强制 Node.js 进程使用 UTF-8
process.env.LANG = 'en_US.UTF-8';
process.env.LC_ALL = 'en_US.UTF-8';

// 加载环境变量 - 根据当前文件位置确定 .env 路径
const path = require('path');
const envPath = path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });

process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

// ==================== 统一依赖管理 ====================
const {
    // 外部依赖
    express, cors, multer, helmet,
    // 工具模块
    logger, fileCleaner,
    // 服务模块
    getMemoryService, clearMemoryCache, legacyMemoryService, asrService,
    // 路由模块
    chatRoutes, ttsRoutes,
    // 错误处理
    globalErrorHandler,
    // 限流中间件
    generalLimiter, chatLimiter, ttsLimiter,
    // 缓存中间件
    requestCache, getCacheStats, clearCache
} = require('./dependencies');

// 记忆服务：legacy 模式下使用全局单例
const memoryService = legacyMemoryService;

// ==================== 初始化服务 ====================
// 初始化日志系统
logger.initLogger();

// 初始化文件清理
fileCleaner.startCleanupTask();

// 启动 ASR 服务（自动启动）
require('./services/asr_service');

// ==================== 创建 Express 应用 ====================
const app = express();

// 安全中间件 - Helmet（应在其他中间件之前）
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.googleapis.cnpmjs.org", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https:", "ws:", "wss:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "blob:"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false,  // 允许加载音频资源
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS is intentionally allowlisted. A bare `cors()` would accept every origin,
// which is too broad once auth cookies/tokens or local automation APIs exist.
// Configure CORS_ORIGIN as a comma-separated list, or set it to "*" only when a
// deployment explicitly needs public cross-origin access.
const defaultCorsOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];
const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const corsAllowlist = configuredCorsOrigins.length > 0
    ? configuredCorsOrigins
    : defaultCorsOrigins;

app.use(cors({
    origin(origin, callback) {
        if (!origin || corsAllowlist.includes('*') || corsAllowlist.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true
}));
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));

// ==================== 运行时路径配置 ====================
const { UPLOADS_DIR, ensureDir } = require('./config/runtimePaths');

// ==================== 静态文件服务（仅 uploads） ====================
// 安全说明：仅托管 uploads 目录（生成的表格、图表等），禁止托管其他目录
ensureDir(UPLOADS_DIR);
app.use('/uploads', express.static(UPLOADS_DIR, {
    maxAge: '1h',
    etag: true,
    lastModified: true,
    setHeaders: (res, filepath) => {
        // 根据文件类型设置 Content-Type
        if (filepath.endsWith('.xlsx') || filepath.endsWith('.xls')) {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        } else if (filepath.endsWith('.csv')) {
            res.setHeader('Content-Type', 'text/csv;charset=utf-8');
        } else if (filepath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json;charset=utf-8');
        } else if (filepath.endsWith('.md')) {
            res.setHeader('Content-Type', 'text/markdown;charset=utf-8');
        } else if (filepath.endsWith('.png') || filepath.endsWith('.jpg') || filepath.endsWith('.jpeg')) {
            res.setHeader('Content-Type', 'image/' + filepath.slice(-3));
        }
        // 允许跨域访问生成的资源
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
}));

// ==================== 限流中间件 ====================
// 通用限流 - 应用于所有请求
app.use(generalLimiter);

// ============== 路由注册 ===============
app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 健康检查路由（不应用限流，用于监控）
const healthRoutes = require('./routes/healthRoutes');
app.use('/health', healthRoutes);

// 认证路由（公开）
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// 聊天路由 - 应用聊天专用限流（缓存已在路由内部应用）
app.use('/api/chat', chatLimiter, chatRoutes);

// TTS 路由 - 应用TTS专用限流（缓存已在路由内部应用）
app.use('/api/tts', ttsLimiter, ttsRoutes);

// 缓存管理接口
app.get('/api/cache/stats', (req, res) => {
    res.json({ success: true, stats: getCacheStats() });
});

app.post('/api/cache/clear', (req, res) => {
    const { pattern } = req.body || {};
    const count = clearCache(pattern);
    res.json({ success: true, cleared: count });
});

// 记忆系统路由
const createMemoryRouter = require('./routes/memory_routes');
app.use(createMemoryRouter(memoryService));

// 成长系统路由
const growthRoutes = require('./routes/growth_routes');
app.use('/api/growth', growthRoutes);

// 会话管理路由（会话隔离、历史记录、上下文压缩与摘要）
const sessionRoutes = require('./routes/session_routes');
app.use('/api/session', sessionRoutes);

// 关系状态路由（前端 /api/relationship 兼容）
app.get('/api/relationship', (req, res) => {
    try {
        const { legacyRelationshipGrowth: relationshipGrowth } = require('./services/relationship_growth');
        const status = relationshipGrowth.getGrowthStatus();
        res.json(status);
    } catch (e) {
        res.json({ level: 1, stage: '陌生人', score: 0, totalInteractions: 0 });
    }
});

// 主动服务路由
const proactiveRoutes = require('./routes/proactive_routes');
app.use('/api/proactive', proactiveRoutes);

// Onboarding 路由
const onboardingRoutes = require('./routes/onboarding_routes');
app.use('/api/onboarding', onboardingRoutes);

// 性格演化路由
const evolutionRoutes = require('./routes/evolution_routes');
app.use('/api/evolution', evolutionRoutes);

// 自主学习路由
const learningRoutes = require('./routes/learning_routes');
app.use('/api/learning', learningRoutes);

// 天气搜索路由
const weatherRoutes = require('./routes/weather_routes');
app.use('/api', weatherRoutes);

// 增强搜索路由 (Phase 1 优化)
const enhancedSearchRoutes = require('./routes/enhancedSearch_routes');
app.use('/api/search', enhancedSearchRoutes);

// 订票服务路由 (v2.0 - 最后一公里)
const ticketRoutes = require('./routes/ticket_routes');
app.use('/api/ticket', ticketRoutes);

// 价格提醒路由
const priceAlertRoutes = require('./routes/price_alert_routes');
app.use('/api/price-alert', priceAlertRoutes);

// 订单追踪路由
const orderRoutes = require('./routes/order_routes');
app.use('/api/order', orderRoutes);

// 价格同步路由 (定时同步价格 + 价格变化推送)
const priceSyncRoutes = require('./routes/price_sync_routes');
app.use('/api/price-sync', priceSyncRoutes);

// 启动价格同步服务
const priceSyncService = require('./services/price_sync_service');
priceSyncService.start();

// 信息消化路由 (Tool 2)
const digestRoutes = require('./routes/digest_routes');
app.use('/api/digest', digestRoutes);

// 新闻搜索路由 (联网搜索AI新闻资讯)
const newsRoutes = require('./routes/news_routes');
app.use('/api/news', newsRoutes);

// 一键直达路由 (Tool 3)
const { router: directRoutes, initDirectService } = require('./routes/direct_routes');
const DirectActionService = require('./services/direct_action_service');
const llmService = require('./services/llm_service');
const directActionService = new DirectActionService(llmService);
initDirectService(directActionService);
app.use('/api/direct', directRoutes);

// 电脑操作路由 (Tool 1)
const { router: systemRoutes, initSystemControl } = require('./routes/system_routes');
const systemControl = require('./services/system_control');
initSystemControl(systemControl);
app.use('/api/system', systemRoutes);

// 任务管理路由
const taskRoutes = require('./routes/taskRoutes');
console.log('[DEBUG] taskRoutes 加载完成，路由数量:', taskRoutes.stack ? taskRoutes.stack.length : '未知');
app.use('/api/task', taskRoutes);

// 任务历史路由（持久化存储）
const taskHistoryRoutes = require('./routes/taskHistory_routes');
app.use('/api/tasks', taskHistoryRoutes);

// 审核路由 (工作大脑 2.0)
const reviewRoutes = require('./routes/review_routes');
app.use('/api/review', reviewRoutes);

// 工作区 API（独立于聊天，不阻塞闲聊）
const workRoutes = require('./routes/work_routes');
app.use('/api/work', workRoutes);

// 执行引擎路由 (工作大脑 2.0)
const executorRoutes = require('./routes/executor_routes');
app.use('/api/executor', executorRoutes);

// Workflow Dashboard routes
const workflowRoutes = require('./routes/workflow_routes');
app.use('/api/workflow', workflowRoutes);

// Interop routes (PC-Mobile communication)
const interopRoutes = require('./routes/interop_routes');
app.use('/api/interop', interopRoutes);

// Plugin market routes
const marketRoutes = require('./routes/marketRoutes');
app.use('/api', marketRoutes);

// Push notification routes (PWA)
const { router: pushRoutes, sendPushNotification } = require('./routes/push_routes');
app.use('/api/push', pushRoutes);

// 计划路由（旅行规划、待办事项等）
const planRoutes = require('./routes/plan_routes');
app.use('/api/plan', planRoutes);

const workBrainClient = require('./services/workBrainClient');
workBrainClient.startHealthMonitor(15000);

const taskScheduler = require('./core/task-scheduler');
taskScheduler.init().then(() => {
    console.log('[START] TaskScheduler (Phase 3) 初始化完成');
}).catch(err => {
    console.error('[START] TaskScheduler 初始化失败:', err.message);
});

// 初始化统一任务编排器
const taskOrchestrator = require('./services/task_orchestrator');
taskOrchestrator.init().then(() => {
    console.log('[START] TaskOrchestrator 初始化完成');
}).catch(err => {
    console.error('[START] TaskOrchestrator 初始化失败:', err.message);
});

// 初始化任务持久化
const taskPersistence = require('./services/task_persistence');
taskPersistence.init().then(() => {
    console.log('[START] TaskPersistence 初始化完成');
}).catch(err => {
    console.error('[START] TaskPersistence 初始化失败:', err.message);
});

// ==================== 工作大脑 2.0 初始化 ====================
const executor = require('./services/executor');
const reviewHub = require('./services/review_hub');
const Planner = require('./services/planner');
const healer = require('./services/healer');

// 创建实例
const planner = new Planner();

// 设置 Planner 的执行器和意图核心
planner.setExecutor(executor);

// 设置 WebSocket 广播器
function wsBroadcaster(event, data) {
    if (wsService.io) {
        wsService.io.emit(event, {
            ...data,
            timestamp: Date.now()
        });
    }
}
reviewHub.setWsBroadcaster(wsBroadcaster);
executor.setWsBroadcaster(wsBroadcaster);

console.log('[START] 工作大脑 2.0 模块初始化完成');

const pluginMarket = require('./core/plugin-market');
pluginMarket.init();

const capabilityDetector = require('./core/capability-detector');
capabilityDetector.init();

const mcpClientManager = require('./services/mcpClientManager');

// 初始化 MCP 客户端管理器
const mcpInstance = new mcpClientManager();
mcpInstance.initialize().then(() => {
    const stats = mcpInstance.getStats();
    console.log(`[START] MCP ClientManager 初始化完成: ${stats.serversConnected}/${stats.serversFailed + stats.serversConnected} 服务器已连接, ${stats.toolsDiscovered} 个工具`);
}).catch(err => {
    console.error('[START] MCP ClientManager 初始化失败:', err.message);
});

const wsService = require('./services/websocketService');

// 初始化会话存储（会话隔离、历史记录持久化、上下文压缩）
const sessionStore = require('./core/session-store');
sessionStore.init().catch(err => {
    console.error('[START] SessionStore 初始化失败:', err.message);
});

// ==================== 测试端点 ====================
const upload = multer();

app.post('/api/test', upload.none(), async (req, res) => {
    logger.info('[测试] 收到请求', { body: req.body });
    res.json({ success: true, message: '测试成功', body: req.body });
});

// ============================================================
// 模块名称：错误处理与启动入口
// 功能说明：前后端完全分离架构下的错误处理和服务启动
// 架构说明：
//   - 后端仅提供 API 服务（/api/*, /health, /ws），不托管任何前端静态资源
//   - 开发环境：前端由 Vite dev server 独立提供（端口 5173），通过 proxy 转发 /api 请求到后端
//   - 生产环境：前端由 Nginx 等独立 Web 服务器托管，反向代理 /api 到后端
// 安全说明：
//   - 禁止使用 express.static 托管前端目录，避免源码泄露和路径遍历攻击
//   - 前端 Live2D 资源已迁移至前端 public/live2d/，后端不再负责提供
// ============================================================

// ==================== 启动服务 ====================
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    server.timeout = 300000;
    server.keepAliveTimeout = 300000;
    server.headersTimeout = 310000;
    logger.info(`[START] 小梦后端服务（重构版）已启动: http://localhost:${PORT}`);
    logger.info(`[INFO] ASR 服务: Whisper (faster-whisper 本地离线)`);
    logger.info(`[INFO] 双脑架构: 闲聊→Mimo, 工作→火山引擎 Coding Agent`);
    logger.info(`[INFO] 工作大脑监控: 每15s健康检查 + 断路器保护`);
    logger.info(`[INFO] 任务管理: /api/task (执行/状态/插队/取消/意图识别/工作大脑状态)`);
    logger.info(`[INFO] 订票服务: /api/ticket (火车票/高铁/机票比价+跳转下单)`);
    logger.info(`[INFO] 价格提醒: /api/price-alert (价格下降到心理价位时主动提醒)`);
    logger.info(`[INFO] 订单追踪: /api/order (记录订单+行程前主动提醒)`);
    logger.info(`[INFO] 价格同步: /api/price-sync (每小时自动同步+价格变化推送)`);
    logger.info(`[INFO] Redis缓存: 价格数据缓存+内存降级`);
    logger.info(`[INFO] WebSocket: /ws (任务事件/工作大脑状态/大脑状态机)`);
    logger.info(`[INFO] 限流保护: 已启用 (通用300req/min, 聊天60req/min, TTS 60req/min)`);
    logger.info(`[INFO] 请求缓存: 已启用 (TTS 5分钟, 聊天30秒)`);
    logger.info(`[INFO] 安全头: 已启用 (helmet)`);
    logger.info(`[INFO] 前端页面: http://localhost:${PORT}/index.html`);
    logger.info(`[INFO] 移动端页面: http://localhost:${PORT}/mobile.html`);
    logger.info(`[INFO] 认证系统: /api/auth (注册/登录) - ENABLE_AUTH=${process.env.ENABLE_AUTH || 'false'}`);
    logger.info(`[INFO] 工作大脑 2.0: /api/executor (意图理解/规划执行/异常自愈)`);
    logger.info(`[INFO] 审核中枢: /api/review (计划审核/结果审核/恢复审核)`);
    logger.info(`[INFO] 个人知识: /api/executor/knowledge (习惯学习/遗忘机制)`);
});

wsService.init(server, { path: '/ws' });

// ==================== 优雅关闭 ====================
let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`[SHUTDOWN] 收到 ${signal}，正在关闭服务...`);

    const { stopASRDaemon } = require('./services/asr_service');
    stopASRDaemon();

    workBrainClient.stopHealthMonitor();

    const sessionStore = require('./core/session-store');
    sessionStore.destroy();

    const modelDegradation = require('./core/model-degradation');
    modelDegradation.destroy();

    try {
        await mcpClientManager.shutdown();
    } catch (err) {
        logger.error('[SHUTDOWN] MCP 关闭失败:', err.message);
    }

    if (typeof taskScheduler.destroy === 'function') {
        try { taskScheduler.destroy(); } catch (e) { logger.error('[SHUTDOWN] TaskScheduler 关闭失败:', e.message); }
    }
    if (typeof taskScheduler.stop === 'function') {
        try { taskScheduler.stop(); } catch (e) { logger.error('[SHUTDOWN] TaskScheduler 停止失败:', e.message); }
    }

    const { legacyProactiveService } = require('./services/proactive_service');
    if (typeof legacyProactiveService.destroy === 'function') {
        try { legacyProactiveService.destroy(); } catch (e) { logger.error('[SHUTDOWN] ProactiveService 关闭失败:', e.message); }
    }
    if (typeof legacyProactiveService.stop === 'function') {
        try { legacyProactiveService.stop(); } catch (e) { logger.error('[SHUTDOWN] ProactiveService 停止失败:', e.message); }
    }

    try { clearMemoryCache(); } catch (e) { logger.error('[SHUTDOWN] 清理记忆缓存失败:', e.message); }

    wsService.shutdown();

    const forceExitTimer = setTimeout(() => {
        logger.warn('[SHUTDOWN] 关闭超时，强制退出');
        process.exit(0);
    }, 5000);

    server.close(() => {
        clearTimeout(forceExitTimer);
        logger.info('[SHUTDOWN] 服务已关闭');
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION]', error);
    gracefulShutdown('uncaughtException');
});
