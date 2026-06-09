/**
 * @file intent_detector.js
 * @description 意图检测器 - 基于关键词检测情感支持、闲聊、任务和复杂推理意图
 * @module intentClassifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/** 中文任务关键词列表 - 覆盖操作指令、办公、信息查询、生活服务等 */
const TASK_KEYWORDS = [
    '打开', '启动', '运行', '执行', '帮我', '帮我打开',
    '整理', '清理', '删除', '移动', '复制', '重命名',
    '搜索', '查找', '下载', '上传',
    '浏览器', '网页', '网站',
    '文件', '文件夹', '桌面',
    '截图', '录屏',
    '天气', '新闻', '资讯',
    '提醒', '闹钟', '定时',
    '播放', '暂停', '停止',
    '发送', '邮件', '消息',
    '翻译', '转换', '格式',
    '安装', '卸载', '更新',
    '关机', '重启', '锁屏',
    // Excel/文档操作
    '表格', 'Excel', 'excel', 'csv', '数据', '统计', '汇总',
    'Word', 'word', '文档', 'PPT', 'ppt', '幻灯片',
    '写个', '写一', '写份', '生成', '创建',
    // 信息查询
    '股价', '基金', '股票', '汇率', '行情',
    '快递', '物流', '订单', '包裹',
    // 快捷操作
    '设个', '做个', '发个', '查个', '算一下', '算算',
    '多少钱', '多少号', '怎么走', '在哪里', '帮我把',
    '把这个', '把那个', '把这些', '把那些',
    // 生活服务
    '打车', '外卖', '订餐', '预约', '挂号',
    '充值', '缴费', '还款', '转账',
    // 订票相关
    '订票', '买车票', '买票', '订火车票', '订高铁票', '订机票',
    '买火车票', '买高铁票', '买机票', '查火车票', '查高铁票',
    '看火车票', '看高铁票', '火车票', '高铁票', '机票',
    '帮我订', '我想买', '要买', '去哪', '怎么去', '出发去',
    '几点的', '哪个便宜', '票价多少', '多少钱'
];

/** 英文任务关键词列表 */
const TASK_KEYWORDS_EN = [
    'open', 'launch', 'start', 'run', 'execute',
    'search', 'find', 'look', 'google',
    'download', 'upload', 'install', 'uninstall', 'update',
    'delete', 'remove', 'move', 'copy', 'rename', 'cut',
    'play', 'pause', 'stop', 'restart',
    'send', 'email', 'message',
    'shutdown', 'reboot', 'restart', 'lock', 'screenshot',
    'weather', 'news', 'remind', 'reminder', 'alarm',
    'translate', 'convert', 'format',
    'book', 'buy ticket', 'order', 'purchase',
    'schedule', 'calendar', 'appointment',
    'note', 'notes', 'todo', 'task',
    'clean', 'organize', 'sort'
];

/** 复杂推理关键词列表 - 涉及编程、算法、推理等需要更强模型处理的词汇 */
const COMPLEX_KEYWORDS = [
    '编程', '代码', '算法', '数学', '物理', '化学',
    '分析', '推理', '逻辑', '证明', '计算', '公式',
    '复杂', '困难', '难题', '高级', '专业',
    '为什么', '怎么回事', '解释一下', '详细说明',
    '写一个', '写个', '实现', '开发', '调试',
    'bug', '报错', '错误', '异常',
    'programming', 'code', 'coding', 'algorithm', 'math', 'physics',
    'debug', 'bug', 'error', 'fix', 'solve', 'calculate', 'analyze'
];

/** 情感支持关键词列表 - 涉及情绪表达和日常问候的词汇 */
const EMOTIONAL_SUPPORT_KEYWORDS = [
    '累', '好累', '好烦', '难过', '伤心', '委屈', '郁闷', '沮丧', '失落',
    '压力大', '焦虑', '担心', '害怕', '恐惧', '迷茫', '无奈',
    '被骂', '被批评', '被骂了', '被吵', '被说了',
    '开心', '高兴', '快乐', '兴奋', '激动', '棒', '太好了',
    '成功', '通过了', '完成了', '搞定', '搞定啦',
    '倾诉', '吐槽', '抱怨', '诉苦', '哭诉', '发泄',
    '你好', '在吗', '早安', '晚安', '午安', '嗨', '嘿',
    '无聊', '没事干', '闲着', '发呆'
];

