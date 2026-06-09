# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Vision

**小梦 = 陪伴 + 工具，释放双手，说完就做完**

让用户通过自然语言完成现实世界的任务，而不只是聊天。

```
┌────────────────────────────────────────────────┐
│  陪伴层：情感支持、记忆连续、主动存在感          │
│  工具层：自然语言 → 完成任务                    │
│  交互层：语音优先，释放双手                     │
└────────────────────────────────────────────────┘
```

### 核心痛点
1. **电脑操作** - "帮我打开Excel整理这个数据"
2. **信息消化** - "帮我看看这个报告说了什么"
3. **内容直达** - "帮我生成可直接使用的表格/邮件"

### 里程碑
- v1.0 情感陪伴（已完成）
- v2.0 工具能力（已完成）← 1、电脑操作 2、信息消化 3、内容直达
- v3.0 主动执行（已完成）← 智能定时任务、条件触发器、上下文预判、自动执行
- v4.0 跨应用协同（待开发）
- v5.0 多模态理解（待开发）

---

## Commands

```bash
# 开发模式（前后端并发启动）
pnpm dev

# 仅启动后端开发服务器
pnpm dev:backend

# 仅启动前端开发服务器
pnpm dev:frontend

# 全工作区构建（shared → backend → frontend）
pnpm build

# 生产模式启动（仅后端）
pnpm start

# 运行测试
pnpm test

# 代码检查
pnpm lint

# 清理所有 node_modules
pnpm clean
```

### 服务端口
| 服务 | 端口 | 说明 |
|------|------|------|
| 后端 API | http://localhost:3000 | Express HTTP 服务 |
| WebSocket | ws://localhost:8080 | 流式任务事件推送 |
| 前端开发 | http://localhost:5173 | Vite dev server（开发模式） |

---

## Architecture

### Monorepo 结构（pnpm workspace）

```
xiaomeng/
├── packages/
│   ├── backend/          ← @xiaomeng/backend - Express API 服务
│   ├── frontend/         ← @xiaomeng/frontend - Vue 3 SPA
│   └── shared/           ← @xiaomeng/shared - 共享类型定义
├── pnpm-workspace.yaml
├── package.json          ← workspace 根配置
└── docker-compose.yml
```

### 前后端完全分离架构

```
开发模式：
  浏览器 → Vite (5173) ──proxy /api──→ Express (3000)
          └── 直接服务 public/ 下的静态资源（含 Live2D）

生产模式：
  浏览器 → Nginx (80) ──proxy /api──→ Express (3000)
          └── 直接服务 frontend/dist/ 静态文件
```

**安全原则**：后端仅提供 API，不托管任何前端静态资源。前端资源由 Vite（开发）或 Nginx（生产）独立服务。

### Backend (`packages/backend/`)

**入口**：`src/server.js`

**目录结构**：
```
src/
├── server.js              ← 主服务入口
├── start-all.js           ← 开发模式启动（含 FunASR）
├── config/                ← 配置（chat、stream、tts、voice、人格）
│   └── personalities/     ← 人格配置（bad/cute/gentle/normal/obedient）
├── controllers/           ← 控制器（chat、streamChat、tts）
├── core/                  ← 核心基础设施
│   ├── capability-detector.js   ← 能力检测
│   ├── context-compressor.js    ← 上下文压缩
│   ├── intent-clarifier.js      ← 意图澄清
│   ├── loop-guard.js            ← 循环防护
│   ├── model-degradation.js     ← 模型降级
│   ├── plugin-loader.js         ← 插件加载器
│   ├── sandbox.js               ← 沙箱执行
│   ├── service-bus.js           ← 服务总线
│   ├── session-store.js         ← 会话存储
│   ├── task-queue.js            ← 任务队列
│   └── task-scheduler.js        ← 任务调度器
├── middleware/             ← 中间件（auth、cache、errorHandler、rateLimiter、validator）
├── routes/                ← API 路由（30+ 路由文件）
├── services/              ← 服务层（50+ 服务模块）
│   ├── llm_service/       ← LLM 服务（智能路由：Mimo 对话 / 火山引擎 Coding Agent 任务）
│   ├── mimo_tts/          ← MiMo TTS（含情感标签）
│   ├── smart_memory/      ← 智能记忆
│   ├── proactive_service/ ← 主动服务
│   ├── relationship_growth/ ← 关系成长
│   ├── task_orchestrator/ ← 任务编排
│   ├── document_pipeline/ ← 文档处理管线
│   ├── info_digest/       ← 信息消化
│   ├── direct_action/     ← 内容直达
│   ├── system_control/    ← 系统控制
│   ├── emotion_classifier/ ← 情感分类
│   ├── context_engine/    ← 上下文引擎
│   ├── intentClassifier/  ← 意图分类
│   ├── planner/           ← 任务规划
│   ├── executor/          ← 任务执行
│   ├── knowledge/         ← 知识库
│   └── ...                ← 更多服务
├── plugins/               ← 插件（browser、llm、news、system、weather）
├── utils/                 ← 工具（logger、textProcessor、backpressure、fileCleaner）
├── tests/                 ← 测试（unit/、integration/、e2e/）
└── data/                  ← 运行时数据存储
```

