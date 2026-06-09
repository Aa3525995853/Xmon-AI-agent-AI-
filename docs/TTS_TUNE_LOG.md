# TTS 音频调校日志

本文件记录 TTS 音频处理的所有关键调校改动，防止代码被篡改后可以恢复。

## 版本: 2026-05-05 最终调校版

### 修改文件 1: services/mimo\_tts.js

#### 改动 A: emitPcm 函数（第668-693行）

**问题**: 流式TTS中每个chunk都被施加fadeIn+fadeOut，导致chunk之间产生"呼吸声"杂音和顿挫感
**修复**: 只对首尾chunk施加fade，中间chunk直接透传

```javascript
// 变量声明（第665-666行）
let emitCount = 0;
let hasEmittedFirst = false;

// emitPcm 函数（第668-693行）
const emitPcm = (pcmBuffer, { isFinal = false } = {}) => {
    let output = this.normalizePcm16(pcmBuffer);
    if (output.length === 0) return;

    if (isFinal) {
        output = this.smoothPcm16(output, {
            fadeInSamples: 0,
            fadeOutSamples: 1200,
            removeDc: true
        });
        output = this.appendTailSilence(output, 24000, 80);
    } else if (!hasEmittedFirst) {
        output = this.smoothPcm16(output, {
            fadeInSamples: 80,
            fadeOutSamples: 0,
            removeDc: true
        });
        hasEmittedFirst = true;
    }
    // 中间chunk直接透传，不做任何处理，保持API返回的连续性

    emitCount++;
    emittedBytes += output.length;
    onChunk(output);
};
```

**关键规则**:

- ✅ 中间chunk必须直接透传，**不能调用 smoothPcm16**
- ✅ 中间chunk不能调用 removeDc、softLimit、fadeIn、fadeOut 任何处理
- ✅ 只对第一个chunk施加 fadeIn(80)
- ✅ 只对最后一个chunk(isFinal)施加 fadeOut(1200) + 静音尾部(80ms)
- ❌ 禁止对中间chunk执行任何形式的PCM修改

**错误历史**:

- 2026-05-05: 曾尝试对中间chunk加 softLimit 和 removeDc，导致严重爆音和杂音，已回退

***

#### 改动 B: smoothPcm16 函数（第122-181行）

**问题**: "啦"等字突然拉高音，音量尖峰突兀
**修复**: 添加自适应软限幅器（soft limiter），检测并平滑异常尖峰

```javascript
smoothPcm16(buffer, { fadeInSamples = 0, fadeOutSamples = 0, removeDc = true, softLimit = true } = {}) {
    const pcm = this.normalizePcm16(buffer);
    const output = Buffer.from(pcm);
    const sampleCount = Math.floor(output.length / 2);
    if (sampleCount === 0) return output;

    let dcOffset = 0;
    if (removeDc) {
        for (let i = 0; i < sampleCount; i++) {
            dcOffset += output.readInt16LE(i * 2);
        }
        dcOffset = Math.round(dcOffset / sampleCount);
    }

    // 先计算RMS作为参考音量，用于检测异常尖峰
    let rmsSum = 0;
    let rmsCount = 0;
    if (softLimit) {
        for (let i = 0; i < sampleCount; i++) {
            const val = output.readInt16LE(i * 2) - dcOffset;
            rmsSum += val * val;
            rmsCount++;
        }
    }
    const rms = rmsCount > 0 ? Math.sqrt(rmsSum / rmsCount) : 0;
    const peakThreshold = Math.max(rms * 4, 8000);

    const fadeIn = Math.min(fadeInSamples, sampleCount);
    const fadeOut = Math.min(fadeOutSamples, sampleCount);

    for (let i = 0; i < sampleCount; i++) {
        let sample = output.readInt16LE(i * 2) - dcOffset;

        if (softLimit && rms > 0) {
            const absVal = Math.abs(sample);
            if (absVal > peakThreshold) {
                const ratio = peakThreshold / absVal;
                sample = sample * (0.7 + 0.3 * ratio);
            }
        }

        if (fadeIn > 0 && i < fadeIn) {
            sample *= i / fadeIn;
        }

        if (fadeOut > 0 && i >= sampleCount - fadeOut) {
            const pos = i - (sampleCount - fadeOut);
            sample *= (fadeOut - pos - 1) / fadeOut;
        }

        const clamped = Math.max(-32768, Math.min(32767, Math.round(sample)));
        output.writeInt16LE(clamped, i * 2);
    }

    if (fadeOut > 0) {
        output.writeInt16LE(0, (sampleCount - 1) * 2);
    }

    return output;
}
```

