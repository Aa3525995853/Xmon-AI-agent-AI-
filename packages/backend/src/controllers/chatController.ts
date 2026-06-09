/**
 * 聊天业务逻辑控制器
 * 处理聊天相关的核心业务逻辑
 */

import { Request, Response } from "express";
import { ChatRequest, ChatResponse } from "../types";
import { generateReply, generateReplyWithStyle } from "../services/llm_service";
import * as textProcessor from "../utils/textProcessor";
import {
  DEFAULT_RESPONSE,
  INTENT_TYPES,
  ERROR_MESSAGES,
} from "../config/chatConfig";

// 导入 CommonJS 模块（暂时使用 require）
const textCleaner = require("../services/text_cleaner");
const systemControl = require("../services/system_control");
const memoryService = require("../services/memory_service");

/**
 * 系统控制结果
 */
interface SystemControlHandleResult {
  handled: boolean;
  type?: string;
  result?: any;
}

/**
 * 尝试系统控制
 */
async function trySystemControl(
  message: string,
): Promise<SystemControlHandleResult> {
  // 简化实现：检查是否包含系统控制关键词
  const controlKeywords = ["打开", "启动", "搜索", "播放"];
  const hasControlIntent = controlKeywords.some((kw) => message.includes(kw));

  if (!hasControlIntent) {
    return { handled: false };
  }

  // 这里应该调用 systemControl 服务
  // 简化实现，返回未处理
  return { handled: false };
}

/**
 * 处理文本聊天请求
 */
export async function handleTextChat(message: string): Promise<ChatResponse> {
  if (!message) {
    throw new Error(ERROR_MESSAGES.EMPTY_MESSAGE);
  }

  console.log(`[主人说]: ${message}`);

  // 1. 系统控制拦截
  const controlResult = await trySystemControl(message);

  if (controlResult.handled) {
    console.log(`[系统控制] 已处理，类型：${controlResult.type}`);
    const cleanControlMessage =
      textCleaner.clean(controlResult.result.message) ||
      controlResult.result.message;
    const relationship = memoryService.getFullState().relationship;

    return {
      message: cleanControlMessage,
      emotion: DEFAULT_RESPONSE.emotion,
      speech_rate: DEFAULT_RESPONSE.speechRate,
      volume: DEFAULT_RESPONSE.volume,
      action: DEFAULT_RESPONSE.action,
      relationship: {
        stage: relationship.relationshipStage,
        intimacy: relationship.intimacy,
        trust: relationship.trust,
      },
    };
  }

  // 2. 意图识别
  const intent = textProcessor.detectIntent(message);
  console.log(
    `[意图识别]: ${intent === "coding" ? "📝 写代码" : "💬 日常闲聊"}`,
  );

  // 3. LLM 生成回复
  let llmResponse;
  if (intent === "coding") {
    llmResponse = await generateReplyWithStyle(message, "coding", null);
  } else {
    llmResponse = await generateReply(message, message, null);
  }

  // 4. 处理结构化返回格式
  let replyText = "";
  let emotion = DEFAULT_RESPONSE.emotion;
  let speechRate = DEFAULT_RESPONSE.speechRate;
  let volume = DEFAULT_RESPONSE.volume;
  let action = DEFAULT_RESPONSE.action;
  let silence = false;

  if (typeof llmResponse === "object" && llmResponse.content) {
    replyText = llmResponse.content;
    emotion = llmResponse.emotion || emotion;
    speechRate = llmResponse.speech_rate || speechRate;
    volume = llmResponse.volume || volume;
    action = llmResponse.action || action;
    silence = llmResponse.silence || false;
  } else if (typeof llmResponse === "string") {
    replyText = llmResponse;
  }

  // 5. 文本清洗
  const cleanedText = textCleaner.cleanForDisplay(replyText);
  console.log(`[小梦说]: ${cleanedText}`);

  // 6. 获取关系状态
  const relationship = memoryService.getFullState().relationship;

  return {
    message: cleanedText,
    ttsText: textCleaner.cleanForTTS(replyText),
    emotion,
    speech_rate: speechRate,
    volume,
    action,
    silence,
    relationship: {
      stage: relationship.relationshipStage,
      intimacy: relationship.intimacy,
      trust: relationship.trust,
    },
  };
}

/**
 * 文本聊天路由处理器
 */
export async function chatRoute(
  req: Request<{}, {}, ChatRequest>,
  res: Response<ChatResponse>,
): Promise<void> {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({
        message: ERROR_MESSAGES.EMPTY_MESSAGE,
        emotion: "calm",
        speech_rate: 0.9,
        volume: 0.7,
        action: "none",
      } as ChatResponse);
      return;
    }

    const response = await handleTextChat(message);
    res.json(response);
  } catch (error) {
    const err = error as Error;
    console.error("[聊天控制器] 错误:", err);
    res.status(500).json({
      message: "抱歉，我遇到了一些问题...",
      emotion: "calm",
      speech_rate: 0.9,
      volume: 0.7,
      action: "none",
    } as ChatResponse);
  }
}

/**
 * 语音聊天路由处理器
 */
export async function voiceChatRoute(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({
        error: ERROR_MESSAGES.AUDIO_REQUIRED,
      });
      return;
    }

    // 这里应该调用 ASR 服务将音频转文本
    // 然后调用 handleTextChat 处理
    // 简化实现
    res.status(501).json({
      error: "语音聊天功能正在开发中",
    });
  } catch (error) {
    const err = error as Error;
    console.error("[语音聊天控制器] 错误:", err);
    res.status(500).json({
      error: "语音处理失败",
    });
  }
}
