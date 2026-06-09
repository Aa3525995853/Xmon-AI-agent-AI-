# 日志系统说明

## 概述

项目使用 Winston 日志库实现分级日志和文件轮转功能。

## 日志级别

- **error**: 错误信息（包含堆栈跟踪）
- **warn**: 警告信息
- **info**: 一般信息（默认级别）
- **debug**: 调试信息（开发环境自动启用）

## 日志文件

日志文件存储在 `logs/` 目录：

- `app-YYYY-MM-DD.log` - 所有日志（info 及以上级别）
- `error-YYYY-MM-DD.log` - 仅错误日志

## 文件轮转策略

- **按天轮转**: 每天自动创建新的日志文件
- **大小限制**: 单个文件最大 20MB
- **保留时间**:
  - 普通日志: 14 天
  - 错误日志: 30 天

## 使用方法

### 在新模块中使用

```javascript
const { logger } = require('./utils/logger');

// 记录不同级别的日志
logger.info('用户登录成功', { userId: 123 });
logger.warn('API 响应缓慢', { duration: 5000 });
logger.error('数据库连接失败', { error: err.message });
logger.debug('调试信息', { data: someData });
```

### 便捷方法

```javascript
const { info, warn, error, debug } = require('./utils/logger');

info('服务启动');
error('处理失败', { error: err.message });
```

### 初始化（可选）

在应用入口处初始化日志系统：

```javascript
const { initLogger } = require('./utils/logger');

// 仅初始化（不重写 console）
initLogger();

// 重写 console 方法以统一日志输出
initLogger(true);
```
## 环境变量

- `LOG_LEVEL`: 设置日志级别（默认: `info`）
- `NODE_ENV`: 开发环境（`development`）自动启用 `debug` 级别

## 日志格式

### 文件日志格式
```
2026-05-13 10:30:45 [INFO] 服务启动 {"port":3000}
2026-05-13 10:30:46 [ERROR] 连接失败 {"error":"timeout"}
```

### 控制台日志格式
带颜色的格式化输出，便于开发调试。

## 最佳实践

1. **使用结构化日志**: 将额外信息作为对象传递
   ```javascript
   logger.info('用户操作', { action: 'login', userId: 123 });
   ```

2. **错误日志包含堆栈**: Winston 自动捕获错误堆栈
   ```javascript
   try {
     // ...
   } catch (err) {
     logger.error('操作失败', { error: err.message, stack: err.stack });
   }
   ```

3. **合理使用日志级别**:
   - `error`: 需要立即关注的错误
   - `warn`: 潜在问题或异常情况
   - `info`: 重要的业务流程节点
   - `debug`: 详细的调试信息（生产环境不输出）

4. **避免敏感信息**: 不要记录密码、API 密钥等敏感数据

## 性能考虑

- 日志写入是异步的，不会阻塞主线程
- 文件轮转自动进行，无需手动管理
- 旧日志文件自动清理，避免磁盘占用过多
