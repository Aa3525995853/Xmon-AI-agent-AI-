/**
 * @file risk_assessor.js
 * @description 风险评估器 - 基于正则规则对操作内容进行风险等级评估，
 *              从极高风险到低风险逐级匹配，支持按审核场景设置默认风险等级
 * @module review_hub
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

const { RiskLevel, ReviewScene } = require('./constants');

// ============================================================
// 常量定义：风险规则与场景默认值
// ============================================================

/**
 * 风险规则配置表 - 按风险等级分组，每条规则包含正则模式和对应处理动作
 * @type {Object.<string, Array<{pattern: RegExp, action: string}>>}
 */
const RISK_RULES = {
    /** 极高风险：涉及删除核心数据、格式化、关机、转账等操作 */
    critical: [
        { pattern: /删除.*[主重核心]/i, action: 'block' },
        { pattern: /格式化|drop\s+table|truncate/i, action: 'block' },
        { pattern: /shutdown|restart|reboot/i, action: 'block' },
        { pattern: /发送.*[钱款转账]|转账|汇款/i, action: 'require_double_confirm' }
    ],
    /** 高风险：涉及发送邮件、删除文件、修改密码、采购下单等操作 */
    high: [
        { pattern: /发送.*邮件|send.*email/i, action: 'review' },
        { pattern: /删除.*文件|del.*file/i, action: 'review' },
        { pattern: /修改.*密码|change.*password/i, action: 'review' },
        { pattern: /取消.*订阅|cancel.*subscription/i, action: 'review' },
        { pattern: /采购|下单|purchase|order/i, action: 'review' }
    ],
    /** 中风险：涉及文件整理、报告生成等操作，搜索/查看类自动通过 */
    medium: [
        { pattern: /整理.*桌面|整理.*文件夹/i, action: 'conditional' },
        { pattern: /生成.*报告|create.*report/i, action: 'conditional' },
        { pattern: /搜索|查找|search/i, action: 'auto_approve' },
        { pattern: /读取|查看|read|view/i, action: 'auto_approve' }
    ],
    /** 低风险：天气查询、计算、翻译等纯信息操作 */
    low: [
        { pattern: /天气|时间|now.*time/i, action: 'auto_approve' },
        { pattern: /计算|calculator/i, action: 'auto_approve' },
        { pattern: /翻译|translate/i, action: 'auto_approve' }
    ]
};

/** 各审核场景的默认风险等级 - 当规则匹配不到时使用 */
const SCENE_RISK_DEFAULTS = {
    [ReviewScene.ACTION_REVIEW]: RiskLevel.HIGH,
    [ReviewScene.RECOVER_REVIEW]: RiskLevel.MEDIUM,
    [ReviewScene.PLAN_REVIEW]: RiskLevel.MEDIUM,
    [ReviewScene.RESULT_REVIEW]: RiskLevel.LOW,
    [ReviewScene.CONTINUE_REVIEW]: RiskLevel.LOW,
    [ReviewScene.DELIVERY_REVIEW]: RiskLevel.MEDIUM
};

// ============================================================
// 核心类：RiskAssessor
// 功能说明：基于规则优先级的风险等级评估
// ============================================================

class RiskAssessor {

    /**
     * @description 评估操作的风险等级，按极高风险→高风险→中风险→低风险顺序逐级匹配，
     *              均不匹配时使用场景默认值
     * @param {string} scene - 审核场景标识
     * @param {string} title - 操作标题
     * @param {string} content - 操作内容
     * @param {Object} context - 上下文信息
     * @returns {Promise<string>} 风险等级（critical/high/medium/low）
     */
    async assess(scene, title, content, context) {
        const fullText = `${title} ${content}`.toLowerCase();

        // 按风险等级从高到低逐级检查，优先匹配高风险规则
        for (const rule of RISK_RULES.critical) {
            if (rule.pattern.test(fullText)) return RiskLevel.CRITICAL;
        }

        for (const rule of RISK_RULES.high) {
            if (rule.pattern.test(fullText)) return RiskLevel.HIGH;
        }

        for (const rule of RISK_RULES.medium) {
            if (rule.pattern.test(fullText)) return RiskLevel.MEDIUM;
        }

        for (const rule of RISK_RULES.low) {
            if (rule.pattern.test(fullText)) return RiskLevel.LOW;
        }

        // 无规则匹配时，使用场景的默认风险等级
        return SCENE_RISK_DEFAULTS[scene] || RiskLevel.MEDIUM;
    }
}

module.exports = new RiskAssessor();