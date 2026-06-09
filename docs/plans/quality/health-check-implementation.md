# 健康检查系统实现总结

## 完成时间
2026-05-13

## 实现内容

### 1. 服务健康检查方法

#### LLM 服务 (`services/llm_service.js`)
- 新增 `checkHealth()` 方法
- 检查 Mimo 和 Kimi API 的可用性
- 测量 API 响应延迟
- 返回详细的健康状态和错误信息

#### TTS 服务 (`services/index.js`)
- 新增 `checkTTSHealth()` 方法
- 检查当前配置的 TTS 提供商
- 验证服务可用性
- 测量响应延迟

### 2. 健康检查路由 (`routes/healthRoutes.js`)

创建了 4 个健康检查端点：

#### `/health` - 基础健康检查
- 检查所有服务状态
- 返回整体健康状态（ok/degraded/error）
- 包含服务延迟信息
- 状态码：200（正常）/ 503（降级）/ 500（错误）

#### `/health/detailed` - 详细健康检查
- 包含所有基础检查信息
- 额外提供内存使用情况
- 提供 CPU 使用情况
- 适合监控系统使用

#### `/health/liveness` - 存活检查
- 极快响应，无外部依赖
- 用于负载均衡器
- 始终返回 200（除非服务崩溃）

#### `/health/readiness` - 就绪检查
- 检查必要的环境变量配置
- 用于 Kubernetes readiness probe
- 状态码：200（就绪）/ 503（未就绪）

### 3. 集成到主服务器

- 在 `server.js` 中注册健康检查路由
- 健康检查端点不受 API 限流影响
- 所有检查失败都会记录到日志系统

### 4. 文档

创建了完整的文档：
- `docs/health-check-api.md` - API 详细文档
  - 端点说明和响应示例
  - Kubernetes/Nginx 配置示例
  - 监控建议和告警阈值
  - 故障排查指南
- 更新 `CLAUDE.md` - 添加健康检查和日志系统说明

## 测试结果

所有端点测试通过：

### 基础健康检查
```json
{
  "status": "ok",
  "timestamp": 1778657666690,
  "uptime": 30.04,
  "services": {
    "llm": {
      "mimo": "ok",
      "kimi": "ok",
      "latency": { "mimo": 2887, "kimi": 2460 }
    },
    "tts": {
      "provider": "mimo",
      "status": "ok",
      "latency": 0
  }
  }
}
```

### 详细健康检查
包含内存和 CPU 使用情况，所有服务状态正常。

### 存活检查
```json
{
  "status": "alive",
  "timestamp": 1778657679287
}
```

### 就绪检查
```json
{
  "status": "ready",
  "timestamp": 1778657686701
}
```

## 技术特点

1. **异步检查**: 所有外部 API 检查都是异步的，不阻塞主线程
2. **超时保护**: API 检查设置 5 秒超时，避免长时间等待
3. **错误处理**: 完善的错误捕获和日志记录
4. **分级检查**: 提供不同粒度的检查端点，适应不同场景
5. **标准兼容**: 遵循 Kubernetes 健康检查最佳实践

## 使用场景

### 1. 负载均衡器
使用 `/health/liveness` 进行快速健康检查

### 2. Kubernetes
- Liveness Probe: `/health/liveness`
- Readiness Probe: `/health/readiness`

### 3. 监控系统
- 定期调用 `/health/detailed` 收集指标
- 设置告警规则（延迟、可用性、内存等）

### 4. 运维工具
- 快速诊断服务状态
- 查看详细的系统资源使用情况

## 监控建议

### 告警阈值
- LLM 延迟 > 5000ms
- 任一服务不可用超过 1 分钟
- 堆内存使用率 > 80%
- 状态为 `degraded` 或 `error`

### 检查频率
- Liveness: 每 10 秒
- Readiness: 每 5 秒
- 基础健康检查: 每 30 秒
- 详细健康检查: 每 5 分钟

## 后续优化建议

1. **缓存健康检查结果**: 考虑缓存 5-10 秒，减少外部 API 调用
2. **Prometheus 指标**: 导出 Prometheus 格式的指标
3. **自定义检查**: 支持插件式的自定义健康检查
4. **历史趋势**: 记录健康检查历史，用于趋势分析
5. **依赖检查**: 添加数据库、Redis 等依赖的健康检查

## 相关文件

### 新增文件
- `routes/healthRoutes.js` - 健康检查路由
- `docs/health-check-api.md` - API 文档

### 修改文件
- `services/llm_service.js` - 添加 `checkHealth()` 方法
- `services/index.js` - 添加 `checkTTSHealth()` 方法和日志
- `server.js` - 注册健康检查路由
- `CLAUDE.md` - 更新项目文档

## 依赖项

无新增依赖，使用现有的：
- `express` - 路由框架
- `axios` - HTTP 客户端（用于 API 检查）
- `winston` - 日志系统

## 总结

成功实现了完整的健康检查系统，包括：
- ✅ 4 个健康检查端点
- ✅ LLM 和 TTS 服务健康检查
- ✅ 详细的系统资源监控
- ✅ 完整的文档和使用示例
- ✅ 符合 Kubernetes 和负载均衡器标准
- ✅ 完善的错误处理和日志记录

系统现在具备了生产级别的监控能力，可以轻松集成到各种运维和监控工具中。
