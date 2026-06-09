/**
 * ContextResolver 主入口 - 上下文解析器
 *
 * 核心能力：
 * 1. 指代消解 - 理解"它"、"那"、"就"等指代词
 * 2. 意图补全 - 检测不完整的指令并主动追问
 * 3. 上下文关联 - 记住上轮对话，自动关联实体
 */

const { logger } = require('../../utils/logger');

// 延迟加载子模块
let _timeParser = null;
let _pronounResolver = null;
let _intentClassifier = null;
let _clarificationEngine = null;
let _taskContext = null;

function getTimeParser() {
    if (!_timeParser) _timeParser = require('./time_parser');
    return _timeParser;
}

function getPronounResolver() {
    if (!_pronounResolver) _pronounResolver = require('./pronoun_resolver');
    return _pronounResolver;
}

function getIntentClassifier() {
    if (!_intentClassifier) _intentClassifier = require('./intent_classifier');
    return _intentClassifier;
}

function getClarificationEngine() {
    if (!_clarificationEngine) _clarificationEngine = require('./clarification_engine');
    return _clarificationEngine;
}

function getTaskContext() {
    if (!_taskContext) _taskContext = require('./task_context');
    return _taskContext;
}

class ContextResolver {
    constructor() {
        this.timeParser = getTimeParser();
        this.pronounResolver = getPronounResolver();
        this.intentClassifier = getIntentClassifier();
        this.clarificationEngine = getClarificationEngine();
        this.taskContext = getTaskContext();

        logger.info('[ContextResolver] 上下文解析器初始化完成');
    }

    /**
     * 解析用户输入，结合上下文
     */
    resolve(userInput) {
        const context = this.taskContext.getCurrent();
        const result = {
            original: userInput,
            resolved: {},
            needsClarification: false,
            clarificationQuestions: [],
            contextUpdated: false,
            intent: null,
            entities: {}
        };

        // 1. 检测是否是简短的确认/补全回复
        if (this.pronounResolver.isConfirmationReply(userInput)) {
            return this.handleConfirmationReply(userInput, context, result);
        }

        // 2. 检测时间表达
        const timeEntity = this.timeParser.extract(userInput);
        if (timeEntity) {
            result.resolved.time = timeEntity;
            result.entities.time = timeEntity;
        }

        // 3. 检测数量表达
        const quantityEntity = this.pronounResolver.extractQuantity(userInput);
        if (quantityEntity) {
            result.resolved.quantity = quantityEntity;
            result.entities.quantity = quantityEntity;
        }

        // 4. 检测指代词并解析
        const pronounResolved = this.pronounResolver.resolve(userInput, context);
        result.resolved = { ...result.resolved, ...pronounResolved.resolved };
        result.entities = { ...result.entities, ...pronounResolved.entities };

        // 5. 尝试识别完整意图
        result.intent = this.intentClassifier.identify(userInput, result.resolved);

        // 6. 检查是否需要澄清
        const missingFields = this.clarificationEngine.checkMissing(result.intent, result.resolved);
        if (missingFields.length > 0) {
            result.needsClarification = true;
            result.clarificationQuestions = this.clarificationEngine.generate(result.intent, missingFields);
        }

        // 7. 更新上下文
        if (result.intent && !result.needsClarification) {
            this.taskContext.update(result.intent, result.resolved);
            result.contextUpdated = true;
        }

        return result;
    }

    /**
     * 处理确认类回复
     */
    handleConfirmationReply(userInput, context, result) {
        const trimmed = userInput.trim();

        // 检测时间补全
        if (this.timeParser.containsExpression(trimmed)) {
            const timeEntity = this.timeParser.extract(trimmed);
            if (timeEntity) {
                result.resolved.time = timeEntity;
                result.entities.time = timeEntity;
            }
        }

        // 检测数量补全
        if (this.pronounResolver.containsQuantity(trimmed)) {
            const quantityEntity = this.pronounResolver.extractQuantity(trimmed);
            if (quantityEntity) {
                result.resolved.quantity = quantityEntity;
                result.entities.quantity = quantityEntity;
            }
        }

        // 从上下文获取当前任务
        if (context.currentTask) {
            result.intent = context.currentTask.intent;
            result.resolved = { ...context.currentTask.entities, ...result.resolved };
            result.contextUpdated = true;

            const missingFields = this.clarificationEngine.checkMissing(result.intent, result.resolved);
            if (missingFields.length > 0) {
                result.needsClarification = true;
                result.clarificationQuestions = this.clarificationEngine.generate(result.intent, missingFields);
            }
        }

        return result;
    }

    /**
     * 清除当前任务上下文
     */
    clearCurrentTask() {
        this.taskContext.pop();
    }

    /**
     * 获取任务上下文状态
     */
    getTaskContextStatus() {
        return this.taskContext.getStatus();
    }
}

const instance = new ContextResolver();
module.exports = instance;