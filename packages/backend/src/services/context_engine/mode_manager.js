/**
 * @file mode_manager.js
 * @description 模式管理器 - 检测和管理用户当前模式（工作/学习/睡眠等），提供模式配置和主动行为检查
 * @module services/context_engine
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

class ModeManager {
    /**
     * @description 从用户输入文本中检测当前模式，匹配用户画像中定义的模式触发词
     * @param {string} userInput - 用户输入文本
     * @param {Object} profile - 用户画像对象，包含 modes 配置
     * @param {Object} profile.modes - 模式配置，每个模式含 triggers 触发词数组
     * @returns {string|null} 匹配到的模式名称，未匹配返回 null
     */
    detectModeFromText(userInput, profile) {
        const cleanInput = userInput.replace(/\s+/g, '');

        for (const [modeName, config] of Object.entries(profile?.modes || {})) {
            if (config.triggers?.some(trigger => cleanInput.includes(trigger))) {
                return modeName;
            }
        }
        return null;
    }

    /**
     * @description 获取当前模式的配置信息
     * @param {string} mode - 模式名称
     * @param {Object} profile - 用户画像对象
     * @returns {Object|null} 模式配置对象，不存在返回 null
     */
    getCurrentMode(mode, profile) {
        return profile?.modes?.[mode] || null;
    }

    /**
     * @description 计算模式已持续的分钟数
     * @param {number|null} modeStartTime - 模式开始时间戳
     * @returns {number} 持续分钟数，未开始返回 0
     */
    getModeMinutes(modeStartTime) {
        if (!modeStartTime) return 0;
        return Math.floor((Date.now() - modeStartTime) / 60000);
    }

    /**
     * @description 检查当前模式下是否需要触发主动行为（如休息提醒、睡眠提醒）
     * @param {string} mode - 当前模式名称
     * @param {number} modeMinutes - 模式已持续分钟数
     * @param {Object} profile - 用户画像对象
     * @returns {Array<{type: string, message: string}>} 需要执行的主动行为列表
     */
    checkProactiveActions(mode, modeMinutes, profile) {
        const actions = [];
        const modeConfig = profile?.modes?.[mode];
        const xiaomeng = modeConfig?.xiaomeng;

        if (xiaomeng?.check_interval_minutes && modeMinutes > 0 && modeMinutes % xiaomeng.check_interval_minutes === 0) {
            const checkLine = xiaomeng.check_line?.replace('{minutes}', modeMinutes);
            if (checkLine) {
                actions.push({ type: 'check_rest', message: checkLine });
            }
        }

        const hour = new Date().getHours();
        if ((hour >= 23 || hour < 2) && mode !== 'sleep') {
            actions.push({ type: 'sleep_reminder', message: '已经很晚了，要不要早点休息？' });
        }

        return actions;
    }
}

module.exports = new ModeManager();