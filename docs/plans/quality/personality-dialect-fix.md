# 性格与方言系统修复报告

## 问题描述

1. **Normal 性格输出 Cute 性格回复**
   - 问题：`config/personalities/normal.js` 的 systemPrompt 中包含"可爱的AI助手"描述
   - 影响：即使选择 normal 模式，LLM 仍然输出可爱风格的回复

2. **方言音色未触发**
   - 问题：前端已发送 `dialect` 参数，但后端完全没有处理
   - 影响：无论选择哪种方言，都使用默认普通话音色

## 修复内容

### 1. 修复 Normal 性格配置

**文件**: `config/personalities/normal.js`

**修改**:
- 移除"可爱的AI助手"描述
- 改为"自然友好的AI助手"
- 添加禁止过度可爱表达的规则
- 强调中性友好的语气

**关键变更**:
```javascript
// 之前
systemPrompt: `你是小梦，一个可爱的AI助手。`

// 之后
systemPrompt: `你是小梦，一个自然友好的AI助手。
【禁止事项】
- 过度可爱的表达：叠词（棒棒、萌萌）、撒娇语气（人家、嘛）、过多语气词（呀～、啦～）`
```

### 2. 实现方言音色切换功能

#### 2.1 控制器层 (`controllers/chatController.js`)

**修改**:
- `handleTextChat` 函数增加 `personality` 和 `dialect` 参数
- `handleVoiceChat` 函数增加 `personality` 和 `dialect` 参数
- 返回值中添加 `dialect` 字段，传递给 TTS

**关键代码**:
```javascript
async function handleTextChat(message, personality = 'normal', dialect = null) {
  console.log(`[主人说]: ${message} [性格: ${personality}] [方言: ${dialect || '普通话'}]`);
  
  // 调用 LLM 时传入 personality
  llmResponse = await generateReply(message, message, null, personality);
  
  return {
    // ...其他字段
    dialect // 传递方言参数给 TTS
  };
}
```

#### 2.2 路由层 (`routes/chatRoutes.js`)

**修改**:
- 文本聊天接口：从 `req.body` 提取 `personality` 和 `dialect`
- 语音聊天接口：从 `req.body` 提取 `personality` 和 `dialect`
- TTS 调用时传递 `dialect` 参数

**关键代码**:
```javascript
// 文本聊天
const { message, personality, dialect } = req.body;
const result = await chatController.handleTextChat(message, personality, dialect);

// 语音聊天
const personality = req.body && req.body.personality ? req.body.personality : 'normal';
const dialect = req.body && req.body.dialect ? req.body.dialect : null;
const result = await chatController.handleVoiceChat(userText, personality, dialect);
// TTS 调用
await ttsController.textToSpeech(result.ttsText, {
  userMessage: userText,
  emotion: result.emotion,
  speech_rate: result.speech_rate,
  volume: result.volume,
  dialect: result.dialect // 传递方言参数
});
```

#### 2.3 LLM 服务层 (`services/llm_service.js`)

**修改**:
- `buildSystemPrompt` 函数增加 `personality` 参数
- 根据 `personality` 加载对应的性格配置
- 将性格配置的 `systemPrompt` 插入到系统提示中
- `callMimo`、`callKimi`、`generateReply`、`generateReplyWithStyle` 函数都增加 `personality` 参数

**关键代码**:
```javascript
function buildSystemPrompt(personality = 'normal') {
  // 加载性格配置
  const personalities = require('../config/personalities');
  const personalityConfig = personalities[personality] || personalities['normal'];
  
  return `${personalityConfig.systemPrompt}

现在是${timePeriod}。
关系状态：${relAdvice}（亲密度${intimacy}%）
...`;
}

async function callMimo(text, userText = '', tools = null, personality = 'normal') {
  const systemPrompt = buildSystemPrompt(personality);
  // ...
}

async function generateReply(text, userText = '', tools = null, personality = 'normal') {
  // ...
  response = await callMimo(text, userText, tools, personality);
  // ...
}
```

#### 2.4 TTS 控制器层 (`controllers/ttsController.js`)

**修改**:
- `textToSpeech` 函数检查 `options.dialect` 参数
- 如果有方言参数，从 `config/voiceConfig.js` 加载对应的音色配置
- 将方言音色配置合并到 `options` 中

**关键代码**:
```javascript
async function textToSpeech(text, options = {}) {
  // 如果有方言参数，加载对应的音色配置
  if (options.dialect) {
    const voiceConfig = require('../config/voiceConfig');
    const provider = process.env.TTS_PROVIDER || 'mimo';
    const dialectConfig = voiceConfig.getVoiceConfig(options.dialect, provider);
    
    console.log(`[TTS] 使用方言音色: ${options.dialect}`, dialectConfig);
    
    // 合并方言配置到 options
    options = {
      ...options,
      ...dialectConfig
    };
  }
  
  // 调用 TTS 服务
  const audioBuffer = await tts.generateVoiceWav(cleanedText, options);
  // ...
}
```

## 音色配置

**文件**: `config/voiceConfig.js`

已有的方言音色配置：
- `taiwan`: 台湾腔
- `dongbei`: 东北话
- `sichuan`: 四川话
- `henan`: 河南话
- `cantonese`: 粤语

每个方言配置包含：
```javascript
taiwan: {
  voice: 'mimo_default',
  style: '台湾腔',
  speed: 1.0,
  pitch: 1.0,
  volume: 0.9
}
```

## 数据流

### 性格参数流
```
前端 (personality: 'normal')
  ↓
routes/chatRoutes.js (提取 personality)
  ↓
controllers/chatController.js (传递 personality)
  ↓
services/llm_service.js (加载性格配置)
  ↓
LLM API (使用性格化的 systemPrompt)
```

### 方言参数流
```
前端 (dialect: 'taiwan')
  ↓
routes/chatRoutes.js (提取 dialect)
  ↓
controllers/chatController.js (传递 dialect)
  ↓
controllers/ttsController.js (加载方言音色配置)
  ↓
services/mimo_tts.js (使用方言音色)
  ↓
TTS API (生成方言语音)
```

## 测试建议

1. **测试 Normal 性格**
   - 发送消息："你好"
   - 预期：回复应该是自然友好的语气，不应该有"呀～"、"人家"等可爱表达

2. **测试方言音色**
   - 选择台湾腔，发送消息："你好"
   - 预期：TTS 应该使用台湾腔音色
   - 检查日志：应该看到 `[TTS] 使用方言音色: taiwan`

3. **测试性格+方言组合**
   - 选择 cute 性格 + 台湾腔
   - 预期：LLM 回复应该是可爱风格，TTS 应该使用台湾腔

## 注意事项

1. **性格与方言分离**
   - 性格（personality）控制 LLM 的回复风格
   - 方言（dialect）控制 TTS 的音色
   - 两者可以独立组合使用

2. **默认值**
   - personality 默认为 'normal'
   - dialect 默认为 null（普通话）

3. **兼容性**
   - 所有函数都保持向后兼容
   - 如果不传 personality 或 dialect，使用默认值

## 修改文件列表

1. `config/personalities/normal.js` - 修复性格配置
2. `controllers/chatController.js` - 添加参数支持
3. `routes/chatRoutes.js` - 提取并传递参数
4. `services/llm_service.js` - 实现性格切换
5. `controllers/ttsController.js` - 实现方言音色切换

## 日期

2026-05-14
