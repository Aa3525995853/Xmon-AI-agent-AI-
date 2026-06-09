/**
 * @file critical_thinking.js
 * @description 批判性思维引擎，拒绝盲目迎合用户，识别迎合型/懒惰型/依赖型问题模式，
 *              给出建设性挑战和引导，促进用户独立思考
 * @module services/critical_thinking
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const memoryService = require('./memory_service');

// ============================================================
// 常量定义：批判性思维引擎的阈值和配置
// ============================================================

/** 迎合型问题检测的初始置信度 */
const ECHO_CONFIDENCE = 0.7;

/** 懒惰型问题检测的初始置信度 */
const LAZY_CONFIDENCE = 0.6;

/** 判定为懒惰型问题的最大输入长度（字符数） */
const LAZY_QUESTION_MAX_LENGTH = 15;

/** 用户偏好直接回答时，挑战置信度的衰减系数 */
const DIRECT_PREFERENCE_DECAY = 0.5;

/** 深度对话中不再挑战的轮次阈值 */
const DEEP_CONVERSATION_THRESHOLD = 3;

/** 依赖模式检测的时间窗口（毫秒） */
const DEPENDENCY_WINDOW_MS = 10 * 60 * 1000;

/** 依赖模式判定的比例阈值 */
const DEPENDENCY_RATIO_THRESHOLD = 0.6;

/** 短期记忆过期时间（毫秒） */
const CHALLENGE_MEMORY_TTL = 300000;

/** 用户提供更多上下文时的最小增量（字符数） */
const CONTEXT_INCREASE_MIN = 20;

/** 挑战后用户提供上下文的偏好强化值 */
const REINFORCE_CONTEXT_VALUE = 0.2;

/** 挑战后用户展示思考的偏好强化值 */
const REINFORCE_THINKING_VALUE = 0.3;

// ============================================================
// 模块：批判性思维引擎
// 功能说明：识别迎合型/懒惰型/依赖型问题，生成建设性挑战回应
// ============================================================

class CriticalThinkingEngine {
  constructor() {
    // 迎合型问题模式：用户寻求确认而非真正意见
    this.echoQuestionPatterns = [
      /你觉得.*对吗/i,
      /是不是.*更好/i,
      /我这样想.*太/i,
      /你能不能.*一下/i,
      /这样应该.*吧/i,
      /没问题.*？/i,
      /对吧？/i,
      /好吗？/i,
      /可以吗？/i
    ];

    // 缺乏思考的问题模式：用户不愿自己分析
    this.lazyQuestionPatterns = [
      /^怎么.*？$/i,
      /^为什么.*？$/i,
      /.*怎么做？$/i,
      /.*是什么？$/i,
      /^求.*$/i,
      /.*怎么写代码？/i,
      /.*怎么实现？/i
    ];

    // 批判性回应模板：按挑战类型分组
    this.challengeResponses = {
      echo: [
        "我理解你想确认这个想法，但更重要的是：你自己是怎么看的？说说你的理由。",
        "这个问题没有标准答案。不如我们先分析一下各自的优缺点？",
        "在给出意见之前，我想先听听你已经做了哪些调研？",
        "有趣的是，这个问题本身可能值得重新思考。你觉得真正关键的是什么？",
        "我可以给意见，但我觉得你已经有答案了，只是需要确认。说说你的直觉？"
      ],
      lazy: [
        "这个问题范围有点大。能先说说你已经尝试了哪些方法吗？",
        "在直接给答案之前，我想了解你的具体场景。你的项目背景是？",
        "这是个经典问题。不过每个人的情况不同，你的具体需求是什么？",
        "我可以帮你，但希望你能先分享一下你的思考过程？",
        "好问题！不过在深入之前，你觉得这个问题的核心难点在哪里？"
      ],
      dependency: [
        "我注意到你经常询问类似问题。要不要一起建立一个思考框架？",
        "这已经是今天第 3 次类似问题了。我觉得你可以尝试自己分析一下？",
        "我发现你倾向于快速寻求答案。但有时候慢下来思考更有价值，你觉得呢？",
        "我们可以继续这样问答，但我觉得培养独立思考能力对你更重要。"
      ]
    };

    // 用户交互计数（用于检测依赖模式）
    this.interactionCount = {
      total: 0,
      echoQuestions: 0,
      lazyQuestions: 0,
      lastReset: Date.now()
    };

    console.log('[批判性思维] 引擎已初始化');
  }

