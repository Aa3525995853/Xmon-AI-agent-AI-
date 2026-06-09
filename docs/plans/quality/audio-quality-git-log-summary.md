# 语音质量与音频感情相关 Git 日志总结

## 概述

本文档总结了小梦项目中关于语音质量优化和音频感情处理的所有重要 Git 提交记录。

## 关键提交时间线

### 2026-05-03: 音频平滑处理基础

**提交**: `f3cba17` - fix: preserve tts emotion and smooth pcm edges

**主要改进**:
1. **保留 TTS 情感标签**
   - 改进 `sanitizeTtsText` 方法，使用占位符保护 `<style>` 标签
   - 添加 `normalizeStyle` 方法规范化情感标签
   - 支持的情感：开心、悲伤、生气、惊讶、温柔、调皮、俏皮、撒娇、悄悄话、夹子音
   - 支持的方言：台湾腔、东北话、四川话、河南话、粤语

2. **PCM 边缘平滑处理**
   - 新增 `smoothPcm16` 方法，支持 fadeIn/fadeOut/removeDc
   - 前端音频播放器添加 `lastSampleValue` 跟踪
   - 在最后一个 chunk 后添加渐变尾部，消除突然截断的爆音

3. **音频参数调整**
   - fadeIn: 160 samples (首个 chunk)
   - fadeOut: 720 samples (最后一个 chunk)
   - 尾部静音: 4800 samples (200ms @ 24kHz)

**影响文件**:
- `services/mimo_tts.js` (+105 lines)
- `index.html` (+36 lines)

---

### 2026-05-03: 前端 Fade 优化

**提交**: `5741aba` - fix: fade final pcm chunk in browser  
**提交**: `7a479f1` - fix: smooth streaming tts pcm output

**改进**:
- 在浏览器端对最后一个 PCM chunk 应用 fade out
- 优化流式 TTS 的 PCM 输出平滑度

---

### 2026-05-10: Buffer 拼接播放器（重大重构）

**提交**: `3ca873e` - feat(audio): 实现Buffer拼接音频播放器，解决PCM流式播放间隙杂音问题

**问题诊断**:
- 旧方案：逐个 chunk 创建 `AudioBufferSourceNode` 并调度播放
- 问题根因：
  1. JavaScript 事件循环延迟导致节点切换间隙
  2. 频繁创建音频节点产生开销
  3. 音频不连续导致爆音和杂音

**解决方案**:
- 新增 `PCMAudioPlayer` 类
- **核心策略**：将同一播放单元的多个 PCM 片段预先拼接成连续 Buffer
- 每句话只创建一个 `AudioBufferSourceNode`
- 通过 `onended` 回调确保顺序播放
- 消除节点切换开销和间隙杂音

**技术细节**:
```javascript
class PCMAudioPlayer {
    // 累积多个小 chunk 到阈值（9600 bytes）
    // 拼接成连续 Buffer 后一次性播放
    // 使用 onended 回调触发下一个播放单元
}
```

**影响文件**:
- `TTS_TUNE_LOG.md` (+471 lines) - 详细记录调校过程
- `index.html` (+496 lines, -258 lines) - 重构三处音频播放逻辑

---

### 2026-05-10: 情感分类系统

**提交**: `0236266` - feat(emotion): 实现TextCNN-BiLSTM-SelfAttention情感分类系统

**功能**:
- 实现深度学习情感分类模型
- 架构：TextCNN + BiLSTM + Self-Attention
- 用于自动检测用户输入的情感倾向

---

### 2026-05-10: 文本清理增强

**提交**: `e68e426` - fix(text-cleaner): 增强CSS代码过滤，修复LLM生成CSS被TTS读出

**问题**: LLM 有时会生成 CSS 代码，被 TTS 直接读出

**修复**:
- 增强 `sanitizeTtsText` 方法
- 过滤 CSS 代码块
- 过滤 HTML 标签
- 过滤代码块（```...```）

---
### 2026-05-12: TTS 延迟优化系列

**提交**: `d36b5d1` - fix: 修复 TTS 回复延迟问题  
**提交**: `cb84fd6` - fix: 优化TTS文本处理，减少延迟至1秒内  
**提交**: `b01acfd` - fix: 移除ttsController.streamTextToSpeech中的重复文本处理

**优化内容**:
1. 移除重复的文本处理逻辑
2. 优化 TTS 文本预处理流程
3. 将首字延迟降低到 1 秒内

---

### 2026-05-12: 逐句 TTS 生成

**提交**: `7bf8ecd` - feat: 实现逐句TTS生成，文字和音频同步输出

**功能**:
- 实现流式聊天中的逐句 TTS 生成
- 文字和音频同步输出
- 降低首字延迟
- 提升用户体验

---

### 2026-05-12: Style 标签修复

**提交**: `ba1bf32` - fix: 修复TTS读出style标签的问题

**问题**: TTS 会读出 `<style>` 标签内容

**修复**:
- 改进 `sanitizeTtsText` 方法
- 正确处理 style 标签的保留和移除
- 确保标签不被 TTS 读出

---

### 2026-05-13: TypeScript 迁移

**提交**: `82f6751` - feat(typescript): 迁移 TTS 服务到 TypeScript - 第五阶段

**改进**:
- 将 TTS 服务迁移到 TypeScript
- 增强类型安全
- 改善代码可维护性

---

### 2026-05-14: 性格与方言分离

**提交**: `0bc1895` - feat: 实现性格与方言分离的音色系统  
**提交**: `34bd600` - feat: 添加方言选择按钮和前端交互

**功能**:
- 将性格系统和方言系统分离
- 性格决定说话风格和系统提示词
- 方言决定语音音色（台湾腔、东北话、四川话、河南话、粤语）
- 前端添加方言切换按钮
- 用户可独立选择性格和方言

