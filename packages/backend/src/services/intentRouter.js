/**
 * @file intentRouter.js
 * @description 意图路由器 - 双区分流核心，支持闲聊区（小梦）和工作区（牛马）的智能路由
 * @module services/intentRouter
 * @author xiaomeng
 * @version 2.0.0
 * @date 2026-06-08
 *
 * 分流规则：
 * - 闲聊区（小梦）：简单问答、翻译、头脑风暴、知识问答、情感陪伴
 * - 工作区（牛马）：代码开发、PPT制作、数据分析、文档生成、复杂搜索
 */

const logger = require('../utils/logger');

// ============================================================
// 模块名称：情感模式与关键词定义
// 功能说明：定义情感表达的正则模式和关键词集合
// ============================================================

/** 情感表达的正则模式，匹配以"我"开头的情感倾诉句式 */
const EMOTIONAL_PATTERNS = [
    /^(我|小梦|梦梦|哥哥|姐姐|亲爱的)[，,]\s*.+/,
    /^我.+?(累|烦|难(过)?|伤心|困|压力|焦虑|难过|委屈|崩溃|难受|心疼)/,
    /^我[^，,。.]{0,20}[累烦难伤心困压力焦虑难过委屈].{0,10}$/,
    /^我[好很真太挺越].{0,10}[累烦难困压力大焦虑累]/u
];

/** 情感关键词集合，用于快速判断文本是否包含情感表达 */
const EMOTIONAL_KEYWORDS = new Set([
    '累', '好累', '好烦', '难过', '伤心', '委屈', '郁闷', '沮丧', '失落',
    '压力大', '焦虑', '担心', '害怕', '恐惧', '迷茫', '无奈',
    '开心', '高兴', '快乐', '兴奋', '激动',
    '倾诉', '吐槽', '抱怨', '诉苦', '哭诉', '发泄',
    '无聊', '没事干', '闲着', '发呆'
]);

// ============================================================
// 模块名称：闲聊区任务类型定义（小任务 → 小梦处理）
// 功能说明：简单快捷任务，直接在小梦闲聊区完成，无需切换到工作牛马
// ============================================================

/** 闲聊区任务类型配置 */
const CHAT_ZONE_TASK_TYPES = {
    /** 快速问答类 */
    quick_qa: {
        patterns: [
            /(?:今天天气|现在几点了|今天是几号|今天是星期几)/,
            /(?:帮我|帮我查).*(?:天气|时间|日期|星期)/,
            /^(?:在吗|在不在|你好|hi|hello|嗨|嘿)[\s!！。.]*$/,
            /^(小梦|梦梦)[，,]?\s*$/
        ],
        description: '快速问答'
    },
    /** 翻译类 */
    translation: {
        patterns: [
            /(?:翻译|帮我翻|英译中|中译英|翻成英文|翻成中文).{0,20}/,
            /(?:这段|这句话|这个).*(?:翻译|啥意思|是什么意思)/,
            /用英文.*说|英语.*怎么说|用英语.*表达/
        ],
        description: '翻译',
        // 批量翻译时升级到工作区
        batchKeywords: ['多', '批', '个文件', '批量', '全部', '整个']
    },
    /** 头脑风暴/创意类 */
    brainstorming: {
        patterns: [
            /(?:头脑风暴|帮我想想|有什么.*想法|给点.*建议)/,
            /(?:你觉得|你怎么看).{0,20}[?？]/,
            /(?:帮我出|有什么.*方案|有什么.*建议)/
        ],
        description: '头脑风暴'
    },
    /** 简单计算/分析 */
    simple_calc: {
        patterns: [
            /(?:算一下|计算|帮我算).{0,30}/,
            /(?:多少钱|多少.*钱|加起来|一共)/,
            /(?:对比|比较).*(?:哪个|哪个好|选择)/
        ],
        description: '简单计算'
    },
    /** 知识问答 */
    knowledge_qa: {
        patterns: [
            /^(什么是|是什么|有什么区别|区别是|什么意思)/,
            /.{0,30}(?:是什么|有什么用|为什么|怎么做)/
        ],
        description: '知识问答'
    }
};

/** 闲聊区关键词 */
const CHAT_ZONE_KEYWORDS = new Set([
    '翻译', '翻一下', '英译', '中译',
    '怎么', '什么是', '什么意思', '为什么',
    '帮我想想', '有什么建议', '给点建议', '头脑风暴',
    '对比', '比较', '哪个好',
    '天气', '时间', '几点', '今天几号', '星期几'
]);