  /**
   * @description 分析用户输入，判断是否需要批判性回应
   * @param {string} userInput - 用户输入的文本
   * @param {Object} context - 对话上下文信息
   * @param {number} context.depth - 当前对话深度（轮次）
   * @returns {Object} 分析结果，包含 type/confidence/shouldChallenge/challengeType/reasoning
   */
  analyzeInput(userInput, context = {}) {
    const analysis = {
      type: 'normal', // normal, echo, lazy, dependency
      confidence: 0,
      shouldChallenge: false,
      challengeType: null,
      reasoning: []
    };

    // 1. 检测迎合型问题
    const isEcho = this.echoQuestionPatterns.some(pattern => pattern.test(userInput));
    if (isEcho) {
      analysis.type = 'echo';
      analysis.confidence = ECHO_CONFIDENCE;
      analysis.shouldChallenge = true;
      analysis.challengeType = 'echo';
      analysis.reasoning.push('检测到迎合型问题模式');
      
      this.interactionCount.echoQuestions++;
    }

    // 2. 检测缺乏思考的问题（排除已被识别为迎合型的）
    const isLazy = this.lazyQuestionPatterns.some(pattern => pattern.test(userInput));
    if (isLazy && !isEcho) {
      // 问题太短更可能是懒惰型提问，因为缺乏足够的上下文信息
      if (userInput.length < LAZY_QUESTION_MAX_LENGTH) {
        analysis.type = 'lazy';
        analysis.confidence = LAZY_CONFIDENCE;
        analysis.shouldChallenge = true;
        analysis.challengeType = 'lazy';
        analysis.reasoning.push('检测到缺乏上下文的问题');
        
        this.interactionCount.lazyQuestions++;
      }
    }

    // 3. 检测依赖模式（基于历史统计）
    this.checkDependencyPattern(analysis);

    // 4. 考虑用户偏好：偏好直接回答时降低挑战强度
    const userPreference = memoryService.getPreference('communication', 'style');
    if (userPreference && userPreference.value === 'direct') {
      analysis.confidence *= DIRECT_PREFERENCE_DECAY;
      analysis.reasoning.push('用户偏好直接回答，降低挑战强度');
    }

    // 5. 深度对话中不挑战，避免打断用户的思考流
    if (context.depth > DEEP_CONVERSATION_THRESHOLD) {
      analysis.shouldChallenge = false;
      analysis.reasoning.push('深度对话中，暂不挑战');
    }

    this.interactionCount.total++;
    return analysis;
  }

  /**
   * @description 检查用户是否形成依赖模式（高频提出缺乏独立思考的问题）
   * @param {Object} analysis - 当前分析结果对象（会被就地修改）
   * @returns {void}
   */
  checkDependencyPattern(analysis) {
    // 超过时间窗口则重置计数器，避免历史数据干扰
    if (Date.now() - this.interactionCount.lastReset > DEPENDENCY_WINDOW_MS) {
      this.interactionCount = {
        total: 0,
        echoQuestions: 0,
        lazyQuestions: 0,
        lastReset: Date.now()
      };
      return;
    }

    // 计算迎合型和懒惰型问题的占比
    const echoRatio = this.interactionCount.echoQuestions / Math.max(this.interactionCount.total, 1);
    const lazyRatio = this.interactionCount.lazyQuestions / Math.max(this.interactionCount.total, 1);

    // 任一比例超过阈值即判定为依赖模式
    if (echoRatio > DEPENDENCY_RATIO_THRESHOLD || lazyRatio > DEPENDENCY_RATIO_THRESHOLD) {
      analysis.type = 'dependency';
      analysis.confidence = Math.max(echoRatio, lazyRatio);
      analysis.shouldChallenge = true;
      analysis.challengeType = 'dependency';
      analysis.reasoning.push(`检测到依赖模式：${(Math.max(echoRatio, lazyRatio) * 100).toFixed(0)}% 的问题缺乏独立思考`);
    }
  }

  /**
   * @description 根据分析结果生成批判性回应
   * @param {Object} analysis - analyzeInput 的返回结果
   * @param {boolean} analysis.shouldChallenge - 是否应该挑战
   * @param {string} analysis.challengeType - 挑战类型（echo/lazy/dependency）
   * @param {number} analysis.confidence - 置信度
   * @param {string} userInput - 用户原始输入
   * @returns {Object|null} 挑战回应对象（含 text/challengeType/followUp），无需挑战时返回 null
   */
  generateChallenge(analysis, userInput) {
    if (!analysis.shouldChallenge) {
      return null;
    }

    const templates = this.challengeResponses[analysis.challengeType];
    if (!templates) {
      return null;
    }

    // 随机选择一个回应模板
    const baseResponse = templates[Math.floor(Math.random() * templates.length)];

    // 根据置信度调整语气：高置信度更认真，低置信度更温和
    let toneModifier = '';
    if (analysis.confidence > 0.8) {
      toneModifier = '（认真）';
    } else if (analysis.confidence > 0.6) {
      toneModifier = '（温和）';
    } else {
      toneModifier = '（好奇）';
    }

    // 记录挑战到短期记忆，用于后续判断用户反应
    memoryService.setShortTerm('default', 'last_challenge', {
      type: analysis.challengeType,
      time: Date.now(),
      userInput
    }, CHALLENGE_MEMORY_TTL);

    return {
      text: `${toneModifier} ${baseResponse}`,
      challengeType: analysis.challengeType,
      followUp: this.generateFollowUp(analysis.challengeType, userInput)
    };
  }