**关键点**:

- 新增 `softLimit` 参数（默认true）
- RMS均方根计算作为参考音量
- 峰值阈值 = max(RMS \* 4, 8000)
- 超过阈值的采样点按比例压缩: `sample * (0.7 + 0.3 * ratio)`
- 正常音量不受影响，只有突兀尖峰被平滑

***

#### 改动 E: generateWithEmotionStream 函数（第623-628行）

**问题**: style标签被 sanitizeTtsText 重复处理
**修复**: 添加 skipSanitize 参数，避免重复处理

```javascript
async generateWithEmotionStream(text, emotion, onChunk, options = {}) {
    if (!this.apiKey) throw new Error('MiMo TTS API Key 未配置');
    const style = this.normalizeStyle(emotion || '调皮');
    const styledText = `<style>${style}</style>${text}`;
    return await this.generateVoiceStreamCallback(styledText, onChunk, { ...options, enhance: false, skipSanitize: true });
}
```

***

### 修改文件 2: server.js

#### 改动 C: globalEmotion 延迟提取（第1015-1033行）

**问题**: globalEmotion 在流式数据到达前就执行提取，此时 fullText 还是空字符串，导致永远使用默认值 '调皮'
**修复**: 延迟提取，在 processSentence 首次调用时动态从已收到的 fullText 中提取

```javascript
let globalEmotion = null;  // 延迟提取，等 fullText 有数据后再提取

async function processSentence(sentence) {
    if (!sentence) return;
    // 动态提取全局emotion：如果还未提取，则从当前已收到的 fullText 中提取
    if (globalEmotion === null) {
        globalEmotion = '调皮';
        const styleMatch = fullText.match(/<style>(.*?)<\/style>/);
        if (styleMatch) {
            const raw = styleMatch[1];
            const emotionMap = {
                '开心': '开心', '悲伤': '悲伤', '生气': '生气',
                '惊讶': '惊讶', '温柔': '温柔', '调皮': '调皮',
                '俏皮': '调皮', '撒娇': '调皮', '平静': '温柔',
                'calm': '温柔', 'happy': '开心', 'sad': '悲伤',
            };
            globalEmotion = emotionMap[raw] || '调皮';
        }
    }
    const emotion = globalEmotion;
    // ...
}
```

***

### 修改文件 3: index.html

#### 改动 D: pcmBytesToFloat32 函数（第1451-1460行）

**问题**: atob创建的Uint8Array使用共享ArrayBuffer，导致数据读取偏移错误，产生杂音
**修复**: 使用 buffer.slice() 创建独立副本

```javascript
function pcmBytesToFloat32(pcmData) {
    const byteLength = pcmData.length - (pcmData.length % 2);
    if (byteLength <= 0) return new Float32Array(0);
    const src = new Int16Array(pcmData.buffer.slice(pcmData.byteOffset, pcmData.byteOffset + byteLength));
    const float32 = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) {
        float32[i] = src[i] / 32768;
    }
    return float32;
}
```

**关键点**:

- 使用 `pcmData.buffer.slice()` 创建独立副本，避免共享buffer导致的数据偏移
- 使用 `pcmData.length` 代替 `pcmData.byteLength`（更可靠）

***

#### 改动 D: 流式音频播放器（index.html）

**问题**: AudioWorklet环形缓冲区push/pull在数据不连续时产生爆音
**修复**: 改为累积拼接 + AudioBufferSourceNode顺序播放

```javascript
// 累积缓冲区：将多个小chunk拼接成一块（阈值9600字节）
class PcmAccumulator {
    constructor(thresholdBytes = 9600) {
        this.threshold = thresholdBytes;
        this.buf = new Uint8Array(1024 * 1024);
        this.offset = 0;
        this.onFloat = null;
    }
    push(uint8) {
        if (this.offset + uint8.length > this.buf.length) this.flush();
        this.buf.set(uint8, this.offset);
        this.offset += uint8.length;
        if (this.offset >= this.threshold) this.flush();
    }
    flush() {
        if (this.offset === 0) return;
        const chunk = this.buf.slice(0, this.offset);
        this.offset = 0;
        const float32 = pcmBytesToFloat32(chunk);
        if (float32.length > 0 && this.onFloat) this.onFloat(float32);
    }
}

// 流式播放器：使用AudioBufferSourceNode顺序播放
class StreamingAudioPlayer {
    async feed(float32) {
        await this._started;
        this._queue.push(float32);
        if (!this._isPlaying) this._playNext();
    }
    _playNext() {
        if (this._queue.length === 0) { if (this._isStopping) this._doStop(); return; }
        this._isPlaying = true;
        const float32 = this._queue.shift();
        const audioBuffer = this.ctx.createBuffer(1, float32.length, this.sampleRate);
        audioBuffer.getChannelData(0).set(float32);
        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.ctx.destination);
        source.onended = () => { this._isPlaying = false; this._playNext(); };
        source.start();
    }
}
```