// ============================================================
// 模块名称：工作区任务类型定义（大任务 → 牛马处理）
// 功能说明：复杂任务，需要工具调用、多步操作、文件生成
// ============================================================

/** 工作区任务类型配置 */
const WORK_ZONE_TASK_TYPES = {
    /** 旅行规划 */
    travel_plan: {
        patterns: [
            /(?:规划|制定|安排|做|帮我做).*(?:旅行|旅游|行程)/,
            /(?:杭州|北京|上海|成都|西安|南京|苏州|重庆|深圳|广州|旅游).*(?:三天|2天|3天|4天|5天)/,
            /(?:三天|2天|3天|4天|5天).*(?:旅行|旅游|行程|杭州|北京|上海|成都|西安|南京|苏州|重庆|深圳|广州)/,
            /(?:自助)?旅行(?:计划|规划|行程|安排)/
        ],
        priority: 12,
        description: '旅行规划'
    },
    /** 代码审查 */
    code_review: {
        patterns: [
            /(?:检查|审查|看看|帮?我看).*(?:代码|程式|程序).*/,
            /(?:代码|程式|程序).*(?:检查|审查|看看|帮?我看)/,
            /(?:帮我|请帮我).*(?:检查|审查|看看|帮?我看).*(?:代码|程式|程序)/
        ],
        priority: 11,
        description: '代码审查'
    },
    /** 代码开发 */
    code_dev: {
        patterns: [
            /(?:开发|编写|写|创建|构建|实现).*(?:应用|程序|系统|Web|网站|脚本|工具|服务|API|app|App)/,
            /(?:开发|编程|写代码|写程序|Web应用|写一个.*(?:应用|程序|系统|网站|脚本)|开发一个)/,
            /(?:帮我|请帮我).*(?:开发|写代码|写程序|编程|实现.*功能)/
        ],
        priority: 10,
        description: '代码开发'
    },
    /** PPT/幻灯片 */
    ppt: {
        patterns: [
            /(?:制作|生成|做|写).*(?:PPT|ppt|幻灯片|pptx)/,
            /(?:PPT|ppt|幻灯片|pptx)/
        ],
        priority: 9,
        description: 'PPT制作'
    },
    /** 数据分析（复杂） */
    data_analysis: {
        patterns: [
            /\d{1,4}[月\/号日]\d{0,4}[号日]?/.source + /.*(?:收入|卖出|销售|金额|价格|成本|利润|退货)/.source,
            /(?:分析|统计|计算|预测|汇总).*(?:数据|报表|记录|销售|收入)/
        ],
        inlineDataCheck: true,
        priority: 8,
        description: '数据分析'
    },
    /** 文件整理 */
    file_ops: {
        patterns: [
            /整理\s*(?:桌面|文件|文件夹|资料)/,
            /(?:桌面|文件夹|目录).*(?:整理|清理|分类|归档)/,
            /(?:帮我|请帮我).*(?:整理|清理|分类|归档).*(?:文件|桌面|文件夹)/
        ],
        priority: 7,
        description: '文件整理'
    },
    /** 新闻搜索 */
    news: {
        patterns: [
            /(?:AI|人工智能|大模型).*(?:新闻|资讯 最新|动态|消息)/,
            /(?:新闻|资讯 最新).*(?:AI|人工智能|大模型|ChatGPT)/,
            /(?:帮我|请帮我).*(?:搜|搜索).*(?:AI|人工智能|新闻|资讯)/,
            /今日(?:AI|人工智能|科技|互联网)新闻/,
            /(?:AI|人工智能)最新(?:动态|资讯|消息)/,
            /(?:最新|今日).*(?:AI|人工智能)动态/
        ],
        priority: 7,
        description: '新闻搜索'
    },
    /** 文档生成 */
    document: {
        patterns: [
            /(?:帮我|请帮我|生成|写|制作).*(?:报告|文档|总结|邮件|周报|计划书)/,
            /(?:Excel|Word|PDF|表格|文档).*(?:做|生成|创建|写)/,
            /(?:做|生成|创建).*(?:Excel|Word|PDF|表格|文档)/
        ],
        priority: 6,
        description: '文档生成'
    },
    /** 通用搜索 */
    search: {
        patterns: [
            /(?:搜|搜索|查找|查一下|搜一下).+/,
            /(?:帮我|请帮我).*(?:搜|搜索|查找|查)/
        ],
        priority: 5,
        description: '搜索'
    },
    /** 通用任务 */
    general: {
        patterns: [
            /(?:帮我|请帮|麻烦帮|能不能帮|可以帮).+/,
            /^(打开|启动|运行|执行|安装|卸载|下载|删除|移动|复制|重命名).+/,
            /(?:设个|做个|发个|查个|算一下|算算)/,
            /(?:订票|买车票|买票|订火车票|订机票|火车票|高铁票|机票)/
        ],
        priority: 4,
        description: '通用任务'
    }
};

