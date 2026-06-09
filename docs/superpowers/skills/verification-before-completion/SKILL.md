---
name: verification-before-completion
description: "使用于验证修复或功能完成时"
---

# Verification Before Completion（完成前验证）

## 概述

"它工作了"不是验证。必须用证据证明。

## 验证清单

### 功能验证
```javascript
// 1. 边界条件
- 空输入
- 最小值/最大值
- 特殊字符
- 大量数据

// 2. 错误处理
- 网络失败
- 超时
- 无效数据
- 权限不足

// 3. 成功路径
- 典型输入
- 各种有效数据
```

### 测试验证
```bash
# 运行相关测试
npm test -- --testPathPattern="feature-name"

# 检查覆盖率
npm test -- --coverage

# 端到端测试
npm run test:e2e
```

### 手动验证
```bash
# API 测试
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"input": "test"}'

# 检查响应
# 检查日志
tail -20 logs/app-*.log
```

## 验证报告模板

```markdown
## 验证报告

**功能：** [功能名称]
**日期：** [日期]
**验证者：** [名称]

### 功能测试
| 测试用例 | 输入 | 预期输出 | 实际输出 | 状态 |
|----------|------|----------|----------|------|
| 边界测试 | [] | 处理 | 处理 | ✅ |
| 错误处理 | invalid | Error | Error | ✅ |

### 回归测试
- [ ] 相关功能未受影响
- [ ] 现有测试全部通过
- [ ] 无新增 lint 错误

### 结论
- [ ] 可以发布
- [ ] 需要修复后重新验证
```