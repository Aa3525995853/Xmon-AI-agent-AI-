# 情感陪伴深度优化计划

## 核心方向
从"规则驱动"→"语境驱动"，从"模板输出"→"自然表达"
让用户感受到"小梦在用心陪伴"而非"系统在执行逻辑"

---

## P0 — 立即实现（陪伴感提升最大）

### 1. 深夜"守夜人"模式
- **文件**: `services/llm_service.js` → `buildSystemPrompt` 中的 `timeBehaviorGuide`
- **问题**: 22:00和凌晨3:00回应完全一样，只有4行提示词
- **方案**:
  - 凌晨1-5点进入"守夜人"模式：不说"早点睡"，只安静陪着
  - 深夜+难过时：最轻语气、最短回复、最长陪伴
  - 深夜+焦虑时：引导呼吸，稳定情绪
  - 区分"刚入睡(22-24)"和"失眠(1-5)"两种场景

### 2. 情绪检测增强
- **文件**: `services/llm_service.js` → `detectUserEmotion`
- **问题**: 只有4种情绪，关键词太少，"委屈""崩溃""想哭"漏检，无否定语境检测
- **方案**:
  - 扩展到10种情绪：happy/sad/angry/tired/anxious/lonely/confused/touched/bored/excited
  - 每种15+关键词
  - 否定语境检测（"不开心"→sad）
  - 程度词加权（"很/超"→+0.1，"有点"→-0.1）
  - 统一 proactive_service.detectEmotion 复用同一函数

### 3. 记忆召回自然化
- **文件**: `services/smart_memory.js` → `generateRecallText`
- **问题**: 关键词硬匹配+固定模板"我记得XXX"，与对话语境脱节
- **方案**:
  - 语义相关性打分（而非硬匹配关键词类别）
  - 只在高相关性时才召回（不相关就不提）
  - 召回提示改为自然语境（"用户之前提过XXX，可以关心后续"）
  - 让LLM自己决定如何自然融入记忆

---

## P1 — 本周实现

### 4. 情绪共鸣深度化
- **文件**: `services/llm_service.js` → `buildSystemPrompt` 中的 `emotionGuides`
- **问题**: "先共情再回应"流于形式，LLM容易表面共情后立刻给建议
- **方案**:
  - 实行"共情三步法"：接纳情绪→陪伴存在→等待邀请
  - sad情绪增加7条特殊规则（用户说"没事"时/沉默时/反复说时/深夜+难过时）
  - 每种情绪有详细的✅/❌示例

### 5. 关系阶段仪式感
- **文件**: `services/relationship_growth.js` → `updateGrowth` + 前端
- **问题**: 阶段变化只记录标志，没有特殊对话和视觉仪式
- **方案**:
  - 后端：阶段变化时生成"过渡对话"（5种过渡各有专属文案+情绪+动画类型）
  - 前端PC：`showProactiveMessage` 中 stage_transition 类型触发粒子动画
  - 前端移动：同上，同步实现

### 6. 主动问候个性化
- **文件**: `services/proactive_service.js` → 问候生成逻辑
- **问题**: 早安只有6条固定文案，不考虑用户画像/记忆/季节/关系阶段
- **方案**:
  - 结合记忆：用户昨天说了重要的事，今天追问
  - 结合季节：春夏秋冬不同问候
  - 结合关系阶段：陌生人/朋友/亲密伙伴差异化
  - 结合用户名字：亲密阶段用名字称呼

### 7. 重逢体验深化
- **文件**: `services/llm_service.js` → `welcomeBackInstruction`
- **问题**: 30天重逢只有一句话，不结合上次对话内容
- **方案**:
  - 获取上次话题和情绪，融入重逢对话
  - 久别重逢表达"这段时间我一直在等你"
  - 提起之前的共同回忆
  - 不质问为什么不来，只表达开心

