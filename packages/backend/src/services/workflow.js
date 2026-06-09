/**
 * @file workflow.js
 * @description 简化版工作流引擎，激进分流设计：闲聊直接回答、简单任务直接执行工具、复杂任务使用编排器
 * @module services/workflow
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { logger } = require('../utils/logger');

// ============================================================
// 工具注册表：系统/文件/搜索/文档工具映射
// ============================================================

/** 工具注册表，映射工具名到对应的服务模块和方法 */
const TOOL_REGISTRY = {
  // 系统工具
  'open_app': { file: 'system_control', method: 'executeTool', args: ['launch_app'] },
  'screenshot': { file: 'system_control', method: 'executeTool', args: ['take_screenshot'] },
  'search_web': { file: 'system_control', method: 'executeTool', args: ['search_web'] },
  'organize_folder': { file: 'system_control', method: 'executeTool', args: ['organize_folder'] },
  'weather': { file: 'weather_search', method: 'getCurrentWeather' },

  // 文件工具
  'read_file': { file: 'system_control', method: 'executeTool', args: ['read_file'] },
  'write_file': { file: 'system_control', method: 'executeTool', args: ['write_file'] },
  'create_folder': { file: 'system_control', method: 'executeTool', args: ['create_folder'] },

  // 搜索工具
  'search_news': { file: 'newsService', method: 'searchNews' },
  'web_search': { file: 'workBrainClient', method: 'searchAndSummarize' },

  // 文档工具
  'create_ppt': { file: 'ppt_generator', method: 'generate' },
  'create_chart': { file: 'chart_generator', method: 'generateChart' },
};

// ============================================================
// 分类模式：简单问题直接用 LLM 回答
// ============================================================

/** 简单问题匹配模式列表，匹配到这些模式直接走 LLM 回答 */
const QUICK_REPLY_PATTERNS = [
  // 代码相关
  { pattern: /看看?这段?代码.*有没有错误/, type: 'code_review' },
  { pattern: /帮我看看?代码/, type: 'code_review' },
  { pattern: /这段代码.*问题/, type: 'code_review' },
  { pattern: /帮我检查?代码/, type: 'code_review' },
  { pattern: /帮我分析?代码/, type: 'code_analysis' },

  // 解释说明类
  { pattern: /^什么是/, type: 'definition' },
  { pattern: /^.*是什么/, type: 'definition' },
  { pattern: /^为什么/, type: 'explanation' },
  { pattern: /^如何[做使用]/, type: 'howto' },
  { pattern: /^怎么[做使用]/, type: 'howto' },
  { pattern: /的区别是/, type: 'comparison' },

  // 计算类（简单）
  { pattern: /\d+\s*[\+\-\*\/]\s*\d+/, type: 'calculation' },
  { pattern: /帮我算[一一下]?/, type: 'calculation' },

  // 问答类
  { pattern: /.{0,30}[?|？]/, type: 'question' },
];

// ============================================================
// 分类模式：简单任务直接执行工具
// ============================================================

/** 简单任务匹配模式列表，匹配到这些模式直接调用对应工具 */
const FAST_TOOL_PATTERNS = [
  // 系统操作
  { pattern: /^(打开|启动|运行)\s*(.+)/, tool: 'open_app', paramExtract: (m) => ({ app_name: m[2] }) },
  { pattern: /^截图/, tool: 'screenshot', paramExtract: () => ({}) },
  { pattern: /^截屏/, tool: 'screenshot', paramExtract: () => ({}) },

  // 文件操作
  { pattern: /^新建文件夹/, tool: 'create_folder', paramExtract: () => ({ name: '新建文件夹', path: '%USERPROFILE%\\Desktop' }) },
  { pattern: /^整理\s*桌面/, tool: 'organize_folder', paramExtract: () => ({ directory: '%USERPROFILE%\\Desktop' }) },

  // 搜索
  { pattern: /^搜索?\s*(.+)/, tool: 'search_web', paramExtract: (m) => ({ query: m[1] }) },
  { pattern: /^查一下?\s*(.+)的?天气/, tool: 'weather', paramExtract: (m) => ({ location: m[1] || '本地' }) },
];

// ============================================================
// 工作流引擎类
// ============================================================

class WorkFlow {
  /**
   * @description 构造函数，初始化延迟加载标志
   */
  constructor() {
    this._initialized = false;
    this._llmService = null;
    this._taskPersistence = null;
    this._taskOrchestrator = null;
  }