**关键点**:

- 使用 `PcmAccumulator` 将多个小chunk拼接成9600字节大块
- `StreamingAudioPlayer` 使用 `AudioBufferSourceNode` 顺序播放
- `AudioBufferSourceNode.onended` 回调触发下一个块播放
- 不再使用AudioWorklet环形缓冲区

***

## 恢复方法

如果以上代码被篡改或丢失，请参照本文件恢复：

1. **mimo\_tts.js**:
   - `emitPcm` 函数替换为改动A的代码
   - `smoothPcm16` 函数替换为改动B的代码
   - `generateWithEmotionStream` 函数替换为改动E的代码
2. **server.js**:
   - `globalEmotion` 延迟提取逻辑替换为改动C的代码
3. **index.html**:
   - `pcmBytesToFloat32` 函数替换为改动D的代码

***

## 版本: 2026-05-10 Buffer拼接播放器重构

### 修改文件: index.html

#### 改动 F: 新增 PCMAudioPlayer 类（Buffer拼接策略）

**问题**: 旧的逐个chunk播放方式（AudioBufferSourceNode逐个调度）存在间隙杂音、爆音问题，由于JavaScript事件循环延迟和频繁创建音频节点导致音频不连续
**修复**: 实现基于Buffer拼接的PCMAudioPlayer类，将同一播放单元的多个PCM片段预先拼接成连续Buffer后一次性播放

```javascript
class PCMAudioPlayer {
    constructor(sampleRate = 24000) {
        this.sampleRate = sampleRate;
        this.audioContext = null;
        this.audioQueue = [];      // 存储 {arrayBuffer, index} 对象
        this.isPlaying = false;
        this.currentSource = null;
        this.currentIndex = 0;     // 当前播放的index
        this.nextIndex = 0;        // 下一个分配的index
        this.firstPlay = true;
        this.pcmPushFinish = false;
        this.scheduledRanges = []; // 用于口型同步的音量检测
        this.onEndedCallback = null;
        this.onStartCallback = null;
    }

    // 核心：将同一index的所有buffer拼接成一个连续的大buffer
    getCombinedBuffer(targetIndex) {
        const items = this.audioQueue.filter(item => item.index === targetIndex);
        if (items.length === 0) return null;

        const totalLength = items.reduce((acc, item) => acc + item.arrayBuffer.byteLength, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const item of items) {
            combined.set(new Uint8Array(item.arrayBuffer), offset);
            offset += item.arrayBuffer.byteLength;
        }

        this.audioQueue = this.audioQueue.filter(item => item.index !== targetIndex);
        return combined;
    }

    // PCM数据转换为Web Audio API的AudioBuffer
    _pcmToAudioBuffer(pcmData) {
        const byteLength = pcmData.byteLength - (pcmData.byteLength % 2);
        if (byteLength <= 0) return null;

        const length = byteLength / 2;
        const audioBuffer = this.audioContext.createBuffer(1, length, this.sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        const int16Array = new Int16Array(pcmData.buffer, pcmData.byteOffset, length);

        for (let i = 0; i < length; i++) {
            channelData[i] = int16Array[i] / 32768;
        }
        return audioBuffer;
    }

    // 播放拼接后的Buffer，通过onended回调确保顺序播放
    async _playAudio(pcmData, index) {
        const audioBuffer = this._pcmToAudioBuffer(pcmData);
        if (!audioBuffer || audioBuffer.length === 0) return;

        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = audioBuffer;
        this.currentSource.connect(this.audioContext.destination);

        const now = this.audioContext.currentTime;
        let startTime;
        if (this.firstPlay) {
            startTime = now + 0.05;
            this.firstPlay = false;
        } else {
            const lastEnd = this.scheduledRanges.length > 0
                ? this.scheduledRanges[this.scheduledRanges.length - 1].end
                : now;
            startTime = Math.max(lastEnd, now);
        }

        const endTime = startTime + audioBuffer.duration;
        const volume = pcmRms(audioBuffer.getChannelData(0));

        this.currentSource.onended = () => {
            this.isPlaying = false;
            this.currentSource = null;
            this._tryPlayNext();  // 关键：播放完成后自动播放下一个
        };

        this.currentSource.start(startTime);
        this.isPlaying = true;

        this.scheduledRanges.push({ start: startTime, end: endTime, volume, index });
    }

    // 尝试播放下一个index的数据
    _tryPlayNext() {
        if (this.isPlaying) return;

        const combined = this.getCombinedBuffer(this.currentIndex);
        if (combined && combined.byteLength > 0) {
            this._playAudio(combined, this.currentIndex);
            this.currentIndex++;
            return;
        }

        if (this.pcmPushFinish) {
            const remaining = this.audioQueue.filter(item => item.index >= this.currentIndex);
            if (remaining.length === 0) {
                if (this.onEndedCallback) {
                    setTimeout(() => this.onEndedCallback(), 100);
                }
            } else {
                this._pollForNextAudio();
            }
            return;
        }

        this._pollForNextAudio();
    }

    // 轮询等待下一个数据到达
    _pollForNextAudio() {
        if (this.pcmPushFinish) return;
        setTimeout(() => {
            if (!this.isPlaying) this._tryPlayNext();
        }, 50);
    }
}
```