/** 工作区关键词 */
const WORK_ZONE_KEYWORDS = new Set([
    '打开', '启动', '运行', '执行', '帮我',
    '整理', '清理', '删除', '移动', '复制',
    '搜索', '查找', '下载', '上传', '文件', '文件夹', '桌面',
    '截图', '录屏', '新闻', '资讯', '提醒', '闹钟',
    '播放', '暂停', '发送', '邮件',
    '安装', '卸载', '更新', '关机', '重启', '锁屏',
    '表格', 'Excel', 'csv', '数据', '统计', '汇总',
    'Word', '文档', 'PPT', '幻灯片',
    '写个', '写一', '写份', '生成', '创建',
    '股价', '基金', '股票', '汇率',
    '快递', '物流', '订单', '打车', '外卖', '订餐',
    '订票', '火车票', '高铁票', '机票',
    '开发', '编程', '代码', '程式', '程序', '算法',
    '分析', '推理', '计算', '写一个', '实现',
    'AI', '人工智能', '大模型', 'ChatGPT', '最新动态'
]);

// ============================================================
// 模块名称：系统快捷操作定义
// 功能说明：定义系统快捷操作，匹配时直接路由到 system_control
// ============================================================

const SYSTEM_QUICK_ACTIONS = [
    { regex: /截图|截屏/, type: 'screenshot' },
    { regex: /锁屏/, type: 'lock_screen' },
    { regex: /音量.*(调大|调小|静音)/, type: 'volume' },
    { regex: /关机|重启/, type: 'power' },
    { regex: /任务管理器/, type: 'task_manager' },
    { regex: /清空回收站/, type: 'empty_trash' },
    { regex: /(删除|清空|清除)(我)?(所有|全部)?(的)?(记忆|对话|历史|聊天记录)/, type: 'clear_memory' }
];

// ============================================================
// 模块名称：复杂度评估常量
// ============================================================

/** 内联数据检测的最小文本长度 */
const MIN_INLINE_DATA_LENGTH = 30;

/** 内联数据检测要求的最少分隔符数量 */
const MIN_SEPARATOR_COUNT = 3;

/** 复杂度阈值：超过此值路由到工作区 */
const COMPLEXITY_THRESHOLD = 5;

// ============================================================
// 模块名称：意图检测辅助函数
// ============================================================

/**
 * @description 检测文本中是否包含内联结构化数据
 */
function _hasInlineData(text) {
    if (text.length < MIN_INLINE_DATA_LENGTH) return false;
    const hasNumbers = /\d+[.,，、]\d+|\d{2,}/.test(text);
    const hasDataKeywords = /(收入|卖出|销售|金额|价格|成本|利润|退货|订单|产品|数据|元|万|百|千)/.test(text);
    const hasMultipleEntries = (text.match(/[；;，,]/g) || []).length >= MIN_SEPARATOR_COUNT;
    return hasNumbers && hasDataKeywords && (hasMultipleEntries || text.length > 60);
}

/**
 * @description 判断文本是否为纯情感表达
 */
function _isPureEmotional(text) {
    const trimmed = text.trim();
    for (const keyword of EMOTIONAL_KEYWORDS) {
        if (trimmed.includes(keyword)) {
            const hasTaskVerb = /^(帮我|请帮|打开|搜索|查|找|订|买|整理|生成|创建|开发|写|做|分析|计算)/.test(trimmed);
            if (!hasTaskVerb) {
                for (const pattern of EMOTIONAL_PATTERNS) {
                    if (pattern.test(trimmed)) return true;
                }
            }
        }
    }
    return false;
}

/**
 * @description 判断文本是否为纯闲聊
 */
function _isChatOnly(text) {
    const trimmed = text.trim();
    // 打招呼模式
    const chatOnlyPatterns = [
        /^(你好|嗨|嘿|在吗|在不在|早安|晚安|午安)[\s!！。.]*$/,
        /^(小梦|梦梦)[，,]?\s*$/,
        /^(聊天|聊会|说话|陪我|陪我聊|唠嗑|侃大山)/
    ];
    for (const pattern of chatOnlyPatterns) {
        if (pattern.test(trimmed)) return true;
    }
    // 只叫名字，后面没有任务词
    if (/^(小梦|梦梦)[，,]?\s*/.test(trimmed) && trimmed.length < 30) {
        const afterName = trimmed.replace(/^(小梦|梦梦)[，,]?\s*/, '');
        if (!/打开|搜索|帮我|订|查|找|整理|生成|开发|写|做|分析/.test(afterName)) {
            return true;
        }
    }
    return false;
}

