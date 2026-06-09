/**
 * 使用 JSDoc 为现有 JavaScript 代码添加类型注解示例
 * 这是渐进式迁移到 TypeScript 的第一步
 */

// ==================== 导入类型 ==================

/**
 * @typedef {import('../types').ChatRequest} ChatRequest
 * @typedef {import('../types').ChatResponse} ChatResponse
 * @typedef {import('../types').LLMMessage} LLMMessage
 * @typedef {import('../types').TTSOptions} TTSOptions
 */

// =============== 函数类型注解示例 ==================

/**
 * 处理文本聊天请求
 * @param {string} message - 用户消息
 * @param {string} [personality='normal'] - 人格模式
 * @returns {Promise<ChatResponse>} 聊天响应
 * @throws {Error} 当消息为空时抛出错误
 */
async function handleTextChat(message, personality = 'normal') {
  // 实现...
}

/**
 * 生成 LLM 回复
 * @param {string} userMessage - 用户消息
 * @param {string} context - 上下文
 * @param {LLMMessage[]} [history] - 对话历史
 * @returns {Promise<string | import('../types').LLMResponse>} LLM 响应
 */
async function generateReply(userMessage, context, history) {
  // 实现...
}

/**
 * 文本转语音
 * @param {string} text - 要转换的文本
 * @param {TTSOptions} [options] - TTS 选项
 * @returns {Promise<import('../types').TTSResult>} TTS 结果
 */
async function textToSpeech(text, options = {}) {
  // 实现...
}

// ============== 类型守卫示例 =================

/**
 * 检查是否为有效的情绪
 * @param {string} emotion - 情绪字符串
 * @returns {boolean} 是否为有效情绪
 */
function isValidEmotion(emotion) {
  const validEmotions = ['开心', '悲伤', '生气', '惊讶', '温柔', '调皮'];
  return validEmotions.includes(emotion);
}

/**
 * 检查是否为 LLM 响应对象
 * @param {any} response - 响应对象
 * @returns {response is import('../types').LLMResponse} 类型守卫
 */
function isLLMResponse(response) {
  return (
    typeof response === 'object' &&
    response !== null &&
    'content' in response
  );
}

// ========== 配置对象类型注解 ================

/**
 * @type {import('../types').AudioConfig}
 */
const audioConfig = {
  sampleRate: 24000,
  format: 'pcm16',
  encoding: 'utf-8'
};

/**
 * @type {import('../types').LLMConfig}
 */
const llmConfig = {
  defaultModel: 'mimo-v2.5',
  temperature: 0.85,
  topP: 0.95,
  presencePenalty: 0.2,
  frequencyPenalty: 0.2,
  timeout: {
    'mimo-v2.5': 30000,
    'default': 15000
  },
  streamTimeout: 15000,
  thinking: {
    type: 'disabled'
  }
};

// ==================== Express 路由类型注解 ====================

/**
 * 健康检查路由
 * @param {import('express').Request} req - Express 请求对象
 * @param {import('express').Response} res - Express 响应对象
 * @returns {void}
 */
function healthCheck(req, res) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
}

/**
 * 文本聊天路由
 * @param {import('express').Request<{}, {}, ChatRequest>} req - Express 请求对象
 * @param {import('express').Response<ChatResponse>} res - Express 响应对象
 * @returns {Promise<void>}
 */
async function chatRoute(req, res) {
  const { message, personality } = req.body;
  const response = await handleTextChat(message, personality);
  res.json(response);
}

// ==================== 类类型注解示例 ===========

/**
 * 背压控制器类
 */
class BackpressureController {
  /**
   * @param {import('express').Response} res - Express 响应对象
   * @param {import('../types').BackpressureConfig} config - 背压配置
   */
  constructor(res, config) {
    /** @type {import('express').Response} */
    this.res = res;

    /** @type {import('../types').BackpressureConfig} */
    this.config = config;

    /** @type {Array<{event: string, data: any}>} */
    this.queue = [];

    /** @type {boolean} */
    this.isPaused = false;
  }

  /**
   * 发送 SSE 事件
   * @param {import('../types').SSEEventType} event - 事件类型
   * @param {any} data - 事件数据
   * @returns {Promise<void>}
   */
  async sendSSE(event, data) {
    // 实现...
  }

  /**
   * 刷新队列
   * @returns {Promise<void>}
   */
  async flush() {
    // 实现...
  }
}

// ============== 导出 ============

module.exports = {
  handleTextChat,
  generateReply,
  textToSpeech,
  isValidEmotion,
  isLLMResponse,
  BackpressureController
};
