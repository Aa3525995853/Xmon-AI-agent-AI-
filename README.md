# 小梦 (xmon) - 语音交互 AI 助手

华人牌 2060 款手机小梦 - 一个来自未来的语音助手，支持实时语音对话、情绪表达和系统控制。
目前还在MVP阶段

## 特性

- 🎙️ **实时语音识别** - 基于 Whisper 的本地离线语音识别
- 🤖 **智能对话** - 集成 Mimo 和 Kimi LLM，支持复杂任务
- 🎵 **情绪化 TTS** - 支持多种情绪表达的语音合成
- 🔄 **流式输出** - 逐句 TTS 生成，降低首字延迟
- 🎭 **多种人格** - 温柔可爱 / 毒舌傲娇模式
- 🛠️ **系统控制** - 打开应用、播放音乐、搜索等
- 📊 **健康监控** - 完整的健康检查和日志系统
- 🐳 **容器化部署** - 支持 Docker 和 Docker Compose
- 🔄 **进程管理** - 支持 PM2 进程守护和自动重启

## 快速开始

### 方式 1: Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone <repository-url>
cd xiaomeng-voice-assistant

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API 密钥

# 3. 启动服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f

# 5. 访问服务
curl http://localhost:3000/health
```

详细的 Docker 部署文档：[docs/docker-deployment.md](docs/docker-deployment.md)

### 方式 2: PM2 进程管理（生产环境推荐）

```bash
# 1. 安装依赖
npm install

# 2. 安装 PM2（全局）
npm install -g pm2

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API 密钥

# 4. 启动服务
npm run pm2:start:prod

# 5. 查看状态
npm run pm2:status

# 6. 查看日志
npm run pm2:logs

# 7. 设置开机自启
npm run pm2:startup
npm run pm2:save
```

详细的 PM2 使用文档：[docs/pm2-guide.md](docs/pm2-guide.md)

### 方式 3: 本地开发

#### 前置要求

- Node.js 20+
- Python 3.10+
- npm 或 yarn

#### 安装步骤

```bash
# 1. 安装 Node.js 依赖
npm install

# 2. 安装 Python 依赖（用于 ASR）
pip install -r requirements.txt

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API 密钥

# 4. 启动服务
npm start
```

## 架构

### 服务端口

- **3000** - HTTP API 服务
- **8080** - WebSocket 服务（流式模式）

### 核心模块

```
├── controllers/          # 业务逻辑控制器
│   ├── chatController.js
│   ├── streamChatController.js
│   └── ttsController.js
├── services/            # 服务层
│   ├── llm_service.js
│   ├── mimo_tts.js
│   ├── system_control.js
│   └── memory_service.js
├── config/              # 配置管理
│   ├── streamChatConfig.js
│   ├── chatConfig.js
│   ├── ttsConfig.js
│   └── configValidator.js
├── utils/          # 工具函数
│   ├── textProcessor.js
│   ├── backpressure.js
│   └── logger.js
└── docs/                # 文档
```

产品定位：陪伴为主，工具为辅

小梦不仅仅是一个效率工具，更是一个懂你的情感伙伴。在用户不主动发起复杂任务时，她是一个能理解情绪、记住生活点滴的陪伴者；只有当明确需要时，她才会化身为强大的生产力工具。 目前还在MVP阶段，欢迎大佬帮忙优化，让小梦体验更加完善

🧠 核心架构设计理念
小梦的交互逻辑基于动态意图路由策略，确保在任何场景下都能提供最合适的响应模式。

1. 默认闲聊区 (Companion Mode)
系统默认处于“陪伴模式”，旨在提供无压力的交流体验。

路由策略：在 intentRouter.js 中，若未检测到明确的任务指令，系统默认将请求路由至 chat 区域（置信度 0.60）。
覆盖场景：包括快速问答（天气/时间）、翻译、头脑风暴、简单计算及知识问答等轻量级交互。
情感优先：在 intentClassifier 中，情感支持检测拥有最高优先级（Priority 0）。无论何时，只要检测到用户的情绪波动，小梦都会优先给予情感反馈，而非机械地执行任务。
2. 工作区 (Productivity Mode)
只有当用户明确表达需求时，系统才会切换到“工作模式”。

触发机制：基于关键词匹配（如代码生成、文档处理）或复杂推理需求。
执行逻辑：在 chatController.js 中，只有被标记为 work 区域且非简单任务（如数据分析、代码审查）的请求，才会调用 taskOrchestrator 进行深度处理。
3. 意图优先级金字塔
优先级	检测类型	路由目标	说明
0	情感支持	闲聊区 (陪伴)	最高优先级，确保情感共鸣
1	闲聊/招呼	闲聊区 (陪伴)	维持日常互动氛围
...	...	...	...
6	中文任务关键词	工作区 (工具)	明确的功能性需求
7	复杂推理	工作区 (工具)	需要深度思考的任务
Default	-	闲聊区 (陪伴)	兜底策略，保持陪伴属性
📱 多端适配策略
桌面端：完整支持“陪伴”与“工具”双模式切换。
移动端：考虑到移动场景的碎片化与伴随性，目前强制主要使用闲聊区逻辑，强化随身助手的感觉。
🛠️ 技术栈与关键文件
intentRouter.js: 核心路由分发逻辑，定义了 Zone 划分与置信度阈值。
intentClassifier/index.js: 意图识别引擎，负责情感分析与任务分类。
chatController.js: 业务控制器，根据路由结果决定调用普通对话流还是任务编排器 (taskOrchestrator)。
🚀 快速开始
(在此处补充如何安装依赖和启动项目的命令，例如：)

npm install
npm start

## 开发

### 项目结构

```
xiaomeng-voice-assistant/
├── config/              # 配置文件
├── controllers/       # 控制器
├── services/        # 服务层
├── utils/         # 工具函数
├── docs/               # 文档
├── logs/               # 日志文件
├── nginx/              # Nginx 配置
├── Dockerfile          # Docker 镜像
├── docker-compose.yml  # Docker Compose 配置
├── ecosystem.config.js # PM2 配置文件
├── .env.example        # 环境变量模板
└── test-config.js      # 配置测试
```

### 代码规范

- 使用 ESLint 进行代码检查
- 配置集中管理，避免硬编码
- 完善的错误处理和日志记录
- 详细的代码注释

## 文档

- [Docker 部署指南](docs/docker-deployment.md)
- [PM2 进程管理指南](docs/pm2-guide.md)
- [环境变量配置](docs/environment-variables.md)
- [健康检查 API](docs/health-check-api.md)
- [日志系统](docs/logging.md)
- [配置重构总结](docs/config-refactoring-summary.md)
- [逻辑错误修复报告](docs/logic-errors-fix-report.md)

## 故障排查

### 常见问题

1. **端口被占用**
   ```bash
   # 修改 .env 或 docker-compose.yml 中的端口
   ```

2. **API 密钥错误**
   ```bash
   # 检查 .env 文件中的 API 密钥是否正确
   ```

3. **内存不足**
   ```bash
   # 增加 Docker 内存限制或减少并发请求
   ```

4. **配置验证失败**
   ```bash
   # 运行配置测试查看详细错误
   node test-config.js
   ```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT

## 更新日志

### v1.0.0 (2026-05-13)

- ✅ 配置系统重构，支持环境变量
- ✅ 添加配置验证和测试
- ✅ Docker 容器化支持
- ✅ 完善的健康检查和日志系统
- ✅ 详细的部署和配置文档