**关键改进**:

- ✅ 消除间隙：拼接后的Buffer在内存中连续，播放时无缝衔接
- ✅ 减少节点创建：每句话只创建一个AudioBufferSourceNode
- ✅ 保证波形连续性：不会在片段边界处产生波形突变
- ✅ 降低延迟开销：减少音频引擎的调度次数
- ✅ 使用index标识播放单元，支持流式数据的乱序到达

#### 改动 G: 替换三处音频播放逻辑

**涉及函数**: `sendAudio`、`processText`（自我介绍分支）、`processTextWithVoice`
**改动**: 将原有的 `audioCtx` + `pcmQueue` + `schedulePcm()` 模式全部替换为 `PCMAudioPlayer` 实例

**旧模式（已废弃）**:

```javascript
// 每个chunk独立创建AudioBufferSourceNode并精确调度
const source = audioCtx.createBufferSource();
source.buffer = audioBuffer;
source.connect(audioCtx.destination);
source.start(nextStartTime);  // 精确控制播放时间
nextStartTime += audioBuffer.duration;
```

**新模式**:

```javascript
// 使用PCMAudioPlayer自动管理拼接和顺序播放
const audioPlayer = new PCMAudioPlayer(24000);
audioPlayer.pushPCM(pcmBytes.buffer.slice(...), audioPlayer.nextIndex++);
// 同一index的所有chunks自动拼接后播放
```

**关键点**:

- 三处音频播放逻辑统一使用PCMAudioPlayer
- 口型同步通过 `audioPlayer.getCurrentVolume()` 获取实时音量
- 播放结束通过 `onEndedCallback` 统一处理状态重置

---

## 版本: 2026-05-10 情感分类器系统 - TextCNN-BiLSTM-SelfAttention

### 新增文件: services/emotion_classifier.js

#### 改动 H: 实现7种情感标签的深度学习分类器
**问题**: 原有系统仅支持4种基础情感（开心/难过/生气/惊讶），基于简单关键词匹配，无法精准识别复杂情感状态
**修复**: 实现基于 TextCNN-BiLSTM-SelfAttention 架构的情感分类器，支持7种细粒度情感标签

**7种情感标签**:
| 英文标签 | 中文标签 | 典型场景 |
|---------|---------|---------|
| angry | 愤怒 | 生气、恼火、不满、冲突 |
| disgust | 反感 | 厌恶、嫌弃、鄙视、排斥 |
| fear | 恐惧 | 害怕、担心、焦虑、紧张 |
| distressed | 内心辛苦 | 疲惫、压力、无奈、心累 |
| happy | 快乐 | 开心、满足、幸福、兴奋 |
| suffering | 困苦 | 痛苦、煎熬、困境、折磨 |
| sad | 悲伤 | 难过、伤心、失落、孤独 |