  /**
   * @description 初始化工作流引擎，延迟加载依赖模块
   * @returns {Promise<void>}
   */
  async init() {
    if (this._initialized) return;

    // 延迟加载依赖
    this._llmService = require('../services/llm_service');
    this._taskPersistence = require('../services/task_persistence');
    this._taskOrchestrator = require('../services/task_orchestrator');

    await this._taskPersistence.init();

    this._initialized = true;
    console.log('[WorkFlow] 简化工作流引擎初始化完成');
  }

  /**
   * @description 主入口 - 处理用户输入，分类后路由到闲聊/简单工具/复杂任务
   * @param {string} message - 用户消息
   * @param {Object} [options={}] - 选项
   * @param {string} [options.sessionId='default'] - 会话ID
   * @param {string} [options.personality='normal'] - 人格模式
   * @param {string} [options.dialect='mandarin'] - 方言
   * @returns {Promise<Object>} 处理结果，包含 type/response/elapsed/classification
   */
  async process(message, options = {}) {
    const startTime = Date.now();
    const { sessionId = 'default', personality = 'normal', dialect = 'mandarin' } = options;

    // 1. 快速分类
    const classification = this._classify(message);
    console.log(`[WorkFlow] 分类结果: ${classification.type} (${(Date.now() - startTime)}ms)`);

    // 2. 根据类型路由
    let result;
    switch (classification.type) {
      case 'chat':
        result = await this._quickReply(message, personality, dialect);
        break;

      case 'simple_task':
        result = await this._fastTool(message, classification.tool, classification.params);
        break;

      case 'complex_task':
        result = await this._complexTask(message, options);
        break;

      default:
        result = await this._quickReply(message, personality, dialect);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[WorkFlow] 处理完成: ${classification.type} (${elapsed}ms)`);

    return {
      ...result,
      type: classification.type,
      elapsed,
      classification: classification.type
    };
  }

  /**
   * @description 分类用户输入，依次检查简单问题、简单任务、工作指令和多步骤指示
   * @param {string} message - 用户消息
   * @returns {Object} 分类结果，包含 type/reason/tool/params
   */
  _classify(message) {
    const trimmed = message.trim();

    // 1. 检查简单问题模式（快速回答）
    for (const p of QUICK_REPLY_PATTERNS) {
      if (p.pattern.test(trimmed)) {
        console.log(`[WorkFlow] 匹配简单问题模式: ${p.type}`);
        return { type: 'chat', reason: p.type };
      }
    }

    // 2. 检查简单任务模式（直接执行工具）
    for (const p of FAST_TOOL_PATTERNS) {
      const match = trimmed.match(p.pattern);
      if (match) {
        console.log(`[WorkFlow] 匹配简单任务工具: ${p.tool}`);
        return {
          type: 'simple_task',
          tool: p.tool,
          params: p.paramExtract(match)
        };
      }
    }

    // 3. 检查明确的工作指令关键词
    const taskKeywords = ['帮我', '请', '帮我把', '帮我打开', '帮我搜索', '帮我查'];
    for (const kw of taskKeywords) {
      if (trimmed.includes(kw)) {
        return { type: 'complex_task', reason: 'explicit_task' };
      }
    }

    // 4. 检查是否包含多步骤指示
    const multiStepIndicators = ['然后', '接着', '再', '顺便', '同时'];
    if (multiStepIndicators.some(ind => trimmed.includes(ind))) {
      return { type: 'complex_task', reason: 'multi_step' };
    }

    // 5. 默认走闲聊
    return { type: 'chat', reason: 'default' };
  }

  /**
   * @description 快速回复 - 直接用 LLM 回答，不启动工具
   * @param {string} message - 用户消息
   * @param {string} personality - 人格模式
   * @param {string} dialect - 方言
   * @returns {Promise<Object>} 回复结果，包含 quick/response/emotion/elapsed
   */
  async _quickReply(message, personality, dialect) {
    const startTime = Date.now();

    try {
      const response = await this._llmService.generateReply(
        message,
        message,
        null,
        personality,
        dialect
      );

      return {
        quick: true,
        response: response.content,
        emotion: response.emotion,
        speech_rate: response.speech_rate,
        elapsed: Date.now() - startTime
      };
    } catch (error) {
      logger.error('[WorkFlow] 快速回复失败:', error);
      return {
        quick: true,
        response: '抱歉，我遇到了一点问题，请再说一次~',
        elapsed: Date.now() - startTime
      };
    }
  }

  /**
   * @description 快速工具执行 - 直接调用简单工具，无需 LLM 编排
   * @param {string} message - 用户消息
   * @param {string} toolName - 工具名称
   * @param {Object} params - 工具参数
   * @returns {Promise<Object>} 执行结果，包含 quick/response/tool/result/elapsed
   */
  async _fastTool(message, toolName, params) {
    const startTime = Date.now();

    try {
      const tool = TOOL_REGISTRY[toolName];
      if (!tool) {
        return {
          quick: false,
          response: `未知的工具: ${toolName}`,
          elapsed: Date.now() - startTime
        };
      }

      // 动态加载工具模块
      const toolModule = tool.file.includes('/')
        ? require(tool.file)
        : require(`../services/${tool.file}`);

      const method = toolModule[tool.method];
      if (!method) {
        return {
          quick: false,
          response: `工具方法不存在: ${tool.method}`,
          elapsed: Date.now() - startTime
        };
      }

      // 如果有参数映射，先处理参数
      let args = params;
      if (tool.args) {
        args = tool.args.map(argName => params[argName]);
      }

      // 执行工具
      const result = await method.apply(toolModule, args);

      // 格式化响应
      const response = this._formatToolResult(toolName, result);

      return {
        quick: true,
        response,
        tool: toolName,
        result,
        elapsed: Date.now() - startTime
      };
    } catch (error) {
      logger.error(`[WorkFlow] 工具执行失败 [${toolName}]:`, error);
      return {
        quick: false,
        response: `执行 ${toolName} 时出错: ${error.message}`,
        error: error.message,
        elapsed: Date.now() - startTime
      };
    }
  }

  /**
   * @description 复杂任务 - 使用任务编排器执行多步骤任务
   * @param {string} message - 用户消息
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果，包含 quick/response/taskId/elapsed
   */
  async _complexTask(message, options) {
    const startTime = Date.now();
    const { sessionId = 'default' } = options;

    // 记录任务
    const taskId = `wf_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    this._taskPersistence.record({
      id: taskId,
      description: message,
      type: 'complex',
      status: 'running',
      createdAt: Date.now(),
      sessionId
    });

    try {
      // 使用简化的任务编排器
      const result = await this._taskOrchestrator.execute(message, {
        sessionId,
        taskId
      });

      // 更新任务状态
      this._taskPersistence.update(taskId, {
        status: 'completed',
        completedAt: Date.now(),
        result: result.response || result
      });

      return {
        quick: false,
        response: result.response || JSON.stringify(result),
        taskId,
        elapsed: Date.now() - startTime
      };
    } catch (error) {
      // 更新任务失败状态
      this._taskPersistence.update(taskId, {
        status: 'failed',
        completedAt: Date.now(),
        error: error.message
      });

      return {
        quick: false,
        response: `任务执行失败: ${error.message}`,
        taskId,
        error: error.message,
        elapsed: Date.now() - startTime
      };
    }
  }

  /**
   * @description 格式化工具执行结果为可读文本
   * @param {string} toolName - 工具名称
   * @param {Object} result - 工具执行结果
   * @returns {string} 格式化后的结果文本
   */
  _formatToolResult(toolName, result) {
    if (!result) return '执行完成，但没有返回结果';

    if (typeof result === 'string') return result;

    if (result.success === false) {
      return `执行失败: ${result.message || result.error || '未知错误'}`;
    }

    if (result.content) return result.content;
    if (result.message) return result.message;
    if (result.output) return result.output;
    if (result.response) return result.response;

    return JSON.stringify(result);
  }

  /**
   * @description 获取指定任务的状态
   * @param {string} taskId - 任务ID
   * @returns {Object|null} 任务状态
   */
  getTaskStatus(taskId) {
    return this._taskPersistence.get(taskId);
  }

  /**
   * @description 获取任务列表
   * @param {string} [filter='all'] - 过滤类型
   * @returns {Array<Object>} 任务列表
   */
  getTasks(filter = 'all') {
    return this._taskPersistence.getTasks({ filter });
  }

  /**
   * @description 获取任务统计信息
   * @returns {Object} 统计对象
   */
  getStats() {
    return this._taskPersistence.getStats();
  }
}

// 单例
const workflow = new WorkFlow();

module.exports = workflow;
module.exports.WorkFlow = WorkFlow;