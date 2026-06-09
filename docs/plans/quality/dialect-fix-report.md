# 方言切换功能修复报告

## 问题描述

用户报告方言切换按钮无效，切换方言后语音输出仍然使用普通话。

## 问题定位

经过代码探索，发现问题根因：

**文本流式接口 `/api/chat/text-stream` 缺少方言参数的提取和传递**

### 代码对比

**语音流式接口**（正常工作）：
```javascript
// routes/chatRoutes.js 第192-194行
const dialect = req.body && req.body.dialect ? req.body.dialect : null;
console.log(`[流式] 性格: ${personality}, 方言: ${dialect || '普通话'}`);
await handleStreamChat(userText, res, personality, dialect);
```

**文本流式接口**（修复前，缺少 dialect）：
```javascript
// routes/chatRoutes.js 第232-233行
const personality = req.body && req.body.personality ? req.body.personality : 'normal';
await handleStreamChat(message, res, personality);  // ❌ 缺少第4个参数
```

## 影响范围

- ✅ 语音输入（录音）：方言功能正常
- ❌ 文本输入（打字）：方言功能失效（**这是用户最常用的方式**）

## 修复方案

### 1. 修复文本流式接口的方言参数传递

**文件**: `routes/chatRoutes.js`

**修改位置**: 第232-235行
**修改内容**:
```javascript
// 修改前
const personality = req.body && req.body.personality ? req.body.personality : 'normal';
await handleStreamChat(message, res, personality);

// 修改后
const personality = req.body && req.body.personality ? req.body.personality : 'normal';
const dialect = req.body && req.body.dialect ? req.body.dialect : null;
console.log(`[文本流式] 性格: ${personality}, 方言: ${dialect || '普通话'}`);
await handleStreamChat(message, res, personality, dialect);
```

### 2. 同步修复其他接口

检查发现其他接口也需要补充方言参数传递：

**a) POST /api/chat/text** (非流式文本接口)
- 文件: `routes/chatRoutes.js` 第48行
- 修改: 添加 `dialect` 参数提取和传递

**b) POST /api/chat** (非流式语音接口)
- 文件: `routes/chatRoutes.js` 第85行
- 修改: 添加 `dialect` 参数提取和传递到 TTS 选项

### 3. 添加参数验证

**文件**: `middleware/validator.js`

**修改内容**:
- `chatTextValidation`: 添加 `dialect` 验证规则
- `ttsStreamValidation`: 添加 `dialect` 验证规则
- `chatStreamValidation`: 添加 `dialect` 验证规则

**验证规则**:
```javascript
body('dialect')
    .optional()
    .isIn(['taiwan', 'dongbei', 'sichuan', 'henan', 'cantonese'])
    .withMessage('dialect必须是taiwan/dongbei/sichuan/henan/cantonese之一')
```

## 测试验证

### 1. 单元测试

运行 `test-dialect-simple.js`，验证参数提取逻辑：
```
✅ 测试 1: taiwan 参数提取正确
✅ 测试 2: dongbei 参数提取正确
✅ 测试 3: 无方言参数，默认普通话
✅ 测试 4: 无任何参数，默认普通话
```

### 2. 集成测试

运行 `test-dialect.js`，测试所有方言：
```
✅ 普通话 测试通过
✅ 台湾腔 测试通过
✅ 东北话 测试通过
✅ 四川话 测试通过
✅ 河南话 测试通过
✅ 粤语 测试通过
```

### 3. 手动测试步骤

1. 启动服务: `npm start`
2. 打开浏览器: `http://localhost:3000/index.html`
3. 点击方言切换按钮，切换到"台湾腔"
4. 在文本输入框输入："你好，今天天气怎么样？"
5. 点击发送按钮
6. 验证音频使用台湾腔音色

**预期日志输出**:
```
[文本流式] 性格: normal, 方言: taiwan
[逐句TTS] 使用方言音色 { dialect: 'taiwan', provider: 'mimo' }
```

## 修改文件清单

1. `routes/chatRoutes.js` - 添加方言参数提取和传递
2. `middleware/validator.js` - 添加方言参数验证
3. `test-dialect.js` - 集成测试脚本（新增）
4. `test-dialect-simple.js` - 单元测试脚本（新增）

## 技术细节

### 方言参数流程

```
前端 (index.html)
  ↓ 点击方言切换按钮
state.dialect = 'taiwan'
  ↓ 发送请求
POST /api/chat/text-stream { message, personality, dialect }
  ↓
routes/chatRoutes.js
  ↓ 提取参数
const dialect = req.body.dialect
  ↓ 传递参数
handleStreamChat(message, res, personality, dialect)
  ↓
controllers/streamChatController.js
  ↓ 获取方言音色配置
voiceConfig.getVoiceConfig(dialect, provider)
  ↓
services/mimo_tts.ts
  ↓ 使用方言风格标签
style: '台湾腔' / '东北话' / '四川话' / '河南话' / '粤语'
  ↓
生成对应方言的语音
```

### 支持的方言列表

| 方言ID | 显示名称 | 风格标签 |
|--------|---------|---------|
| null | 普通话 | 默认 |
| taiwan | 台湾腔 | 台湾腔 |
| dongbei | 东北话 | 东北话 |
| sichuan | 四川话 | 四川话 |
| henan | 河南话 | 河南话 |
| cantonese | 粤语 | 粤语 |

## 风险评估

**风险等级**: 低

**原因**:
- 只修改参数传递逻辑，不改变现有业务逻辑
- `dialect` 为可选参数，默认 `null`（普通话），向后兼容
- 其他接口已验证该模式可行
- 添加了参数验证，防止无效输入
**回滚方案**:
如果出现问题，只需移除添加的 `dialect` 参数传递即可恢复原状。

## 总结

本次修复解决了文本输入时方言切换无效的问题，确保了前端方言切换按钮在所有输入方式下都能正常工作。修复后，用户可以通过点击方言按钮切换不同的语音风格，系统会正确应用对应的方言音色。

**修复前**:
- 语音输入 ✅
- 文本输入 ❌

**修复后**:
- 语音输入 ✅
- 文本输入 ✅

---

**修复日期**: 2026-05-15  
**修复人员**: Claude (Anthropic)  
**测试状态**: ✅ 通过