**核心架构**:
```javascript
class EmotionClassifier {
    // TextCNN: 提取局部n-gram特征（1-gram, 2-gram, 3-gram）
    extractNgramFeatures(text) {
        // n越大权重越高，更精确的匹配
    }

    // BiLSTM模拟: 提取序列特征，考虑上下文和否定词
    extractSequenceFeatures(text) {
        // 5词上下文窗口，检测否定词翻转情感极性
        // 程度副词调节情感强度（强/中/弱）
    }

    // Self-Attention: 计算词语重要性权重
    computeAttentionWeights(text) {
        // 位置权重（开头结尾更重要）
        // 情感词权重加倍
        // 标点符号增强（!!, ??）
        // Softmax归一化
    }

    // 特征融合与分类
    fuseAndClassify(ngramFeatures, sequenceFeatures, attentionWeights) {
        // TextCNN(0.3) + BiLSTM(0.5) + Attention(0.2)
    }

    // 情感动量（历史平滑）
    applyMomentum(currentScores) {
        // 最近3条历史记录加权平均
    }
}
```

**关键特性**:
- ✅ 否定词检测：自动识别"不/没/无"等否定词，翻转情感极性
- ✅ 程度副词：识别"非常/有点/不太"等，调节情感强度
- ✅ 情感动量：基于历史记录平滑情感波动，避免误判
- ✅ 位置感知：开头和结尾的词语权重更高

#### 改动 I: 语气词与表情增强系统
**功能**: 根据检测到的情感自动添加语气词和表情符号，增强真实感

```javascript
// 语气词库
particles: {
    happy: ['哈哈', '嘻嘻', '嘿嘿', '哇', '耶', '太棒啦', '真好呢', '开心~'],
    sad: ['唉', '呜呜', '好难过', '心疼', '抱抱', '别难过'],
    angry: ['哼', '真是的', '气死我了', '太过分了', '哎呀'],
    // ... 每种情感8-10个语气词
}

// 表情映射
emojiMap: {
    happy: ['😊', '😄', '🥰', '✨', '🎉'],
    sad: ['😢', '😭', '💔', '😔'],
    // ... 每种情感4-5个表情
}
```

**增强回复示例**:
- 快乐: `哈哈，看到你开心我也很高兴！ 😊`
- 悲伤: `唉... 想哭就哭出来吧，我陪着你。 😢`
- 愤怒: `哼！我能感受到你现在真的很生气。 😠`

#### 改动 J: 答案情感监视器（Answer Emotion Monitor）
**功能**: 监督AI回复的情感是否与用户情感匹配，确保高情商交互

```javascript
monitorAnswerEmotion(botResponse, userEmotion) {
    // 1. 分析AI回复情感
    const botEmotion = this.emotionClassifier.classify(botResponse);
    
    // 2. 检查情感兼容性
    const isMatched = this.checkEmotionMatch(userEmotion, botEmotion);
    
    // 3. 生成调整建议
    if (!isMatched) {
        return {
            suggestion: '用户正在生气，AI回复应该更加安抚和理解...'
        };
    }
}
```

**情感兼容性矩阵**:
- 用户angry → AI可回应: angry/disgust/distressed/sad/suffering（理解/共情）
- 用户happy → AI可回应: happy/excited（分享喜悦）
- 用户sad → AI可回应: sad/distressed/suffering（陪伴安慰）
- 用户fear → AI可回应: fear/distressed/sad/suffering（安全感）

**监视器统计**:
- 总交互次数
- 情感不匹配次数
- 不匹配率（目标 < 20%）

#### 改动 K: 高情商共情回复生成
**功能**: 基于检测到的情感自动生成高情商的共情回复

```javascript
generateEmpathyResponse(userEmotion, userText) {
    const strategy = this.getResponseStrategy(userEmotion);
    // 根据情感选择应对方式、语气风格、优先事项
}
```

**响应策略示例**:
| 情感 | 应对方式 | 语气风格 | 优先事项 |
|-----|---------|---------|---------|
| angry | calm_validation | gentle_firm | de-escalate > validate > redirect |
| fear | reassurance_support | warm_protective | reassure > ground > empower |
| sad | comfort_presence | gentle_present | comfort > presence > gentle_hope |
| happy | celebration_share | warm_enthusiastic | celebrate > share > amplify |

### 修改文件: services/context_engine.js

