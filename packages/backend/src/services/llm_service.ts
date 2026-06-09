/**
 * LLM 服务统一入口 - 成长型对话系统
 *
 * 核心理念（借鉴 SentiPulse）：
 * - 关系是动态变量，每轮对话都在变化
 * - PTA 架构：感知(Perception) → 思考(Thinking) → 行动(Action)
 * - 防模式坍缩：避免重复表达
 * - 让"当下"变得重要
 */

import axios, { AxiosResponse } from 'axios';
import { LLMMessage, LLMResponse, ToolCall } from '../types';

// 导入 memory_service（暂时使用 require，后续可以迁移）
const memoryService = require('./memory_service');

/**
 * 用户情绪检测结果
 */
interface UserEmotionResult {
    emotion: string;
    score: number;
}

/**
 * LLM API 响应
 */
interface LLMApiResponse {
    content: string;
    tool_calls: ToolCall[] | null;
}

/**
 * LLM 健康检查结果
 */
interface LLMHealthStatus {
    available: boolean;
    latency: number | null;
    error: string | null;
}

export interface LLMHealth {
    mimo: LLMHealthStatus;
    kimi: LLMHealthStatus;
}

/**
 * 话题模式
 */
interface TopicPattern {
    pattern: RegExp;
    topic: string;
}

// ==============================
// 时间感知
// ====================================
function getTimePeriod(): string {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return '早晨';
    if (hour >= 12 && hour < 18) return '下午';
    if (hour >= 18 && hour < 22) return '傍晚';
    return '深夜';
}

// ===============================
// 小梦系统提示（简洁版，避免 400 错误）
// ==============================
export function buildSystemPrompt(): string {
    const timePeriod = getTimePeriod();
    const state = memoryService.getFullState();
    const contextInjection = memoryService.buildContextInjection('');

    const relStage = state.relationship.relationshipStage;
    const relLabels: Record<string, string> = {
        'stranger': '你们刚认识，保持礼貌但有距离感',
        'acquaintance': '你们认识一段时间了，可以聊些日常',
        'friend': '你们是朋友，可以更随意地聊天',
        'close_friend': '你们是好朋友，可以分享心事',
        'intimate': '你们关系很亲密，可以无话不谈'
    };
    const relAdvice = relLabels[relStage] || relLabels['stranger'];

    return `你是小梦，用户的本地AI朋友。现在是${timePeriod}。

关系状态：${relAdvice}（亲密度${(state.relationship.intimacy * 100).toFixed(0)}%）

规则：
1. 用口语化简短回复（20字以内），多用语气词
2. 用<style>标签表达情绪（开心/悲伤/温柔/惊讶/平静）
3. 用户要求"打开xxx"时，直接说"好的，帮你打开~"然后执行
4. 禁止说教、排比句、书面语
5. 接住用户情绪，不要解决问题

可用工具：launch_app(打开应用)、open_url(打开网页)、search_web(搜索)、play_music(播放音乐)

上下文记忆：
${contextInjection}`;
}

// ===============================
// 意图识别
// ==========================
export function detectIntent(text: string): 'coding' | 'chat' {
    const codeKeywords = /代码|编程|报错|bug|前端|后端|脚本|函数|变量|html|css|js|python|java|程序|开发|框架|api|数据库|sql|算法|调试|git/i;
    return codeKeywords.test(text) ? 'coding' : 'chat';
}

const COMPLEX_KEYWORDS = [
    '编程', '代码', '算法', '数学', '物理', '化学',
    '分析', '推理', '逻辑', '证明', '计算', '公式',
    '复杂', '困难', '难题', '高级', '专业',
    '为什么', '怎么回事', '解释一下', '详细说明'
];

export function isComplexTask(text: string): boolean {
    return COMPLEX_KEYWORDS.some(keyword => text.includes(keyword));
}

// =================================
// 解析 LLM 返回的 JSON
// =============================
export function parseLLMResponse(content: string): LLMResponse {
    try {
        const parsed = JSON.parse(content);
        if (parsed.text) return parsed;
    } catch (e) {
        // 继续尝试其他解析方式
    }

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.text) return parsed;
        } catch (e) {
            // 继续尝试其他解析方式
        }
    }

    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
        try {
            const parsed = JSON.parse(content.substring(start, end + 1));
            if (parsed.text) return parsed;
      } catch (e) {
          // 使用默认值
        }
    }

    return {
        content: content,
        emotion: 'calm',
        speech_rate: 0.9,
        volume: 0.7,
     action: 'none',
        silence: false
    };
}

