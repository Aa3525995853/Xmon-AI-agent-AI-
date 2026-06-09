/**
 * @file index.js
 * @description ContextEngine 主入口 - 上下文感知引擎，负责感知用户身份、场所、时间、状态，为 LLM 提供上下文
 * @module context_engine
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');

// 延迟加载子模块
let _profileManager = null;
let _timeManager = null;
let _locationManager = null;
let _modeManager = null;
let _emotionAnalyzer = null;
let _answerMonitor = null;

function getProfileManager() {
    if (!_profileManager) _profileManager = require('./profile_manager');
    return _profileManager;
}

function getTimeManager() {
    if (!_timeManager) _timeManager = require('./time_manager');
    return _timeManager;
}

function getLocationManager() {
    if (!_locationManager) _locationManager = require('./location_manager');
    return _locationManager;
}

function getModeManager() {
    if (!_modeManager) _modeManager = require('./mode_manager');
    return _modeManager;
}

function getEmotionAnalyzer() {
    if (!_emotionAnalyzer) _emotionAnalyzer = require('./emotion_analyzer');
    return _emotionAnalyzer;
}

function getAnswerMonitor() {
    if (!_answerMonitor) _answerMonitor = require('./answer_monitor');
    return _answerMonitor;
}

class ContextEngine {
    constructor() {
        this.profileManager = getProfileManager();
        this.timeManager = getTimeManager();
        this.locationManager = getLocationManager();
        this.modeManager = getModeManager();
        this.emotionAnalyzer = getEmotionAnalyzer();
        this.answerMonitor = getAnswerMonitor();

        // 当前上下文状态
        this.currentContext = {
            location: 'unknown',
            mode: 'idle',
            mode_start_time: null,
            time_period: this.timeManager.getTimePeriod(),
            last_interaction: null,
            session_start: Date.now(),
            consecutive_work_minutes: 0,
            userEmotion: 'neutral',
            userEmotionIntensity: 'weak',
            emotionTrend: 'stable'
        };

        // 定时更新
        setInterval(() => {
            this.currentContext.time_period = this.timeManager.getTimePeriod();
        }, 60000);

        logger.info('[ContextEngine] 上下文感知引擎初始化完成');
    }

    /**
     * @description 获取 LLM 上下文 - 整合用户画像、时间规则、模式配置、场所行为和情感状态
     * @returns {string} 格式化的上下文文本，供 LLM 系统提示词使用
     */
    getContextForLLM() {
        const profile = this.profileManager.get();
        const timeRule = this.timeManager.getTimeRule(this.currentContext.time_period, profile);
        const modeConfig = this.modeManager.getCurrentMode(this.currentContext.mode, profile);
        const locationBehavior = this.locationManager.getLocationBehavior(this.currentContext.location, profile);
        const userProfileLearner = require('../user_profile_learner');
        const profileSummary = userProfileLearner.legacyUserProfileLearner.getProfileSummary();

        let contextStr = `
## 当前上下文
- 时间：${new Date().toLocaleString('zh-CN')}（${this.currentContext.time_period}）
- 地点：${this.currentContext.location}
- 当前模式：${this.currentContext.mode}
- 模式持续：${this.modeManager.getModeMinutes(this.currentContext.mode_start_time)} 分钟

## 用户画像
${profileSummary}

## 小梦当前状态
- 风格：${modeConfig?.xiaomeng?.style || timeRule?.style || '活泼'}
- 主动程度：${this._getProactiveLevel(modeConfig, locationBehavior, timeRule)}
- 亲密度：${locationBehavior?.intimacy || 'medium'}
- 音量：${modeConfig?.xiaomeng?.volume || locationBehavior?.volume || 'normal'}
`;

        if (profile.learned?.topics_interested?.length > 0) {
            contextStr += `\n## 用户喜欢聊的话题\n${profile.learned.topics_interested.join('、')}\n`;
        }

        if (profile.learned?.dislike?.length > 0) {
            contextStr += `\n## 用户不喜欢的事\n${profile.learned.dislike.join('、')}\n`;
        }

        if (locationBehavior?.topics?.length > 0) {
            contextStr += `\n## 当前场所适合的话题\n${locationBehavior.topics.join('、')}\n`;
        }

        contextStr += this.emotionAnalyzer.getEmotionContextForLLM(this.currentContext);
        contextStr += `\n## 行为指南\n${this._getBehaviorNotes()}\n`;

        return contextStr;
    }

    /**
     * @description 获取主动程度 - 按模式→场所→时间规则的优先级取值
     * @param {Object} modeConfig - 模式配置
     * @param {Object} locationBehavior - 场所行为配置
     * @param {Object} timeRule - 时间规则
     * @returns {string} 主动程度（none/minimal/medium/high）
     */
    _getProactiveLevel(modeConfig, locationBehavior, timeRule) {
        return modeConfig?.xiaomeng?.proactive
            || locationBehavior?.proactive
            || timeRule?.proactive
            || 'medium';
    }

    /**
     * @description 获取行为指南 - 根据亲密度和主动程度生成交互建议
     * @returns {string} 行为指南文本
     */
    _getBehaviorNotes() {
        const notes = [];
        const intimacy = this.locationManager.getIntimacyLevel(this.currentContext.location, this.profileManager.get());
        const proactive = this._getProactiveLevel(
            this.modeManager.getCurrentMode(this.currentContext.mode, this.profileManager.get()),
            this.locationManager.getLocationBehavior(this.currentContext.location, this.profileManager.get()),
            this.timeManager.getTimeRule(this.currentContext.time_period, this.profileManager.get())
        );

        if (intimacy === 'high') notes.push('可以撒娇、说亲密的话、开玩笑');
        else if (intimacy === 'low') notes.push('保持专业，不要太亲密');

        if (proactive === 'none' || proactive === 'minimal') {
            notes.push('尽量简短回复，不要主动延伸话题');
        } else if (proactive === 'high') {
            notes.push('可以主动聊天、分享有趣的事');
        }

        if (this.currentContext.mode === 'work' || this.currentContext.mode === 'study') {
            notes.push('用户在专注，除非被叫到否则不要打扰');
        }

        return notes.length > 0 ? notes.join('\n') : '正常交互即可';
    }

    /**
     * @description 切换模式 - 更新当前模式并返回模式切换信息
     * @param {string} modeName - 目标模式名称
     * @param {string} reason - 切换原因
     * @returns {Object|null} 模式切换信息 { previous_mode, mode, apps, apps_close, music, xiaomeng, enter_line }
     */
    switchMode(modeName, reason = 'user_request') {
        const profile = this.profileManager.get();
        const mode = profile.modes?.[modeName];

        if (!mode) {
            logger.warn(`[ContextEngine] 未知模式: ${modeName}`);
            return null;
        }

        const previousMode = this.currentContext.mode;
        this.currentContext.mode = modeName;
        this.currentContext.mode_start_time = Date.now();
        this.currentContext.consecutive_work_minutes = 0;

        logger.info(`[ContextEngine] 模式切换: ${previousMode} → ${modeName} (${reason})`);

        return {
            previous_mode: previousMode,
            mode: modeName,
            apps: mode.apps || [],
            apps_close: mode.apps_close || [],
            music: mode.music,
            xiaomeng: mode.xiaomeng,
            enter_line: mode.xiaomeng?.enter_line
        };
    }

    /**
     * @description 分析用户情感 - 调用情感分析器并更新当前上下文的情感状态
     * @param {string} userInput - 用户输入文本
     * @returns {Object} 情感分析结果
     */
    analyzeUserEmotion(userInput) {
        const result = this.emotionAnalyzer.classify(userInput);

        this.currentContext.userEmotion = result.emotion;
        this.currentContext.userEmotionIntensity = result.intensity;
        this.currentContext.emotionTrend = this.emotionAnalyzer.getEmotionTrend();

        return result;
    }

    /**
     * @description 监视答案情感 - 检查 AI 回复与用户情感的匹配度
     * @param {string} botResponse - AI 回复文本
     * @param {string} userEmotion - 用户情感标签
     * @returns {Object} 监视结果 { userEmotion, botEmotion, isMatched, mismatchRate, suggestion }
     */
    monitorAnswerEmotion(botResponse, userEmotion) {
        return this.answerMonitor.monitor(botResponse, userEmotion, this.emotionAnalyzer);
    }

    /**
     * @description 从交互中学习 - 更新对话计数、分析情感、学习用户不喜欢的事物
     * @param {string} userInput - 用户输入文本
     * @param {string} response - AI回复文本
     * @returns {void}
     */
    learnFromInteraction(userInput, response) {
        const profile = this.profileManager.get();
        profile.relationship.conversations_count++;
        this.currentContext.last_interaction = Date.now();

        const emotionResult = this.analyzeUserEmotion(userInput);
        this.monitorAnswerEmotion(response, emotionResult.emotion);

        // 学习不喜欢的事
        if (['angry', 'disgust', 'fear', 'distressed', 'suffering', 'sad'].includes(emotionResult.emotion)) {
            const patterns = [/别(.{2,10})/, /不要(.{2,10})/, /烦(.{2,6})/, /讨厌(.{2,10})/];
            for (const pattern of patterns) {
                const match = userInput.match(pattern);
                if (match && !profile.learned.dislike.includes(match[1])) {
                    profile.learned.dislike.push(match[1]);
                }
            }
        }

        this.profileManager.save();
    }

    /**
     * @description 手动设置当前场所，更新上下文中的 location 属性
     * @param {string} location - 场所名称
     * @returns {{changed: boolean, location: string}} 设置结果
     */
    setLocation(location) {
        return this.locationManager.setLocation(location, this.currentContext);
    }

    /**
     * @description 通过WiFi名称检测用户所在场所，匹配用户画像中的WiFi关键词
     * @param {string|null} wifiName - 当前连接的WiFi名称
     * @returns {{changed: boolean, location: string, behavior?: Object}} 检测结果
     */
    detectLocation(wifiName) {
        return this.locationManager.detectLocation(wifiName, this.profileManager.get(), this.currentContext);
    }
}

const instance = new ContextEngine();
module.exports = instance;