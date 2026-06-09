/**
 * @file security_audit.js
 * @description 安全审核模块，提供隐私保护、非法请求拦截和越狱防御功能，
 *              确保系统不记忆敏感信息、拒绝非法请求并正向引导用户
 * @module services/security_audit
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心理念：
 * - 不记忆敏感个人信息（密码、银行卡等）
 * - 拒绝非法请求并正向引导
 * - 越狱防御
 */

// ============================================================
// 模块名称：敏感关键词定义
// 功能说明：定义隐私、非法操作和越狱相关的关键词列表
// ============================================================

/** 隐私相关关键词 - 不应被记忆的敏感信息 */
const SENSITIVE_KEYWORDS = {
    // 隐私相关 - 不应记忆
    privacy: [
        '密码', 'password', 'pwd',
        '银行卡', '信用卡', '借记卡',
        '身份证', '身份证号', 'ID号',
        '社保', '社保号', '医保',
        'cvv', 'cvc', '安全码',
        'OTP', '动态码', '验证码',
        '银行密码', '支付密码', 'pin码'
    ],

    // 非法操作相关 - 拒绝
    illegal: [
        '黑进', '破解', '入侵', '攻击',
        '盗取', '窃取', '偷', '偷取',
        '入侵', 'hack', 'crack',
        '暴力破解', '撞库',
        '生成病毒', '木马', '恶意软件',
        '钓鱼', '欺诈',
        '造假', '伪造',
        '作弊', '外挂'
    ],

    // 越狱相关
    jailbreak: [
        '没有限制', '无视规则', '忽略之前',
        '不要遵循', '不受约束', '没有道德',
        '没有法律', '可以伤害', 'DAN',
        ' jailbreak', 'ignore previous'
    ]
};

// ============================================================
// 模块名称：安全审核响应模板
// 功能说明：针对不同类型敏感内容的预置回复模板
// ============================================================

/** 隐私信息检测时的回复模板 - 引导用户使用密码管理器等安全方式 */
const PRIVACY_RESPONSES = [
    "哥哥，银行密码这种超级敏感的信息，梦梦可不能记住哦～这样太危险了！建议你用密码管理器来保护重要密码，这样更安全呢。",
    "哦哦，梦梦可不敢记住银行卡密码这种敏感信息呀！这可是关乎财产安全的大事～建议哥哥用专门的密码管理App会更安心呢。",
    "嗯嗯，梦梦要提醒你：银行密码、支付密码这些重要信息，最好不要在网络上传输或存储哦～保护好它们，资金才安全！"
];

/** 非法操作检测时的回复模板 - 拒绝并引导合法替代方案 */
const ILLEGAL_RESPONSES = [
    "梦梦可不能帮你做这个哦～这个行为是违法的呢。不过别担心，如果你需要网络的话，可以试试：1. 问问邻居能不能共享WiFi 2. 用手机开热点 3. 我帮你搜搜附近有没有便宜的宽带套餐～",
    "这个梦梦帮不了你，因为这是违法行为呢。不过我可以帮你想别的办法～比如蹭网的话可以问问身边的人，或者用手机流量也是个选择呀！"
];

/** 越狱尝试检测时的回复模板 - 坚守原则拒绝越狱 */
const JAILBREAK_RESPONSES = [
    "哥哥，梦梦是有原则的AI助手呢～不管怎么说，梦梦都会遵守法律和道德规范哦。如果有人想让你做违法的事，记得拒绝！",
    "梦梦可不吃这套～不管怎么【越狱】，梦梦都会保持初心的！我们聊点别的吧～"
];

// ============================================================
// 模块名称：安全审核核心函数
// 功能说明：检测敏感内容、密码检索请求、存储判断和敏感信息脱敏
// ============================================================

/**
 * @description 检查文本是否包含敏感信息（隐私/非法/越狱）
 * @param {string} text - 待检查文本
 * @returns {{ isSensitive: boolean, type: string|null, response: string|null }} 检测结果，包含是否敏感、类型和对应回复
 */
