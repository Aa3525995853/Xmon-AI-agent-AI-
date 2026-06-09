# 小梦 (Little Dream) - 语音交互 AI 助手

华人牌 2060 款手机小梦 - 一个来自未来的语音助手，支持实时语音对话、情绪表达和系统控制。

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

## API 文档

### 文本聊天

```bash
POST /api/chat/text
Content-Type: application/json

{
  "message": "你好，小梦"
}
```

### 语音聊天

```bash
POST /api/chat
Content-Type: multipart/form-data

audio: <audio-file>
```

### 健康检查

```bash
GET /health
GET /health/detailed
GET /health/liveness
GET /health/readiness
```

详细 API 文档：[docs/health-check-api.md](docs/health-check-api.md)

## 配置

### 环境变量

支持 30+ 个环境变量配置项，包括：
- LLM 配置（temperature, timeout 等）
- 句子处理配置
- 背压控制配置
- 聊天配置
- TTS 配置

完整配置文档：[docs/environment-variables.md](docs/environment-variables.md)

### 配置验证

系统内置配置验证，确保所有配置值在合理范围内：

```bash
# 启用配置验证
NODE_ENV=development npm start

# 或在生产环境
VALIDATE_CONFIG=true npm start
```

## 测试

```bash
# 运行配置测试
node test-config.js

# 测试 API
curl -X POST http://localhost:3000/api/chat/text \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'
```

## 日志

日志文件位于 `logs/` 目录：

- `app-YYYY-MM-DD.log` - 所有日志（保留 14 天）
- `error-YYYY-MM-DD.log` - 错误日志（保留 30 天）

日志级别：`error` | `warn` | `info` | `debug`

详细日志文档：[docs/logging.md](docs/logging.md)

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

ISC

## 更新日志

### v1.0.0 (2026-05-13)

- ✅ 配置系统重构，支持环境变量
- ✅ 添加配置验证和测试
- ✅ Docker 容器化支持
- ✅ 完善的健康检查和日志系统
- ✅ 详细的部署和配置文档
