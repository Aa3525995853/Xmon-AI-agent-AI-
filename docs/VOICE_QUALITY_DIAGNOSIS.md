# 语音质量问题诊断报告

## 问题描述
- **用户反馈**: 电流声杂音 + 结尾爆音 + 音频截断 + 方言未重置
- **时间**: 2026-05-19
- **状态**: 已修复，详见 TTS_TUNE_LOG.md

## 根因总结

| 问题 | 根因 | 修复 |
|------|------|------|
| 电流声/杂音 | 前端被动等待式调度，buffer间5ms+静音间隙 | 改为主动调度式架构 |
| 杂音随时间加重 | 后端LPF低通滤波器相位失真累积 | 移除所有后端音频处理 |
| 结尾爆音 | destroy()立即stop硬切 + _scheduleEndFadeout时序错误 | gain ramp + 延迟stop |
| 音频截断 | _scheduleEndFadeout在finish()时立即静音GainNode | 只在所有buffer调度完后才触发淡出 |
| 方言未重置 | state.dialect不持久化，但handleDialectSwitch也不写localStorage | 保持不持久化，重启即普通话 |

## 当前架构

```
TTS API → 后端透传(只做字节对齐) → SSE → 前端主动调度(无缝衔接) → GainNode淡出(防爆音)
```

## 详细记录

详见 TTS_TUNE_LOG.md "版本: 2026-05-19 音质修复 — 架构级重构" 章节