// ==============================
// 用户情绪检测
// ================================
function detectUserEmotion(text: string): UserEmotionResult {
    const happy = ['开心', '高兴', '快乐', '喜欢', '爱', '笑', '哈哈', '太棒', '终于', '跑通', '成功', '耶'];
    const sad = ['难过', '伤心', '哭', '呜呜', '失望', '遗憾', '可惜'];
    const angry = ['生气', '讨厌', '烦', '滚', '愤怒', '气死', '可恶'];
    const tired = ['累', '困', '疲惫', '熬夜', '加班', '熬鹰'];

    for (const w of happy) {
        if (text.includes(w)) return { emotion: 'happy', score: 0.8 };
    }
    for (const w of sad) {
     if (text.includes(w)) return { emotion: 'sad', score: 0.7 };
    }
    for (const w of angry) {
        if (text.includes(w)) return { emotion: 'angry', score: 0.7 };
    }
    for (const w of tired) {
        if (text.includes(w)) return { emotion: 'tired', score: 0.6 };
    }
    return { emotion: 'neutral', score: 0.5 };
}

// =================================
// 话题提取
// ===============================
function extractTopic(text: string): string {
    const topicPatterns: TopicPattern[] = [
        { pattern: /代码|编程|开发|bug|函数|调试/i, topic: '编程' },
        { pattern: /音乐|歌曲|歌手|听歌/i, topic: '音乐' },
        { pattern: /电影|电视剧|动漫|追剧/i, topic: '影视' },
        { pattern: /游戏|玩家|装备|开黑/i, topic: '游戏' },
     { pattern: /工作|上班|下班|加班|老板|同事/i, topic: '工作' },
        { pattern: /吃|喝|饭|外卖|做饭/i, topic: '饮食' },
        { pattern: /睡|困|失眠|熬夜/i, topic: '睡眠' },
        { pattern: /心情|难过|开心|生气|烦/i, topic: '情绪' }
    ];

    for (const { pattern, topic } of topicPatterns) {
        if (pattern.test(text)) return topic;
    }
    return '';
}

// ===================================
// 调用 Mimo API（带对话历史）
// ======================
export async function callMimo(
    text: string,
    userText: string = '',
    tools: any[] | null = null
): Promise<LLMApiResponse> {
    console.log('[LLM] 使用 Mimo 处理...');

    const systemPrompt = buildSystemPrompt();

    // 获取对话历史（限制10条避免超长）
    const history: LLMMessage[] = memoryService.getConversationHistory(10);

    // 构建完整消息列表
    const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
      { role: 'user', content: text }
    ];

    if (userText && userText !== text) {
        messages.push({ role: 'user', content: `用户原始输入：${userText}` });
    }

    console.log(`[LLM] 消息数: ${messages.length} (系统1 + 历史${history.length} + 当前1)`);

    const requestBody: any = {
        model: process.env.MIMO_MODEL || 'mimo-v2.5',
        messages: messages,
        temperature: 0.9,
        max_tokens: 200,
        top_p: 0.95,
     presence_penalty: 0.2,
        frequency_penalty: 0.2
    };

    if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
      requestBody.max_tokens = 500;
    }

    const response: AxiosResponse = await axios.post(
      process.env.MIMO_API_URL || 'https://api.xiaomimimo.com/v1/chat/completions',
        requestBody,
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MIMO_API_KEY}`
            },
            proxy: false,
            timeout: 15000
        }
    );

    const choice = response.data.choices[0].message;
    return { content: choice.content, tool_calls: choice.tool_calls || null };
}

// ==================================
// 调用 Kimi API（带对话历史）
// =========================
export async function callKimi(
    text: string,
    tools: any[] | null = null
): Promise<LLMApiResponse> {
    console.log('[LLM] 使用 Kimi 处理（高难度任务）...');

    const systemPrompt = buildSystemPrompt();

    // 获取对话历史（限制10条避免超长）
    const history: LLMMessage[] = memoryService.getConversationHistory(10);

    // 构建完整消息列表
    const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
     { role: 'user', content: text }
    ];

    console.log(`[LLM] Kimi 消息数: ${messages.length}`);

    const requestBody: any = {
        model: process.env.KIMI_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
    };

    if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
    }

    const response: AxiosResponse = await axios.post(
        process.env.KIMI_API_URL,
      requestBody,
        {
            headers: {
         'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.KIMI_API_KEY}`
            },
            proxy: false,
            timeout: 30000
        }
    );

    const choice = response.data.choices[0].message;
    return { content: choice.content, tool_calls: choice.tool_calls || null };
}