**API 端点**：
- `POST /api/chat` - 语音输入 → ASR → LLM → TTS → 语音输出
- `POST /api/chat/text` - 文本输入 → LLM → 文本输出
- `POST /api/chat/text-stream` - 文本流式输出
- `GET /health` - 健康检查
- `GET /health/liveness` - 存活探针
- `GET /health/readiness` - 就绪探针
- 30+ 路由模块覆盖：对话、任务、记忆、成长、系统控制、信息消化、内容直达等

### Frontend (`packages/frontend/`)

**技术栈**：Vue 3 + Vite + Pinia + TypeScript

**目录结构**：
```
src/
├── components/
│   ├── chat/              ← 聊天组件（ChatHeader、ChatMessages、TextInput、FileUpload 等）
│   ├── common/            ← 通用组件（ConfirmDialog、ExecutionPanel、GrowthModal、TaskCenter 等）
│   └── sidebar/           ← 侧边栏（AppSidebar、Live2DAvatar、PersonalitySwitcher）
├── composables/           ← 组合式函数
│   ├── useLive2D.ts       ← Live2D 模型管理
│   ├── useVoiceInput.ts   ← 语音输入
│   ├── useAudioPlayer.ts  ← 音频播放
│   ├── useWebSocket.ts    ← WebSocket 连接
│   ├── useTaskStream.ts   ← 任务流式事件
│   ├── useEmotion.ts      ← 情感状态
│   └── useProactive.ts    ← 主动服务
├── stores/                ← Pinia 状态管理
│   ├── app.ts             ← 应用全局状态
│   ├── auth.ts            ← 认证状态
│   ├── brainState.ts      ← 大脑状态
│   └── chat.ts            ← 聊天状态
├── types/                 ← 类型定义
├── styles/                ← 样式
├── utils/                 ← 工具函数
├── App.vue
└── main.ts
public/
├── live2d/                ← Live2D 模型资源（前后端分离后由前端直接服务）
│   ├── Character/         ← 角色模型文件
│   └── assets/            ← Live2D SDK + 音效
├── icons/                 ← PWA 图标
├── fonts/                 ← 字体文件
├── vendor/                ← 第三方库（luckysheet、xlsx）
└── sw.js                  ← Service Worker
```

### Shared (`packages/shared/`)

前后端共享的 TypeScript 类型定义：
- 配置类型：`BackpressureConfig`、`AudioConfig`、`LLMConfig`、`TTSOptions` 等
- 请求/响应类型：`ChatRequest`、`ChatResponse`、`VoiceChatRequest` 等
- LLM 类型：`LLMMessage`、`LLMResponse`、`ToolCall`
- 系统控制：`SystemIntent`、`SystemControlResult`
- 健康检查：`HealthStatus`、`DetailedHealthStatus`

---

## Service Layer

### TTS Providers（基于 `TTS_PROVIDER` 环境变量路由）
- `mimo_tts` - MiMo TTS（支持情感标签：`<style>开心</style>` 等）
- `volcano_tts` - 火山引擎 TTS
- `minimax_tts` - MiniMax TTS
- `edge_tts` - Microsoft Edge TTS
- `mock_tts` - 降级回退

### LLM Service（智能路由）
- **对话场景** → MiMo（情感陪伴优化）
- **任务场景** → 火山引擎 Coding Agent（工具调用优化）
- **降级策略** → Kimi（主服务不可用时自动切换）

### ASR Service
- 本地 Whisper（faster-whisper）
- 自动检测 GPU/CPU 模式
- 由 Node.js 子进程调用

---

## Environment Variables

### 必填（`.env`）