/**
 * @description 检测系统快捷操作
 */
function _detectSystemQuickAction(text) {
    for (const action of SYSTEM_QUICK_ACTIONS) {
        if (action.regex.test(text)) return action.type;
    }
    return null;
}

/**
 * @description 检测闲聊区任务类型
 */
function _detectChatZoneTask(text) {
    for (const [type, config] of Object.entries(CHAT_ZONE_TASK_TYPES)) {
        for (const pattern of config.patterns) {
            try {
                if (pattern.test(text)) {
                    return { taskType: type, description: config.description };
                }
            } catch (e) {}
        }
    }
    return { taskType: null, description: null };
}

/**
 * @description 检测工作区任务类型
 */
function _detectWorkZoneTask(text) {
    let bestMatch = { taskType: null, priority: 0, description: null };

    for (const [type, config] of Object.entries(WORK_ZONE_TASK_TYPES)) {
        if (config.inlineDataCheck && !_hasInlineData(text)) continue;

        for (const pattern of config.patterns) {
            try {
                if (pattern.test(text)) {
                    if (config.priority > bestMatch.priority) {
                        bestMatch = { taskType: type, priority: config.priority, description: config.description };
                    }
                    break;
                }
            } catch (e) {}
        }
    }

    return bestMatch;
}

/**
 * @description 检测闲聊区关键词
 */
function _hasChatZoneKeyword(text) {
    for (const keyword of CHAT_ZONE_KEYWORDS) {
        if (text.includes(keyword)) return true;
    }
    return false;
}

/**
 * @description 检测工作区关键词
 */
function _hasWorkZoneKeyword(text) {
    for (const keyword of WORK_ZONE_KEYWORDS) {
        if (keyword.length >= 2 && text.includes(keyword)) return true;
    }
    return false;
}

/**
 * @description 评估任务复杂度
 */
function _assessComplexity(text) {
    const reasons = [];
    let score = 1;

    // 大任务指标
    const bigTaskIndicators = [
        '多个', '批量', '全部', '整个', '所有',
        '生成报告', '转换', '处理', '规划', '开发',
        '分析.*数据', '统计.*汇总', '制作PPT', '生成.*表格'
    ];

    for (const indicator of bigTaskIndicators) {
        if (new RegExp(indicator).test(text)) {
            score += 2;
            reasons.push(`大任务指标: ${indicator}`);
            break;
        }
    }

    // 多步骤指标
    if (/然后|接着|再|和|再然后/.test(text)) {
        score += 1;
        reasons.push('多步骤操作');
    }

    // 文件操作指标
    const fileOps = ['桌面', '文件夹', '目录', '文件', '文档', 'Excel', 'Word', 'PPT'];
    for (const op of fileOps) {
        if (text.includes(op)) {
            score += 1;
            reasons.push(`文件操作: ${op}`);
            break;
        }
    }

    return {
        complexity: score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low',
        score: Math.min(Math.max(score, 1), 10),
        reasons
    };
}

// ============================================================
// 模块名称：主路由函数
// 功能说明：双区分流 - 根据用户输入判断路由到 闲聊区 或 工作区
// ============================================================

/**
 * @description 双区路由主函数
 * @param {string} text - 用户输入文本
 * @param {Object} options - 路由选项
 * @returns {{ zone: string, confidence: number, taskType: string|null, taskDescription: string, reason: string, complexity: object }} 路由结果
 */