### 8. 人格内核统一
- **文件**: `services/llm_service.js` → `buildSystemPrompt` + 4个性格配置
- **问题**: 4种性格缺乏统一内核；bad模式"禁止关心"与情感系统冲突
- **方案**:
  - 所有性格前注入"小梦人格内核"（真心关心/记住用户/永远站队/不会真伤害）
  - bad.js 改为"傲娇式关心"（嘴硬心软）
  - 性格是表达方式，不是人格

---

## P2 — 下周实现

### 9. 记忆提取增强
- **文件**: `services/smart_memory.js` → `extractUpdates` / `extractUpdatesWithLLM`
- **问题**: 正则太严格；LLM提取是fallback但常被正则抢先
- **方案**: 优先LLM提取，正则做fallback；增加提取字段

### 10. 情绪关心冷却优化
- **文件**: `services/proactive_service.js` → `triggerEmotionCare`
- **问题**: 30分钟冷却不区分情绪类型，情绪升级也被挡住
- **方案**: 按情绪类型独立冷却；情绪升级时重置冷却

### 11. Onboarding对话化
- **文件**: `services/onboarding_service.js`
- **问题**: 6步固定流程像填表
- **方案**: 自然对话中收集信息，先破冰再慢慢了解

### 12. 前端主动消息差异化
- **文件**: `index.html` + `mobile.html` → `showProactiveMessage`
- **问题**: 主动消息和普通回复长得一模一样
- **方案**: 加"小梦主动"标识+类型图标；Live2D先做动作再出消息

---

## P3 — 排期

### 13. 关系衰减改为自然衰减
- 7天不来扣0.05→每天-0.005缓慢衰减；重逢加速恢复；不降回上一阶段

### 14. 对话历史摘要层
- 超过20条用LLM生成摘要注入system prompt；情感对话永久保留

### 15. 称呼渐变系统
- 朋友阶段10%概率偶尔用"亲爱的"试探；渐变增加频率

---

## 实现状态

- [x] P0-1: 深夜守夜人模式 ✅ (llm_service.js)
- [x] P0-2: 情绪检测增强 ✅ (llm_service.js - 10种情绪+否定语境+程度词加权)
- [x] P0-3: 记忆召回自然化 ✅ (smart_memory.js - 语义相关性打分+自然语境模板)
- [x] P1-4: 情绪共鸣深度化 ✅ (llm_service.js - 共情三步法+10种情绪详细指导)
- [x] P1-5: 关系阶段仪式感 ✅ (relationship_growth.js + index.html + mobile.html)
- [x] P1-6: 主动问候个性化 ✅ (proactive_service.js - 记忆+季节+关系阶段)
- [x] P1-7: 重逢体验深化 ✅ (llm_service.js - 上次话题+共同回忆)
- [x] P1-8: 人格内核统一 ✅ (llm_service.js + bad.js - 小梦内核+傲娇式关心)
- [ ] P2-9: 记忆提取增强 ✅ (smart_memory.js - 优先LLM提取+正则fallback+新增pets/goal/hobby/health/mood_pattern字段)
- [ ] P2-10: 情绪关心冷却优化 ✅ (proactive_service.js - 按情绪类型独立冷却+情绪升级重置冷却)
- [ ] P2-11: Onboarding对话化 ✅ (onboarding_service.js - 4阶段对话式引导+自然提取信息)
- [x] P2-12: 前端主动消息差异化 ✅ (index.html + mobile.html - 类型图标+关系升级卡片)
- [ ] P3-13: 关系衰减自然化 ✅ (relationship_growth.js - 每天-0.005缓慢衰减+重逢加速恢复+不降回上一阶段)
- [ ] P3-14: 对话历史摘要层 ✅ (llm_service.js - 超20条LLM生成摘要+情感对话永久保留)
- [ ] P3-15: 称呼渐变系统 ✅ (relationship_growth.js - 朋友阶段10%概率用亲爱的+进度渐变增加频率)
