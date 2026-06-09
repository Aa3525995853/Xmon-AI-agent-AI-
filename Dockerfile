# 多阶段构建 Dockerfile
# Stage 1: Python 环境（用于 ASR 服务）
FROM python:3.10-slim AS python-base

WORKDIR /app

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Node.js 环境
FROM node:20-slim

WORKDIR /app

# 安装系统依赖（Puppeteer 和 Python 需要）
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# 从 python-base 复制 Python 3.10 和已安装的包
COPY --from=python-base /usr/local /usr/local

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装 Node.js 依赖（包括 PM2）
RUN npm ci --only=production && \
    npm install -g pm2 && \
    npm cache clean --force

# 复制应用代码
COPY . .

# 创建日志目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 3000 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动命令（使用 PM2 或直接启动）
# 使用 PM2: CMD ["pm2-runtime", "start", "ecosystem.config.js"]
# 直接启动: CMD ["node", "start-all.js"]
CMD ["node", "start-all.js"]