function route(text, options = {}) {
    if (!text || typeof text !== 'string') {
        return {
            zone: 'chat', confidence: 1.0,
            taskType: null, taskDescription: null,
            reason: 'empty_input',
            complexity: { complexity: 'low', score: 1, reasons: [] }
        };
    }

    const { imageData = null } = options;

    // 有图片时默认闲聊区
    if (imageData) {
        return {
            zone: 'chat', confidence: 0.95,
            taskType: null, taskDescription: '图片分析',
            reason: 'image_input',
            complexity: { complexity: 'low', score: 1, reasons: [] }
        };
    }

    const trimmed = text.trim();

    // 1. 系统快捷操作 → system_control
    const quickAction = _detectSystemQuickAction(trimmed);
    if (quickAction) {
        return {
            zone: 'system', confidence: 0.95,
            taskType: quickAction, taskDescription: quickAction,
            reason: 'system_quick_action',
            complexity: { complexity: 'low', score: 1, reasons: [] }
        };
    }

    // 2. 纯闲聊 → 闲聊区
    if (_isChatOnly(trimmed)) {
        return {
            zone: 'chat', confidence: 0.92,
            taskType: null, taskDescription: null,
            reason: 'chat_only',
            complexity: { complexity: 'low', score: 1, reasons: [] }
        };
    }

    // 3. 纯情感 → 闲聊区（情感陪伴）
    if (_isPureEmotional(trimmed) && !_hasWorkZoneKeyword(trimmed)) {
        return {
            zone: 'chat', confidence: 0.88,
            taskType: 'emotional', taskDescription: '情感陪伴',
            reason: 'emotional_support',
            complexity: { complexity: 'low', score: 1, reasons: [] }
        };
    }

    // 4. 评估复杂度
    const complexity = _assessComplexity(trimmed);

    // 5. 优先检测闲聊区任务（简单任务）
    const chatTask = _detectChatZoneTask(trimmed);
    if (chatTask.taskType) {
        // 检查是否需要升级到工作区
        let shouldUpgrade = false;

        // 1) 复杂度高
        if (complexity.score >= COMPLEXITY_THRESHOLD) {
            shouldUpgrade = true;
        }
        // 2) 有批量关键词（翻译、搜索等任务的多文件版本）
        const chatConfig = CHAT_ZONE_TASK_TYPES[chatTask.taskType];
        if (chatConfig && chatConfig.batchKeywords) {
            for (const kw of chatConfig.batchKeywords) {
                if (text.includes(kw)) {
                    shouldUpgrade = true;
                    break;
                }
            }
        }

        if (shouldUpgrade) {
            const workTask = _detectWorkZoneTask(trimmed);
            if (workTask.taskType) {
                return {
                    zone: 'work', confidence: 0.85,
                    taskType: workTask.taskType,
                    taskDescription: workTask.description,
                    reason: `batch_${chatTask.taskType}_upgraded`,
                    complexity
                };
            }
            // 没有匹配到工作区任务，但复杂度高，通用升级
            return {
                zone: 'work', confidence: 0.75,
                taskType: 'general', taskDescription: '批量任务',
                reason: `complexity_upgrade_${chatTask.taskType}`,
                complexity
            };
        }
        return {
            zone: 'chat', confidence: 0.85,
            taskType: chatTask.taskType,
            taskDescription: chatTask.description,
            reason: `chat_zone_${chatTask.taskType}`,
            complexity
        };
    }

    // 6. 检测工作区任务
    const workTask = _detectWorkZoneTask(trimmed);
    if (workTask.taskType) {
        return {
            zone: 'work', confidence: 0.90,
            taskType: workTask.taskType,
            taskDescription: workTask.description,
            reason: `work_zone_${workTask.taskType}`,
            complexity
        };
    }

    // 7. 基于关键词和工作复杂度综合判断
    const hasWorkKeyword = _hasWorkZoneKeyword(trimmed);
    const hasChatKeyword = _hasChatZoneKeyword(trimmed);

    if (hasWorkKeyword && !hasChatKeyword) {
        return {
            zone: 'work', confidence: 0.75,
            taskType: 'general', taskDescription: '通用任务',
            reason: 'work_keyword',
            complexity
        };
    }

    if (hasChatKeyword && !hasWorkKeyword) {
        return {
            zone: 'chat', confidence: 0.75,
            taskType: 'qa', taskDescription: '问答',
            reason: 'chat_keyword',
            complexity
        };
    }

    // 8. 复杂任务基于复杂度阈值判断
    if (complexity.score >= COMPLEXITY_THRESHOLD) {
        return {
            zone: 'work', confidence: 0.70,
            taskType: 'general', taskDescription: '复杂任务',
            reason: `complexity_${complexity.complexity}`,
            complexity
        };
    }

    // 9. 默认闲聊区
    return {
        zone: 'chat', confidence: 0.60,
        taskType: 'general', taskDescription: '通用对话',
        reason: 'default_chat',
        complexity
    };
}

// ============================================================
// 模块名称：模块导出
// ============================================================

module.exports = {
    route,
    // 导出辅助函数供测试用
    _hasInlineData,
    _detectChatZoneTask,
    _detectWorkZoneTask,
    _assessComplexity,
    // 导出类型定义供外部使用
    CHAT_ZONE_TASK_TYPES,
    WORK_ZONE_TASK_TYPES
};