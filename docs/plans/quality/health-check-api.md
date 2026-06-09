# 健康检查 API 文档

## 概述

健康检查端点用于监控系统和各服务的运行状态，适用于负载均衡器、监控系统和 Kubernetes 等容器编排平台。

## 端点列表

### 1. 基础健康检查

**端点**: `GET /health`

**用途**: 检查系统整体健康状态和各服务可用性

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": 1778657666690,
  "uptime": 30.0351512,
  "services": {
    "llm": {
      "mimo": "ok",
      "kimi": "ok",
      "latency": {
        "mimo": 2887,
        "kimi": 2460
      }
    },
    "tts": {
      "provider": "mimo",
      "status": "ok",
      "latency": 0,
      "error": null
    }
  }
}
```

**状态码**:
- `200` - 所有服务正常
- `503` - 服务降级（部分服务不可用）
- `500` - 检查失败

**字段说明**:
- `status`: 整体状态 (`ok` / `degraded` / `error`)
- `timestamp`: 检查时间戳（毫秒）
- `uptime`: 服务运行时间（秒）
- `services.llm`: LLM 服务状态
  - `mimo`: Mimo API 状态
  - `kimi`: Kimi API 状态
  - `latency`: 响应延迟（毫秒）
- `services.tts`: TTS 服务状态
  - `provider`: 当前使用的 TTS 提供商
  - `status`: 服务状态
  - `latency`: 响应延迟（毫秒）
  - `error`: 错误信息（如有）

---

### 2. 详细健康检查

**端点**: `GET /health/detailed`

**用途**: 获取详细的系统信息，包括内存、CPU 使用情况

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": 1778657694610,
  "uptime": 57.9554542,
  "memory": {
    "rss": 77803520,
    "heapTotal": 28504064,
    "heapUsed": 24671120,
    "external": 3695227,
    "arrayBuffers": 40293
  },
  "cpu": {
    "user": 234000,
    "system": 203000
  },
  "services": {
    "llm": {
      "mimo": {
        "available": true,
        "latency": 920,
        "error": null
      },
      "kimi": {
        "available": true,
        "latency": 1466,
        "error": null
      }
    },
    "tts": {
      "provider": "mimo",
    "available": true,
      "latency": 0,
   "error": null
    }
  }
}
```

**字段说明**:
- `memory`: Node.js 内存使用情况
  - `rss`: 常驻集大小（字节）
  - `heapTotal`: 堆总大小
  - `heapUsed`: 已使用堆大小
  - `external`: V8 管理的 C++ 对象内存
  - `arrayBuffers`: ArrayBuffer 和 SharedArrayBuffer 内存
- `cpu`: CPU 使用情况（微秒）
  - `user`: 用户 CPU 时间
  - `system`: 系统 CPU 时间

---

### 3. 存活检查（Liveness Probe）

**端点**: `GET /health/liveness`

**用途**: 快速检查服务是否存活，用于负载均衡器和 Kubernetes liveness probe

**响应示例**:
```json
{
  "status": "alive",
  "timestamp": 1778657679287
}
```

**特点**:
- 极快响应，无外部依赖检查
- 始终返回 `200` 状态码（除非服务完全崩溃）
- 适合高频率健康检查

---

### 4. 就绪检查（Readiness Probe）

**端点**: `GET /health/readiness`

**用途**: 检查服务是否准备好接收流量，用于 Kubernetes readiness probe

**响应示例**:

**就绪状态**:
```json
{
  "status": "ready",
  "timestamp": 1778657686701
}
```

**未就绪状态**:
```json
{
  "status": "not_ready",
  "timestamp": 1778657686701,
  "reason": "缺少必要的环境变量配置"
}
```

**状态码**:
- `200` - 服务就绪
- `503` - 服务未就绪

**检查项**:
- 必要的环境变量是否配置（`MIMO_API_KEY`, `MIMO_API_URL`）

---

## 使用场景

### 1. 负载均衡器配置

**Nginx 示例**:
```nginx
upstream backend {
    server localhost:3000;
    
    # 健康检查
    check interval=3000 rise=2 fall=3 timeout=1000 type=http;
    check_http_send "GET /health/liveness HTTP/1.0\r\n\r\n";
    check_http_expect_alive http_2xx;
}
```

### 2. Kubernetes 配置

**Deployment 示例**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xiaomeng-backend
spec:
  template:
    spec:
      containers:
      - name: app
     image: xiaomeng:latest
        ports:
        - containerPort: 3000
        
        # 存活探针
        livenessProbe:
          httpGet:
            path: /health/liveness
            port: 3000
        initialDelaySeconds: 30
      periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        # 就绪探针
      readinessProbe:
          httpGet:
            path: /health/readiness
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
```

### 3. 监控系统集成

**Prometheus 示例**:
```yaml
scrape_configs:
  - job_name: 'xiaomeng'
    metrics_path: '/health/detailed'
    scrape_interval: 30s
    static_configs:
      - targets: ['localhost:3000']
```

### 4. 命令行检查

```bash
# 基础检查
curl http://localhost:3000/health

# 详细检查
curl http://localhost:3000/health/detailed | jq

# 存活检查
curl http://localhost:3000/health/liveness

# 就绪检查
curl http://localhost:3000/health/readiness
```

---

## 监控建议

### 1. 告警阈值

- **响应时间**: LLM 延迟 > 5000ms 告警
- **可用性**: 任一服务不可用超过 1 分钟告警
- **内存**: 堆使用率 > 80% 告警
- **状态**: `status` 为 `degraded` 或 `error` 时告警

### 2. 检查频率

- **Liveness**: 每 10 秒
- **Readiness**: 每 5 秒
- **基础健康检查**: 每 30 秒
- **详细健康检查**: 每 5 分钟

### 3. 日志记录

所有健康检查失败都会记录到日志系统：
```
2026-05-13 15:30:45 [ERROR] [健康检查] LLM 服务检查失败 {"error":"timeout"}
```

---

## 故障排查

### 问题：健康检查返回 503

**可能原因**:
1. LLM API 密钥未配置或无效
2. TTS 服务不可用
3. 网络连接问题

**排查步骤**:
1. 检查 `.env` 文件中的 API 配置
2. 查看详细健康检查 `/health/detailed` 获取具体错误
3. 检查日志文件 `logs/error-YYYY-MM-DD.log`

### 问题：健康检查超时

**可能原因**:
1. 外部 API 响应慢
2. 服务器负载过高

**解决方案**:
1. 增加健康检查超时时间
2. 优化服务器资源配置
3. 考虑使用 `/health/liveness` 替代完整检查

---

## 注意事项

1. **不应用限流**: 健康检查端点不受 API 限流影响
2. **轻量级检查**: 存活检查应尽可能轻量，避免外部依赖
3. **缓存策略**: 可考虑缓存健康检查结果（5-10 秒）以减少外部 API 调用
4. **安全性**: 生产环境建议限制健康检查端点的访问来源