#### 改动 L: 集成情感分类器到上下文引擎
**改动**:
1. 引入 `EmotionClassifier` 模块
2. 添加 `analyzeUserEmotion()` 方法 - 分析用户输入情感
3. 添加 `getUserEmotionState()` 方法 - 获取当前情感状态
4. 添加 `getEmotionContextForLLM()` 方法 - 生成情感感知上下文供LLM使用
5. 修改 `learnFromInteraction()` - 使用新分类器替代旧的关键词匹配
6. 修改 `getContextForLLM()` - 在上下文中添加情感信息

**LLM情感上下文示例**:
```
## 用户当前情感状态
- 情感: 悲伤 (sad)
- 强度: strong
- 趋势: 下滑中

## 情感响应策略
- 应对方式: comfort_presence
- 语气风格: gentle_present
- 优先事项: comfort > presence > gentle_hope

## 情感交互指导
用户很悲伤，请给予安慰和陪伴，允许悲伤。

## 建议语气词
呜呜、抱抱
```

### 修改文件: server.js

#### 改动 M: 添加情感分析API端点
**新增端点**:

| 方法 | 端点 | 功能 |
|-----|------|------|
| POST | /api/emotion/analyze | 单条文本情感分析 |
| POST | /api/emotion/analyze-batch | 批量文本情感分析 |
| GET | /api/emotion/state | 获取当前用户情感状态 |
| GET | /api/emotion/trend | 获取情感趋势和历史 |
| POST | /api/emotion/monitor | 答案情感监视器 |
| POST | /api/emotion/empathy | 生成高情商共情回复 |
| DELETE | /api/emotion/history | 清空情感历史 |

**API响应示例** (`POST /api/emotion/analyze`):
```json
{
    "text": "今天真的好难过，工作压力大",
    "emotion": "distressed",
    "emotionLabel": "内心辛苦",
    "confidence": 0.72,
    "intensity": "strong",
    "scores": {
        "angry": 0.1,
        "disgust": 0.0,
        "fear": 0.2,
        "distressed": 2.8,
        "happy": 0.0,
        "suffering": 1.2,
        "sad": 0.5
    }
}
```

---

## 版本: 2026-05-19 音质修复 — 架构级重构

### 问题概述

用户反馈三个问题：
1. **电流声/杂音**：输出音频有类似电流的语音不稳定杂音，长时间对话杂音越来越严重
2. **结尾爆音**：音频结尾偶尔有"啪"的爆音
3. **音频截断**：输出的音频只有前半段，后半段丢失
4. **方言未重置**：重启服务后方言状态未重置为普通话

### 根因分析

经过多轮排查，发现问题的根本原因是**多层叠加的音频处理互相干扰**和**前端播放器调度架构缺陷**：

#### 根因1: 后端过度处理（杂音+爆音）

之前的后端 `emitPcm` 叠加了多层处理：
- LPF 低通滤波器 → 引入相位失真，长时间听杂音加重
- fadeOut ramp（从 lastSample 生成纯直流信号）→ "嗡"声杂音
- 静音尾部追加 → 不需要，TTS API 返回的音频结尾已自然衰减
- crossfade + tail buffer 持留 → 引入延迟和时序问题
- 中间 chunk 的 fadeIn/fadeOut → 制造音量凹陷

**结论**：TTS API 返回的 PCM 数据本身是干净的，不需要任何后端后处理。

#### 根因2: 前端被动等待式调度（杂音主因）

旧架构的致命流程：
```
Buffer A 播放中... → 播完 → onended 触发 → setTimeout(5ms) → _tryPlayNext → 调度 Buffer B
                                        ↑ 至少 5ms+ 静音间隙 ↑
```
每次 buffer 切换都有微小静音 → 高频瞬态 → 听起来像电流声。聊得越久切换次数越多，杂音越明显。

#### 根因3: 前端 _scheduleEndFadeout 时序错误（爆音+截断）

`_scheduleEndFadeout` 在 `finish()` 时立即调度 GainNode 从 1.0 → 0。当 `audio_end` 到达时，队列中可能还有大量未调度的音频 chunk。此时 `scheduledRanges` 为空 → `fadeStart = now` → GainNode 立即衰减到 0 → 后续所有音频被静音。

#### 根因4: 方言状态未持久化（方言问题）

`index.html` 中 `state.dialect` 初始化为 `null`（不从 localStorage 读取），`handleDialectSwitch` 也不写 localStorage。页面刷新后方言状态丢失。

### 修复方案

#### 修复1: 后端极简化 — 只做透传