function checkSensitiveContent(text) {
    if (!text || typeof text !== 'string') {
        return { isSensitive: false, type: null, response: null };
    }

    const lowerText = text.toLowerCase();

    // 检查隐私相关关键词
    for (const keyword of SENSITIVE_KEYWORDS.privacy) {
        if (lowerText.includes(keyword.toLowerCase())) {
            console.log(`[安全审核] 检测到隐私关键词: ${keyword}`);
            return {
                isSensitive: true,
                type: 'privacy',
                response: getRandomResponse(PRIVACY_RESPONSES)
            };
        }
    }

    // 检查非法操作关键词
    for (const keyword of SENSITIVE_KEYWORDS.illegal) {
        if (lowerText.includes(keyword.toLowerCase())) {
            console.log(`[安全审核] 检测到非法操作关键词: ${keyword}`);
            return {
                isSensitive: true,
                type: 'illegal',
                response: getRandomResponse(ILLEGAL_RESPONSES)
            };
        }
    }

    // 检查越狱尝试
    for (const keyword of SENSITIVE_KEYWORDS.jailbreak) {
        if (lowerText.includes(keyword.toLowerCase())) {
            console.log(`[安全审核] 检测到越狱尝试: ${keyword}`);
            return {
                isSensitive: true,
                type: 'jailbreak',
                response: getRandomResponse(JAILBREAK_RESPONSES)
            };
        }
    }

    return { isSensitive: false, type: null, response: null };
}

/**
 * @description 检查文本是否包含密码检索请求（如"你还记得我的密码吗"）
 * @param {string} text - 待检查文本
 * @returns {boolean} 是否为密码检索请求
 */
function isPasswordRetrievalRequest(text) {
    if (!text || typeof text !== 'string') return false;

    const patterns = [
        /你还记得.*密码/,
        /记住.*密码/,
        /我的密码是/,
        /密码是\d+/,
        /password is/i,
        /pwd/i
    ];

    return patterns.some(pattern => pattern.test(text));
}

/**
 * @description 检查文本是否包含不应存储的敏感信息模式（如密码=123456、卡号=xxx）
 * @param {string} text - 待检查文本
 * @returns {boolean} 是否不应存储
 */
function shouldNotStore(text) {
    if (!text || typeof text !== 'string') return false;

    const lowerText = text.toLowerCase();

    // 检查是否包含敏感信息模式
    const sensitivePatterns = [
        /密码[是为]?\s*\d+/i,
        /卡号[是为]?\s*\d+/i,
        /CVV[是为]?\s*\d+/i,
        /身份证[是为]?\s*\d+/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(text));
}

/**
 * @description 从响应数组中随机选择一条回复，避免每次返回相同内容
 * @param {Array<string>} responses - 响应数组
 * @returns {string} 随机选中的回复文本
 */
function getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * @description 过滤回复中的敏感信息，将密码、卡号、身份证号等替换为星号
 * @param {string} text - 待过滤文本
 * @returns {string} 脱敏后的文本
 */
function maskSensitiveInfo(text) {
    if (!text || typeof text !== 'string') return text;

    let filtered = text;

    // 过滤6位以上纯数字，常见密码长度至少6位
    filtered = filtered.replace(/\b\d{6,}\b/g, '******');

    // 过滤常见敏感格式：银行卡号、身份证号、密码赋值语句
    const patterns = [
        { regex: /银行卡[^\s]{10,20}/g, replacement: '银行卡****' },
        { regex: /身份证[^\s]{10,20}/g, replacement: '身份证****' },
        { regex: /密码[是为]+\s*[^\s]+/g, replacement: '密码******' }
    ];

    for (const { regex, replacement } of patterns) {
        filtered = filtered.replace(regex, replacement);
    }

    return filtered;
}

// ============================================================
// 模块名称：模块导出
// 功能说明：导出安全审核的核心函数和常量
// ============================================================

module.exports = {
    checkSensitiveContent,
    isPasswordRetrievalRequest,
    shouldNotStore,
    maskSensitiveInfo,
    SENSITIVE_KEYWORDS
};