| 变量 | 说明 |
|------|------|
| `MIMO_API_KEY` / `MIMO_API_URL` / `MIMO_MODEL` | MiMo LLM API |
| `MIMO_TTS_API_KEY` / `MIMO_TTS_API_URL` | MiMo TTS API |
| `KIMI_API_KEY` / `KIMI_API_URL` / `KIMI_MODEL` | Kimi 降级 LLM |
| `WORKFLOW_API_KEY` / `WORKFLOW_API_URL` / `WORKFLOW_MODEL` | 火山引擎 Coding Agent |
| `TTS_PROVIDER` | TTS 提供商（mimo/volcano/minimax/edge/mock） |
| `NODE_ENV` | 运行环境（development/production） |
| `LOG_LEVEL` | 日志级别（error/warn/info/debug），默认 info |
| `PERSONA_MODE` | 人格模式（gentle/tsundere） |

### 可选（高级配置）

| 变量 | 说明 |
|------|------|
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis 缓存 |
| `LLM_TEMPERATURE` / `LLM_TOP_P` | LLM 生成参数 |
| `LLM_STREAM_TIMEOUT` / `LLM_TIMEOUT_*` | LLM 超时配置 |
| `SENTENCE_*` | 句子分割参数 |
| `STREAM_*` | 背压控制参数 |
| `CHAT_DEFAULT_*` | 聊天默认参数（emotion/speechRate/volume） |
| `TTS_SAMPLE_RATE` / `TTS_FORMAT` / `TTS_CHUNK_SIZE` | TTS 配置 |
| `CONVERSATION_MAX_HISTORY` | 对话历史长度 |
| `OPENCLAW_URL` / `OPENCLAW_AUTH_TOKEN` | OpenClaw Agent 配置 |

---

## Monitoring & Operations

### Health Check
- `GET /health` - 系统整体健康状态
- `GET /health/detailed` - 详细健康信息（含内存/CPU）
- `GET /health/liveness` - 存活探针（负载均衡器用）
- `GET /health/readiness` - 就绪探针（Kubernetes 用）

### Logging（Winston）
- 全量日志：`logs/app-YYYY-MM-DD.log`（14 天保留）
- 错误日志：`logs/error-YYYY-MM-DD.log`（30 天保留）
- 自动轮转：每日或文件达 20MB

---

## Deployment

### Docker Compose

```bash
# 仅后端服务
docker compose up

# 后端 + Nginx（前后端分离部署）
docker compose --profile with-nginx up
```

| 服务 | 端口 | Profile |
|------|------|---------|
| `xiaomeng` | 3000 (HTTP), 8080 (WS) | 默认 |
| `nginx` | 80 (HTTP), 443 (HTTPS) | `with-nginx` |

Nginx 配置：`packages/backend/nginx/nginx.conf`
- 前端静态文件：直接服务 `/usr/share/nginx/html`（挂载 `packages/frontend/dist`）
- API 请求：反向代理到后端 `xiaomeng:3000`
- WebSocket：代理到 `xiaomeng:8080`

---

## Features

### XMON 情感陪伴系统

1. **智能记忆** (`services/smart_memory/`) - 自动提取用户信息，Wiki 格式存储，主动召回
2. **主动服务** (`services/proactive_service/`) - 定时问候、里程碑庆祝、情绪关心、互动激励
3. **Onboarding 引导** (`services/onboarding_service/`) - 首次对话引导，自然收集用户画像

### 情感成长系统

- 关系阶段：陌生人 → 认识的人 → 朋友 → 好朋友 → 亲密伙伴
- 里程碑：相遇、声音相遇、聊天次数、深度交流、连续陪伴等
- 称呼变化：随关系阶段自动调整

### 工具能力（v2.0）

1. **电脑操作** - 云音乐播放控制、系统控制
2. **信息消化** - 图片/PDF/Excel/CSV/Word/音频/视频/网页/文本分析
3. **内容直达** - 表格生成、邮件撰写、报告生成

### 主动执行（v3.0）

- 智能定时任务（自然语言创建）
- 条件触发器（时间/关键词/情绪/里程碑）
- 上下文预判（基于时间和行为预测需求）
- 自动执行（简单任务无需确认）

---

## Development Guidelines

### 代码规范
- 文件头部注释（@file, @description, @module, @version, @date）
- 函数注释（@description, @param, @returns, @throws）
- 单个函数不超过 50 行，参数不超过 5 个
- 关键操作必须有 try-catch，禁止空 catch

### 前后端分离原则
- 后端仅提供 API，禁止 `express.static` 托管前端资源
- 前端静态资源（含 Live2D）由 Vite/Nginx 独立服务
- 修改路由前先验证目标处理器存在
- 添加 API 路由时必须同时实现底层服务方法
- 禁止"待实现"占位符

### 验证流程
- 每次修改后运行 `node packages/backend/src/verify-backend.js` 验证
- 先验证后端 API，再写前端代码
- 一次只改一个完整链路
