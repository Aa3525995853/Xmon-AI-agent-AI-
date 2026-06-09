---
name: using-superpowers
description: "项目介绍和 Superpowers Skills 系统概览"
---

# Using Superpowers（使用超级能力）

## 什么是 Superpowers？

Superpowers 是一套完整的软件开发方法论，基于一组可组合的 skills 和一些初始指令，确保你的 AI 代理使用它们。

## 快速开始

```
给 AI 代理 Superpowers：brainstorming → writing-plans → TDD → code review
```

## 核心 Skills

| Skill | 用途 | 何时使用 |
|-------|------|---------|
| **brainstorming** | 设计头脑风暴 | 写代码前 |
| **writing-plans** | 任务规划 | 设计完成后 |
| **test-driven-development** | TDD 实践 | 实现中 |
| **systematic-debugging** | 调试方法 | 遇到问题时 |
| **requesting-code-review** | 请求审查 | 任务之间 |
| **verification-before-completion** | 完成验证 | 验证修复 |

## 工作流

```
1. Brainstorming    →  2. Writing Plans    →  3. TDD 实现
   理解需求，探讨方案    任务拆分，2-5分钟/任务   红→绿→重构
          ↓                                               ↓
   4. 代码审查       →  5. 验证完成
   按严重性报告问题    测试通过，功能验证
```

## 关键原则

### 设计优先
"太简单不需要设计"是反模式。每个项目都必须先设计再实现。

### 测试驱动
没有失败的测试就不能写生产代码。RED → GREEN → REFACTOR。

### 增量验证
展示设计，获得批准后再继续。每个任务后进行代码审查。

### 系统化调试
遇到问题？使用 4 阶段调试流程，而不是随机尝试。

## 文档位置

```
docs/superpowers/
├── PROJECT_SPEC.md           ← 项目规范
├── skills/                   ← Skills 目录
│   ├── brainstorming/
│   ├── writing-plans/
│   ├── test-driven-development/
│   └── ...
└── specs/                   ← 设计文档
    └── YYYY-MM-DD-*-design.md
```

## 参考资料

- 更多 Skills 见 `docs/superpowers/skills/` 目录
- Vercel Agent Skills 见 `D:\xm\sm\Claude-Skills\agent-skills\`