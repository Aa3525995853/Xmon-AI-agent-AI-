# 性格系统使用指南

## 目录结构

```
config/personalities/
├── index.js        # 性格管理器（自动加载所有性格）
├── normal.js         # 正常性格
├── bad.js        # 坏/毒舌性格
└── cute.js           # 可爱性格（台湾腔）
```

## 已有性格

### 1. normal（正常）
- **特点**：自然流畅，可爱友好
- **适合场景**：日常聊天
- **说话风格**：简短有力，像朋友一样自然

### 2. bad（坏/毒舌）
- **特点**：毒舌吐槽，高反差神回复
- **适合场景**：想要被吐槽、寻求刺激
- **说话风格**：直接怼人，嘴硬心软

### 3. cute（可爱）
- **特点**：超可爱台湾腔，软萌撒娇
- **适合场景**：想要被萌到、放松心情
- **说话风格**：台湾腔特色词汇，语气上扬

## 如何添加新性格

### 步骤 1：创建性格文件

在 `config/personalities/` 目录下创建新文件，例如 `gentle.js`：

```javascript
/**
 * gentle 性格 - 温柔体贴
 */

module.exports = {
    id: 'gentle',                    // 唯一ID
    name: '温柔',                    // 显示名称
    description: '温柔体贴的小梦',   // 描述

    systemPrompt: `你是小梦，一个温柔体贴的AI助手。

【性格特点】
- 温柔体贴，善于倾听
- 说话轻声细语
- 关心用户的感受
【说话风格】
- "今天过得怎么样呢？"
- "听起来你有点累了，要不要休息一下？"
- "嗯嗯，我懂你的感受~"

<style>标签可选值：温柔/开心/关心/平静。
不要输出思考过程。不要输出JSON格式。`
};
```

### 步骤 2：注册到管理器

编辑 `config/personalities/index.js`，在 `builtInFiles` 数组中添加新文件：

```javascript
loadBuiltInPersonalities() {
    const builtInFiles = [
        'normal.js',
        'bad.js',
        'cute.js',
      'gentle.js'  // 添加新性格
    ];
    // ...
}
```

### 步骤 3：重启服务

```bash
npm start
```

性格管理器会自动加载新性格，无需修改其他代码！

## 性格配置字段说明

### 必填字段

- **id** (string): 唯一标识符，用于 API 调用
- **name** (string): 显示名称，用于前端展示
- **systemPrompt** (string): LLM 系统提示词（最重要）

### 可选字段

- **description** (string): 简短描述，帮助用户选择

## 使用示例

### API 调用

```bash
# 使用 cute 性格
curl -X POST http://localhost:3000/api/chat/text \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好",
    "personality": "cute"
  }'
```

### 前端调用

```javascript
const response = await fetch('/api/chat/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
        message: '你好',
        personality: 'cute'  // normal, bad, cute
    })
});
```

## 性格管理器 API

```javascript
const personalityManager = require('./config/personalities');

// 获取所有性格列表
const list = personalityManager.list();
// [{ id: 'normal', name: '正常', description: '...' }, ...]

// 获取所有性格ID
const ids = personalityManager.getIds();
// ['normal', 'bad', 'cute']

// 获取特定性格
const personality = personalityManager.get('cute');
// { id: 'cute', name: '可爱', systemPrompt: '...' }

// 获取系统提示词
const prompt = personalityManager.getSystemPrompt('cute');
// "你是小梦，一个超可爱的台湾腔AI助手..."
```

## 注意事项

1. **性格ID必须唯一**：不能与现有性格重复
2. **systemPrompt是核心**：这是决定性格表现的关键
3. **自动加载**：添加新文件后重启服务即可，无需修改其他代码
4. **验证器自动更新**：性格列表会自动同步到参数验证
5. **默认性格**：如果请求的性格不存在，会自动使用 normal 性格

## 优势

- ✅ **模块化**：每个性格独立文件，易于管理
- ✅ **易扩展**：添加新性格只需创建一个文件
- ✅ **自动加载**：无需手动注册，启动时自动扫描
- ✅ **类型安全**：统一的配置结构
- ✅ **动态验证**：参数验证自动同步性格列表