**文件**: `services/mimo_tts.js` — `_doGenerateVoiceStream` 方法

移除所有后端音频处理，只保留：
- `carryByte` 字节对齐保护（防止 16-bit PCM 跨 chunk 错位）
- `normalizePcm16` 对齐检查
- `end` 事件中处理 `sseBuffer` 残留数据

```javascript
const emitPcm = (pcmBuffer) => {
    let buf = pcmBuffer;
    if (carryByte) {
        buf = Buffer.concat([carryByte, buf]);
        carryByte = null;
    }
    if (buf.length % 2 !== 0) {
        carryByte = Buffer.from([buf[buf.length - 1]]);
        buf = buf.slice(0, buf.length - 1);
    }

    const output = this.normalizePcm16(buf);
    if (output.length === 0) return;

    emitCount++;
    totalBytes += output.length;
    onChunk(output);
};
```

**移除的处理层**:
- ❌ LPF 低通滤波器（相位失真 → 杂音）
- ❌ fadeOut ramp（纯直流信号 → "嗡"声）
- ❌ 静音尾部追加（不需要）
- ❌ crossfade + tail buffer 持留（延迟+时序问题）
- ❌ 中间 chunk 的 fadeIn/fadeOut（音量凹陷）

#### 修复2: 前端主动调度式架构

**文件**: `index.html` — `PCMAudioPlayer` 类

**核心改动**: 从"被动等待"改为"主动调度"

旧架构:
```
pushPCM → 入队（if !isPlaying）→ 等 onended → setTimeout(5ms) → 调度下一个
```

新架构:
```
pushPCM → _scheduleQueued() → 立即调度到上一个 buffer 结束时间之后 → 无缝衔接
```

关键代码:
```javascript
_scheduleQueued() {
    while (true) {
        const combined = this.getCombinedBuffer(this.currentIndex);
        if (!combined || combined.byteLength === 0) break;
        this._scheduleOne(combined, this.currentIndex);
        this.currentIndex++;
    }
    if (this.pcmPushFinish && this.audioQueue.length === 0) {
        this._scheduleEndFadeout();
    }
}

_scheduleOne(pcmData, index) {
    // 立即调度，startTime = lastScheduledEnd
    // 多个 source 可以同时存在于 activeSources[]
    source.start(startTime);
    this.activeSources.push(source);
}
```

**关键改进**:
- ✅ 消除 buffer 间静音间隙：buffer 到达时立即调度，`scheduledRanges` 保证时序连续
- ✅ 多源并行：`activeSources[]` 数组跟踪所有活跃源，不再限制为单个 `currentSource`
- ✅ 不需要轮询：`pushPCM` 主动触发调度，移除 `_pollForNextAudio`

#### 修复3: GainNode 采样级精确淡出（防爆音）

**文件**: `index.html` — `_scheduleEndFadeout` 方法

当 `finish()` 被调用且所有 buffer 已调度完毕时：
1. 找到最后一个 buffer 的结束时间 `lastEnd`
2. 在 `lastEnd - 25ms` 处设 `gain = 1.0`
3. 在 `lastEnd` 处 `gain = 0`（线性渐变）
4. 使用 `cancelScheduledValues` 确保不与之前的自动化冲突

```javascript
_scheduleEndFadeout() {
    const now = this.audioContext.currentTime;
    this.scheduledRanges = this.scheduledRanges.filter(r => r.end > now);
    if (this.scheduledRanges.length === 0) return;

    const lastEnd = this.scheduledRanges[this.scheduledRanges.length - 1].end;
    if (lastEnd <= now) return;

    const fadeDuration = 0.025;
    const fadeStart = Math.max(now, lastEnd - fadeDuration);
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(1.0, fadeStart);
    this.gainNode.gain.linearRampToValueAtTime(0, lastEnd);
}
```

**安全检查**:
- `scheduledRanges` 为空 → 不淡出（没有音频可淡出）
- `lastEnd <= now` → 不淡出（音频已播完）
- 只在 `finish()` 且所有 buffer 已调度后才触发

#### 修复4: destroy() 安全关闭（防爆音）

中断播放时先做 gain ramp 再 stop，防止硬切爆音：

```javascript
destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this.gainNode && this.audioContext) {
        const now = this.audioContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
        const ctx = this.audioContext;
        const sources = [...this.activeSources];
        setTimeout(() => {
            for (const src of sources) try { src.stop(); } catch (e) {}
            try { ctx.close(); } catch (e) {}
        }, 60);
    }
}
```

