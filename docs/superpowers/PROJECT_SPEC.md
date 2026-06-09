# 傻梦 -场景控制 项目开发规范

> 基于 Superpowers + Vercel Agent Skills 的 TDD + 代码审查工作流

---

## 🎯 核心理念

**小梦 = 陪伴 + 工具，释放双手，说完就做完**

让用户通过自然语言完成现实世界的任务，而不只是聊天。

### 设计优先原则

> "太简单不需要设计" 是反模式。每一个项目（包括简单的改动）都必须经过设计 → 计划 → 实现 → 审查的流程。

---

## 🔄 标准开发流程

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. Brainstorming    →  2. Writing Plans    →  3. TDD 实现         │
│  理解需求，探讨方案     任务拆分，2-5分钟/任务   红→绿→重构          │
│         ↓                                                            │
│  4. 代码审查          →  5. 验证完成                                 │
│  按严重性报告问题       测试通过，功能验证                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📋 流程详解

### 阶段 1：Brainstorming（头脑风暴）

**触发时机**：任何代码之前必须先触发

**流程**：
1. 探索项目上下文（查看文件、文档、git历史）
2. 一次问一个问题，理解需求、目的、约束、成功标准
3. 提出 2-3 个方案及权衡，推荐其中一个
4. 分块展示设计，逐块确认
5. 写设计文档到 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
6. 用户审核设计文档
7. 调用 writing-plans 创建实现计划

**设计文档模板**：

```markdown
# [功能名称] 设计文档

## 背景
- 需求来源
- 解决的问题

## 设计方案
### 方案A
### 方案B（推荐）

## 架构设计
### 数据流
### 关键组件

## 测试计划
## 风险评估
```

---

### 阶段 2：Writing Plans（写实现计划）

**任务拆分原则**：
- 每个任务 2-5 分钟完成
- 每个任务包含：文件路径、完整代码、验证步骤
- 任务必须有明确的成功标准

**计划文档模板**：

```markdown
# [功能名称] 实现计划

## 任务列表

### Task 1: [任务名称]
- 文件: `src/xxx.js`
- 目标: 具体要做什么
- 验证: 如何验证完成
- 依赖: Task 0

### Task 2: [任务名称]
...

## 执行顺序
1. Task 1
2. Task 2
...
```

---

### 阶段 3：Test-Driven Development（TDD）

**RED-GREEN-REFACTOR 循环**：

```
RED    → 先写测试，运行看到失败
GREEN  → 写最少的代码让测试通过  
REFACTOR → 重构代码，保持测试通过
```

**关键规则**：
- 测试必须在实现代码之前写
- 删除在测试之前写的任何代码
- 每个任务必须有对应的测试

**TDD 反模式（避免）**：
- 写实现后补测试
- 测试覆盖不完整
- 跳过测试直接提交

---

### 阶段 4：代码审查

**触发时机**：任务之间、代码提交前

**审查清单**：

#### 🔴 严重问题（阻塞）
- [ ] 安全性问题（SQL注入、XSS、密码明文等）
- [ ] 内存泄漏风险
- [ ] 关键路径错误处理缺失
- [ ] 业务逻辑错误

#### 🟡 中等问题
- [ ] 代码重复（DRY违反）
- [ ] 命名不规范
- [ ] 缺少注释的关键逻辑
- [ ] 性能问题（循环内查询、N+1等）

#### 🟢 建议优化
- [ ] 代码风格
- [ ] 错误信息不够清晰
- [ ] 可以简化的逻辑

**审查输出格式**：

```markdown
## 代码审查报告

### 🔴 严重问题
1. [文件:行号] 问题描述
   - 影响: ...
   - 建议: ...

### 🟡 中等问题
1. [文件:行号] 问题描述
   - 建议: ...

### 🟢 建议
1. ...
```

---

### 阶段 5：验证完成

**验证清单**：
- [ ] 所有测试通过
- [ ] 代码审查问题已修复或接受
- [ ] 功能符合设计文档
- [ ] 没有新增 lint 错误
- [ ] 代码已提交

---

## 📁 项目结构规范

```
傻梦 -场景控制/
├── docs/
│   └── superpowers/
│       ├── specs/           ← 设计文档
│       │   └── YYYY-MM-DD-*-design.md
│       └── plans/           ← 实现计划
│           └── YYYY-MM-DD-*-plan.md
├── config/                  ← 配置文件
├── controllers/             ← 控制器
├── core/                    ← 核心服务
├── middleware/               ← 中间件
├── routes/                   ← 路由
├── services/                 ← 业务服务
│   └── *.js                   ← 每个文件 ≤ 500 行
├── tests/                    ← 测试文件
└── CLAUDE.md                 ← 项目规范
```

## 📏 代码规范

### 文件拆分原则

> **单个文件不超过 500 行**，超过则拆分

**拆分策略**：
```
大文件 (500+ 行)
  ├── 子模块1/
  │   ├── module1.js         ← 200-400行
  │   └── module1.test.js
  ├── 子模块2/
  │   ├── module2.js
  │   └── module2.test.js
  └── index.js               ← 组合导出
```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件 | kebab-case | `chat-controller.js` |
| 类 | PascalCase | `ChatController` |
| 函数 | camelCase | `getChatHistory()` |
| 常量 | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| 私有属性 | _前缀 | `_privateMethod()` |

---

## 🧪 测试规范

### 测试文件位置

```
services/
├── chatService.js
└── __tests__/
    ├── chatService.test.js
    └── fixtures/
        └── sample.json
```

### 测试命名

```javascript
describe('ChatService', () => {
  describe('getChatHistory', () => {
    it('should return empty array when no history', () => {...});
    it('should return last 10 messages by default', () => {...});
    it('should respect limit parameter', () => {...});
  });
});
```

### 覆盖率要求

- 核心业务逻辑：80%+
- 工具函数：90%+
- 路由处理：70%+

---

## 🔍 调试规范

### 系统化调试流程

```
1. 复现问题
   - 找到最小复现步骤
   - 记录错误信息

2. 收集证据
   - 查看日志 (logs/)
   - 检查错误堆栈
   - 验证输入输出

3. 追踪根因
   - 从症状到原因反向追踪
   - 使用断点或日志

4. 验证修复
   - 确认问题已解决
   - 确认没有引入新问题
```

---

## 📚 参考资料

- [Superpowers README](../Claude-Skills/superpowers/README.md)
- [Vercel React Best Practices](../Claude-Skills/agent-skills/packages/react-best-practices-build/)
- [Web Design Guidelines](../Claude-Skills/agent-skills/skills/web-design-guidelines.zip)

---

## 🔗 相关 Skills

| Skill | 用途 | 触发时机 |
|-------|------|---------|
| `brainstorming` | 设计头脑风暴 | 写代码前 |
| `writing-plans` | 任务规划 | 设计完成后 |
| `test-driven-development` | TDD 实践 | 实现中 |
| `requesting-code-review` | 请求审查 | 任务之间 |
| `systematic-debugging` | 调试方法 | 遇到问题时 |

---

**版本**: 1.0.0  
**更新日期**: 2026-06-04  
**基于**: Superpowers v5.1.0