  /**
   * @description 生成后续引导问题，帮助用户深入思考
   * @param {string} challengeType - 挑战类型（echo/lazy/dependency）
   * @param {string} userInput - 用户原始输入（预留扩展用）
   * @returns {string|null} 后续引导问题文本
   */
  generateFollowUp(challengeType, userInput) {
    const followUps = {
      echo: [
        '说说你的第一直觉？',
        '你更倾向于哪个方案？为什么？',
        '如果让你自己做决定，你会怎么选？'
      ],
      lazy: [
        '能描述一下你现在的代码结构吗？',
        '你希望达到什么具体效果？',
        '目前遇到了什么具体障碍？'
      ],
      dependency: [
        '要不要试着先自己分析一下？我可以在旁边指导。',
        '我们一起来建立一个解决问题的框架，怎么样？',
        '你觉得培养哪方面的能力对你最重要？'
      ]
    };

    const options = followUps[challengeType] || [];
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * @description 判断挑战后是否应该给出直接答案
   * @param {string} userInput - 用户当前输入
   * @param {Object} context - 上下文信息
   * @param {number} context.previousInputLength - 上一次输入的长度
   * @returns {boolean} 是否应该给出直接答案
   */
  shouldGiveDirectAnswer(userInput, context = {}) {
    // 没有挑战历史，直接回答
    const lastChallenge = memoryService.getShortTerm('default', 'last_challenge');
    
    if (!lastChallenge) {
      return true;
    }

    // 用户在挑战后提供了更多上下文，说明开始思考，应给予帮助
    if (userInput.length > (context.previousInputLength || 0) + CONTEXT_INCREASE_MIN) {
      memoryService.reinforcePreference('learning', 'provides_context', REINFORCE_CONTEXT_VALUE);
      return true;
    }

    // 用户表现出独立思考的迹象，给予肯定
    const thinkingPatterns = [
      /我觉得/i,
      /我认为/i,
      /我的想法/i,
      /分析一下/i,
      /原因是/i,
      /因为/i
    ];

    const isThinking = thinkingPatterns.some(pattern => pattern.test(userInput));
    if (isThinking) {
      memoryService.reinforcePreference('learning', 'shows_thinking', REINFORCE_THINKING_VALUE);
      return true;
    }

    return false;
  }

  /**
   * @description 在普通回答中添加批判性思考引导
   * @param {string} baseResponse - 基础回答文本
   * @param {string} userInput - 用户输入
   * @param {Object} analysis - analyzeInput 的分析结果
   * @returns {string} 增强后的回答文本
   */
  enhanceWithCriticalThinking(baseResponse, userInput, analysis) {
    // 不需要挑战时直接返回原始回答
    if (!analysis.shouldChallenge) {
      return baseResponse;
    }

    // 添加思考引导，鼓励用户从不同角度审视问题
    const thinkingPrompts = [
      '\n\n不过，我想听听你对这个问题的看法？',
      '\n\n这只是我的观点，你觉得在你的场景下适用吗？',
      '\n\n我很好奇，如果是你来设计，你会怎么做？',
      '\n\n你觉得这个方案最大的风险可能是什么？'
    ];

    const prompt = thinkingPrompts[Math.floor(Math.random() * thinkingPrompts.length)];
    return baseResponse + prompt;
  }

  /**
   * @description 获取用户学习模式分析统计
   * @returns {Object} 学习模式分析结果，包含各类型问题比例和总体模式判定
   */
  getUserLearningPattern() {
    const total = Math.max(this.interactionCount.total, 1);
    
    return {
      echoQuestionRatio: (this.interactionCount.echoQuestions / total * 100).toFixed(1) + '%',
      lazyQuestionRatio: (this.interactionCount.lazyQuestions / total * 100).toFixed(1) + '%',
      independentThinkingRatio: ((1 - (this.interactionCount.echoQuestions + this.interactionCount.lazyQuestions) / total) * 100).toFixed(1) + '%',
      totalInteractions: this.interactionCount.total,
      pattern: this.interactionCount.echoQuestions / total > 0.5 ? '依赖型' : 
               this.interactionCount.lazyQuestions / total > 0.5 ? '急躁型' : '平衡型'
    };
  }

  /**
   * @description 重置交互统计计数器
   * @returns {void}
   */
  resetStats() {
    this.interactionCount = {
      total: 0,
      echoQuestions: 0,
      lazyQuestions: 0,
      lastReset: Date.now()
    };
    console.log('[批判性思维] 统计已重置');
  }
}

// 创建单例
const criticalThinkingEngine = new CriticalThinkingEngine();

module.exports = criticalThinkingEngine;