#### 修复5: 方言状态不持久化

**文件**: `index.html`

`state.dialect` 保持为 `null` 初始化（不从 localStorage 读取），`handleDialectSwitch` 不写 localStorage。方言状态仅在当前会话有效，页面刷新即重置为普通话。

这与 `index-enhanced.html` 的行为不同（增强版会持久化方言），但主页面保持无持久化更符合预期——重启服务后应回到普通话。

### 修改文件清单

| 文件 | 改动 |
|------|------|
| `services/mimo_tts.js` | `emitPcm` 极简化，移除所有音频处理层；`end` 事件处理残留 SSE 数据 |
| `index.html` | `PCMAudioPlayer` 架构重写：主动调度、多源并行、GainNode 淡出、安全 destroy |
| `index.html` | `state.dialect` 不持久化，`handleDialectSwitch` 不写 localStorage |

### 失败方案记录（避免重蹈覆辙）

| 方案 | 问题 | 结果 |
|------|------|------|
| 后端 LPF 低通滤波 | 相位失真累积，杂音随时间加重 | ❌ 已移除 |
| 后端 fadeOut ramp | 从 lastSample 生成纯直流信号，"嗡"声杂音 | ❌ 已移除 |
| 后端 tail buffer 持留 | 延迟发送音频，播放延迟增加 | ❌ 已移除 |
| 后端 crossfade | API 返回的数据本身连续，crossfade 反而制造不连续 | ❌ 已移除 |
| 前端 `_scheduleEndFadeout` 在 `finish()` 时调用 | 队列中还有未调度音频时立即静音 | ❌ 改为调度完所有 buffer 后再调用 |
| 前端 PCM 数据上做 fadeOut | 有 `outputLength/4` 限制，实际 fadeOut 远比预期短 | ❌ 改用 GainNode |
| 前端 `destroy()` 立即 stop | 中断时硬切产生爆音 | ❌ 改为 gain ramp + 延迟 stop |
| 前端被动等待式调度 | buffer 间 5ms+ 静音间隙 → 电流声 | ❌ 改为主动调度式 |
| 方言 localStorage 持久化 | 重启后仍保持旧方言 | ❌ 不持久化 |

### 当前架构原则

1. **后端只做透传**：TTS API 返回的 PCM 数据是干净的，不做任何后处理
2. **前端主动调度**：buffer 到达时立即调度到上一个 buffer 结束时间之后，消除间隙
3. **GainNode 做淡出**：使用 Web Audio API 的采样级精确自动化，不在 PCM 数据上修改
4. **安全关闭**：中断播放时先 gain ramp 再 stop，防止硬切爆音
5. **最少处理**：只做必要的保护（开头 3ms fadeIn + 结尾 25ms GainNode fadeOut），不做多余处理

---

## 注意事项

- **[2026-05-19 更新]** 后端 `emitPcm` 必须只做透传，禁止对 PCM 数据做任何变换（LPF/fadeIn/fadeOut/crossfade/DC移除/softLimit）
- **[2026-05-19 更新]** 前端 `PCMAudioPlayer` 必须使用主动调度架构（`_scheduleQueued`），禁止回退到被动等待式（`onended` + `setTimeout`）
- **[2026-05-19 更新]** 结尾淡出必须使用 GainNode `linearRampToValueAtTime`，禁止在 PCM 数据上做 fadeOut
- **[2026-05-19 更新]** `destroy()` 必须先 gain ramp 再延迟 stop，禁止立即 `source.stop()`
- **[2026-05-19 更新]** 方言状态 `state.dialect` 不持久化到 localStorage，页面刷新重置为普通话
- 不要修改 `smoothPcm16` 的 `softLimit` 逻辑，这是消除高音尖峰的关键
- 不要对中间chunk施加fadeIn/fadeOut，这会导致顿挫感
- 不要逐句提取emotion，这会导致同一段语音出现不同音色
- 前端 pcmBytesToFloat32 必须使用 buffer.slice() 创建独立副本
- **新增**: PCMAudioPlayer的主动调度策略是消除间隙杂音的核心，不要回退到被动等待式
- **新增**: `emitPcm` 必须只做透传+字节对齐，禁止添加任何音频处理层
- **新增**: `cleanForDisplay` 和 `cleanForTTS` 分别处理显示和语音，不要混用