---

## TTS_TUNE_LOG.md 关键调校记录

### 版本: 2026-05 最终调校版

#### 1. emitPcm 函数优化

**问题**: 每个 chunk 都施加 fadeIn+fadeOut，导致"呼吸声"杂音和顿挫感

**修复规则**:
- ✅ 中间 chunk 必须直接透传，不能调用 `smoothPcm16`
- ✅ 只对第一个 chunk 施加 fadeIn(80)
- ✅ 只对最后一个 chunk 施加 fadeOut(1200) + 静音尾部(80ms)
- ❌ 禁止对中间 chunk 执行任何形式的 PCM 修改

```javascript
const emitPcm = (pcmBuffer, { isFinal = false } = {}) => {
    let output = this.normalizePcm16(pcmBuffer);
    if (output.length === 0) return;

    if (isFinal) {
        // 最后一个 chunk: fadeOut + 静音尾部
        output = this.smoothPcm16(output, {
        fadeInSamples: 0,
            fadeOutSamples: 1200,
            removeDc: true
        });
        output = this.appendTailSilence(output, 24000, 80);
    } else if (!hasEmittedFirst) {
        // 第一个 chunk: fadeIn
        output = this.smoothPcm16(output, {
            fadeInSamples: 80,
            fadeOutSamples: 0,
            removeDc: true
        });
        hasEmittedFirst = true;
    }
    // 中间 chunk 直接透传，保持 API 返回的连续性

    onChunk(output);
};
```

#### 2. smoothPcm16 软限幅器

**问题**: "啦"等字突然拉高音，音量尖峰突兀

**修复**: 添加自适应软限幅器（soft limiter）

**算法**:
1. 计算 RMS（均方根）作为参考音量
2. 峰值阈值 = max(RMS × 4, 8000)
3. 超过阈值的采样点按比例压缩：`sample × (0.7 + 0.3 × ratio)`
4. 正常音量不受影响，只有突兀尖峰被平滑

```javascript
if (softLimit && rms > 0) {
    const absVal = Math.abs(sample);
    if (absVal > peakThreshold) {
        const ratio = peakThreshold / absVal;
        sample = sample * (0.7 + 0.3 * ratio);
    }
}
```

#### 3. globalEmotion 延迟提取

**问题**: `globalEmotion` 在流式数据到达前就执行提取，此时 `fullText` 还是空字符串，导致永远使用默认值'调皮'

**修复**: 延迟提取，在 `processSentence` 首次调用时动态从已收到的 `fullText` 中提取

```javascript
let globalEmotion = null;  // 延迟提取

async function processSentence(sentence) {
    if (globalEmotion === null) {
        globalEmotion = '调皮';
        const styleMatch = fullText.match(/<style>(.*?)<\/style>/);
        if (styleMatch) {
      const raw = styleMatch[1];
            const emotionMap = { /* ... */ };
     globalEmotion = emotionMap[raw] || '调皮';
        }
    }
    // ...
}
```

#### 4. pcmBytesToFloat32 Buffer 副本

**问题**: `atob` 创建的 `Uint8Array` 使用共享 `ArrayBuffer`，导致数据读取偏移错误，产生杂音

**修复**: 使用 `buffer.slice()` 创建独立副本

```javascript
function pcmBytesToFloat32(pcmData) {
    const byteLength = pcmData.length - (pcmData.length % 2);
    if (byteLength <= 0) return new Float32Array(0);
    
    // 使用 slice() 创建独立副本
    const src = new Int16Array(
        pcmData.buffer.slice(
        pcmData.byteOffset, 
         pcmData.byteOffset + byteLength
        )
    );
    
    const float32 = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) {
        float32[i] = src[i] / 32768;
    }
    return float32;
}
```
---

## 音频质量优化总结

### 已解决的问题

1. ✅ **间隙杂音** - 通过 Buffer 拼接播放器消除
2. ✅ **爆音** - 通过 fadeIn/fadeOut 和软限幅器消除
3. ✅ **呼吸声** - 通过只对首尾 chunk 施加 fade 消除
4. ✅ **音量尖峰** - 通过自适应软限幅器平滑
5. ✅ **情感丢失** - 通过延迟提取 globalEmotion 修复
6. ✅ **TTS 延迟** - 优化到 1 秒内首字响应
7. ✅ **Style 标签被读出** - 通过改进文本清理修复
8. ✅ **CSS 代码被读出** - 通过增强过滤修复

### 关键技术参数

| 参数 | 值 | 说明 |
|------|-----|------|
| fadeIn (首 chunk) | 80 samples | 约 3.3ms @ 24kHz |
| fadeOut (尾 chunk) | 1200 samples | 约 50ms @ 24kHz |
| 尾部静音 | 80ms | 防止突然截断 |
| 软限幅阈值 | max(RMS×4, 8000) | 自适应峰值检测 |
| Buffer 拼接阈值 | 9600 bytes | 约 200ms 音频 |
| 采样率 | 24000 Hz | MiMo TTS 标准 |
| 采样格式 | PCM16 | 16-bit signed integer |

### 支持的情感标签

**基础情感**:
- 开心、悲伤、生气、惊讶、温柔、调皮、俏皮、撒娇

**特殊风格**:
- 悄悄话、夹子音、唱歌、变快、变慢

**方言**:
- 台湾腔、东北话、四川话、河南话、粤语

---

## 相关文件

- `services/mimo_tts.js` - TTS 服务核心逻辑
- `index.html` - 前端音频播放器
- `TTS_TUNE_LOG.md` - 详细调校日志（675 行）
- `controllers/streamChatController.js` - 流式聊天控制器

---

**文档生成时间**: 2026-05-15  
**最后更新提交**: `34bd600` (2026-05-14)
