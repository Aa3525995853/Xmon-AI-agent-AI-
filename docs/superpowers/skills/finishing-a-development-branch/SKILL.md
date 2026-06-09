---
name: finishing-a-development-branch
description: "使用于完成任务、准备合并或清理工作分支时"
---

# Finishing a Development Branch（完成开发分支）

## 概述

当任务完成后，在合并或丢弃分支之前进行全面检查。

## 完成前检查

### 1. 代码状态
```bash
# 检查 git 状态
git status

# 检查未提交的更改
git diff --stat

# 确保工作目录干净
git diff-index --quiet HEAD --
```

### 2. 测试验证
```bash
# 运行完整测试套件
npm test

# 检查覆盖率
npm test -- --coverage

# 运行 lint
npm run lint
```

### 3. 提交历史
```bash
# 查看提交历史
git log --oneline -10

# 检查提交消息质量
git log --format="%s" -5
```

### 4. 代码审查
- 所有审查问题已解决或接受
- 没有未处理的 TODO/FIXME
- 代码符合项目规范

## 分支选项

### 选项 1: 创建 PR/MR
```bash
git checkout -b feature/new-feature
git push -u origin feature/new-feature
# 在 GitHub/GitLab 创建 PR
```

### 选项 2: 直接合并
```bash
git checkout main
git merge feature/new-feature
git push origin main
```

### 选项 3: 保留分支
```bash
# 推送到远程
git push origin feature/new-feature
# 稍后处理
```

### 选项 4: 丢弃分支
```bash
git branch -d feature/old-feature
git push origin --delete feature/old-feature
```

## 清理工作区

```bash
# 清理已合并的本地分支
git fetch -p
git branch -vv | grep ': gone]' | awk '{print $1}' | xargs -r git branch -d

# 清理临时文件
rm -rf tmp/
rm -f *.log.old
```

## 最终报告

```markdown
## 分支完成报告

**分支：** [分支名]
**任务：** [任务描述]

### 完成情况
- [ ] 所有测试通过
- [ ] 代码审查完成
- [ ] 文档已更新
- [ ] 部署验证（如适用）

### 后续步骤
- [ ] 合并到 main
- [ ] 部署到 [环境]
- [ ] 通知相关人员

### 备注
[任何需要记录的信息]
```