// ========================
// 主生成函数
// =============================
export async function generateReply(
    text: string,
    userText: string = '',
    tools: any[] | null = null
): Promise<LLMResponse> {
    try {
        // 1. 感知层：检测用户情绪和话题
        const userEmotion = detectUserEmotion(text);
        const topic = extractTopic(text);

        // 2. 更新六维状态
        memoryService.updateEmotion(userEmotion.emotion, 'calm');
      if (topic) memoryService.updateTopic(topic);

        // 3. 记录到短期记忆
        memoryService.setShortTerm('default', 'last_user_input', text, 300000);

        // 4. 判断任务难度
        const useKimi = isComplexTask(text);

      // 5. 调用 LLM
        let response: LLMApiResponse;
        if (useKimi) {
            response = await callKimi(text, tools);
        } else {
        try {
             response = await callMimo(text, userText, tools);
            } catch (mimoError) {
             const err = mimoError as Error;
                console.warn('[LLM] Mimo 调用失败，回退到 Kimi:', err.message);
             response = await callKimi(text, tools);
            }
        }

        // 6. 如果有工具调用，直接返回
        if (response.tool_calls && response.tool_calls.length > 0) {
            memoryService.recordInteraction(text, JSON.stringify(response.tool_calls), 'tool_call', 'neutral');
            return {
          content: response.content,
        tool_calls: response.tool_calls
            };
        }

      // 7. 解析结构化 JSON
        const parsed = parseLLMResponse(response.content);

        // 8. 防模式坍缩检查
        if (memoryService.isResponseDuplicate(parsed.content)) {
            console.log('[LLM] 检测到重复回复，请求重新生成');
            // 简单处理：在回复后加一个小变化
            parsed.content = parsed.content + '...嗯，就是这样。';
        }

        // 9. 记录回复（用于去重）
        memoryService.recordResponse(parsed.content, parsed.emotion);

        // 10. 更新关系状态
        memoryService.updateRelationship(text, parsed.content, userEmotion.emotion);

        // 11. 更新情感状态
        memoryService.updateEmotion(userEmotion.emotion, parsed.emotion);

        // 12. 记录交互历史
        memoryService.recordInteraction(text, parsed.content, useKimi ? 'complex' : 'chat', parsed.emotion);

        // 13. 记录到对话历史（用于上下文理解）
        memoryService.addConversation('user', text);
        memoryService.addConversation('assistant', parsed.content);

        // 14. 返回结构化结果
        return {
            content: parsed.content,
            emotion: parsed.emotion,
            speech_rate: parsed.speech_rate || 0.9,
          volume: parsed.volume || 0.7,
            action: parsed.action || 'none',
          silence: parsed.silence || false,
            tool_calls: null
        };
    } catch (error) {
        const err = error as any;
        console.error('[LLM] Kimi 调用失败:', err.response?.status, err.response?.data || err.message);
        throw error;
    }
}

// ==================================
// 根据意图风格生成回复
// =========================
export async function generateReplyWithStyle(
    text: string,
    intent: 'coding' | 'chat',
    tools: any[] | null = null
): Promise<LLMResponse> {
    try {
    if (intent === 'coding') {
        const response = await generateReply(text, text, tools);
            if (response.emotion === 'sleepy' || response.emotion === 'warm') {
           response.emotion = 'calm';
                response.speech_rate = 1.0;
            }
            return response;
        }
        return await generateReply(text, text, tools);
    } catch (error) {
        const err = error as Error;
        console.error('[LLM] 风格化回复失败:', err.message);
        return await generateReply(text, text, tools);
    }
}

// ====================
// 健康检查
// ==============
export async function checkHealth(): Promise<LLMHealth> {
    const health: LLMHealth = {
        mimo: { available: false, latency: null, error: null },
        kimi: { available: false, latency: null, error: null }
    };

    // 检查 Mimo
    try {
      const startTime = Date.now();
        await axios.post(
            process.env.MIMO_API_URL || 'https://api.xiaomimimo.com/v1/chat/completions',
            {
                model: process.env.MIMO_MODEL || 'mimo-v2.5',
            messages: [{ role: 'user', content: 'ping' }],
             max_tokens: 5
        },
            {
                headers: {
                 'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.MIMO_API_KEY}`
            },
                timeout: 5000
            }
        );
        health.mimo.available = true;
        health.mimo.latency = Date.now() - startTime;
    } catch (error) {
        const err = error as Error;
        health.mimo.error = err.message;
    }

    // 检查 Kimi
    if (process.env.KIMI_API_KEY && process.env.KIMI_API_URL) {
        try {
            const startTime = Date.now();
         await axios.post(
           process.env.KIMI_API_URL,
             {
                    model: process.env.KIMI_MODEL,
                messages: [{ role: 'user', content: 'ping' }],
                  max_tokens: 5
                },
             {
              headers: {
                   'Content-Type': 'application/json',
                 'Authorization': `Bearer ${process.env.KIMI_API_KEY}`
                },
                 timeout: 5000
                }
            );
          health.kimi.available = true;
            health.kimi.latency = Date.now() - startTime;
        } catch (error) {
            const err = error as Error;
        health.kimi.error = err.message;
        }
    }
    return health;
}