/** 闲聊覆盖关键词列表 - 明确的闲聊意图词汇，优先路由到 chat */
const CHAT_OVERRIDE_KEYWORDS = [
    '聊天', '聊会', '说话', '陪我', '陪我聊',
    '无聊', '闲聊', '唠嗑', '侃大山',
    '你好', '嗨', '在吗', '在不在',
    '小梦', '梦梦', '哥哥', '姐姐', '亲爱的', '老板', '小可爱', '小祖宗'
];

class IntentDetector {
    /**
     * @description 检测情感支持意图 - 匹配情感表达句式时路由到 chat
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果 { type, confidence, reason } 或 null
     */
    detectEmotional(text) {
        for (const keyword of EMOTIONAL_SUPPORT_KEYWORDS) {
            if (text.includes(keyword)) {
                const isEmotionalExpression =
                    /^(我|小梦|梦梦|哥哥|姐姐|亲爱的)[，,，, ]./.test(text) ||
                    /^我.+?(累|烦|难(过)?|伤心|困|压力|焦虑|难过|委屈|开心|高兴|生气|崩溃|难受|心疼)/.test(text) ||
                    /^我[^，,，。.]{0,20}[累烦难伤心困压力焦虑累].{0,10}$/.test(text) ||
                    /^我[好很真太挺越].{0,10}[累烦难困压力大焦虑累]/u.test(text);

                if (isEmotionalExpression) {
                    return { type: 'chat', confidence: 0.95, reason: 'emotional_support' };
                }
            }
        }
        return null;
    }

    /**
     * @description 检测闲聊前缀 - "小梦，xxx" 等招呼语路由到 chat
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果 { type, confidence, reason } 或 null
     */
    detectChatPrefix(text) {
        if (/^小梦[,，]?/.test(text) && text.length < 30 && !/打开|搜索|帮我|订|查|找/.test(text)) {
            return { type: 'chat', confidence: 0.92, reason: 'xiaomeng_prefix_chat' };
        }

        for (const keyword of CHAT_OVERRIDE_KEYWORDS) {
            if (text.toLowerCase().includes(keyword.toLowerCase())) {
                const afterKeyword = text.replace(/^小梦[,，]?\s*/, '');
                const hasTaskIntent = /^(帮我|请|帮我|打开|搜索|查|找|订|买)/.test(afterKeyword) ||
                    /^(打开|搜索|帮我|订|查|找|买|整理|清理)/.test(afterKeyword);

                if (!hasTaskIntent || afterKeyword.length < 10) {
                    return { type: 'chat', confidence: 0.9, reason: 'chat_override' };
                }
            }
        }
        return null;
    }

    /**
     * @description 检测英文任务关键词
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果 { type, confidence, reason } 或 null
     */
    detectEnglishKeyword(text) {
        const lower = text.toLowerCase();
        for (const keyword of TASK_KEYWORDS_EN) {
            if (lower.includes(keyword.toLowerCase())) {
                return { type: 'task', confidence: 0.7, reason: 'task_keyword_en' };
            }
        }
        return null;
    }

    /**
     * @description 检测中文任务关键词
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果 { type, confidence, reason } 或 null
     */
    detectChineseKeyword(text) {
        for (const keyword of TASK_KEYWORDS) {
            if (text.includes(keyword)) {
                return { type: 'task', confidence: 0.7, reason: 'task_keyword' };
            }
        }
        return null;
    }

    /**
     * @description 检测复杂推理关键词 - 编程、算法、推理等需要更强模型的意图
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果 { type, confidence, reason } 或 null
     */
    detectComplex(text) {
        const lower = text.toLowerCase();
        for (const keyword of COMPLEX_KEYWORDS) {
            if (lower.includes(keyword.toLowerCase())) {
                return { type: 'complex', confidence: 0.75, reason: 'complex_keyword' };
            }
        }
        return null;
    }
}

module.exports = new IntentDetector();
module.exports.TASK_KEYWORDS = TASK_KEYWORDS;
module.exports.TASK_KEYWORDS_EN = TASK_KEYWORDS_EN;
module.exports.COMPLEX_KEYWORDS = COMPLEX_KEYWORDS;