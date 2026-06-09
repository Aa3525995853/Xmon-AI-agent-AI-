/**
 * @file pattern_matcher.js
 * @description 模式匹配器 - 使用正则表达式匹配中文/英文任务模式和代码审查模式
 * @module intentClassifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/** 中文任务模式正则列表 - 覆盖操作指令、订票、Excel操作、文件操作等 */
const TASK_PATTERNS = [
    // 中文模式
    /^(帮我|请帮|麻烦帮|能不能帮|可以帮).+/,
    /^(打开|启动|运行|执行).+/,
    /^(搜索|查找|查一下|搜一下).+/,
    /^(整理|清理|删除|移动|复制).+/,
    /^(下载|安装|卸载).+/,
    /^(设置|修改|更改|调整).+/,
    /帮我(打开|启动|搜索|查找|整理|清理|下载|安装|发送|翻译)/,
    /(浏览器|网页|网站)(打开|搜索|访问)/,
    /(桌面|文件|文件夹)(整理|清理)/,
    /查一下?(今天的)?(天气|新闻|股价|汇率)/,
    /设个?(闹钟|提醒|定时)/,
    /(截图|录屏|截个图)/,
    /(关机|重启|锁屏)/,
    // 订票相关模式
    /(帮我|我想|我要|帮我买|帮我订).*(火车票|高铁票|机票|飞机票)/,
    /从(.+)到(.+)的?(火车|高铁|飞机|航班)/,
    /(火车票|高铁票|机票)(多少钱|查询|查看)/,
    /(去|到)(北京|上海|广州|深圳|杭州|南京|武汉|西安|成都|重庆|天津|郑州|长沙)/,
    /(几点的|哪个便宜|票价多少|多少钱).*(火车|高铁|飞机|航班)/,
    /(.+)到(.+)去/,
    /^火车票/,
    /^高铁票/,
    /^机票/,
    // Excel/文档操作
    /帮我(整理|分析|统计|汇总|计算)/,
    /做个?(表格|统计|汇总)/,
    /把这些(数据|内容)(整理|统计|汇总)/,
    /(Excel|表格)(怎么做|怎么弄)/,
    /生成(表格|报告|清单)/,
    // 快捷操作
    /帮我把(.+)(改成|改成|删掉|删除|移动)/,
    /把这个(.+)发给你/,
    /把这些(.+)发给我/,
    /帮我算一下/,
    /算算(.+)多少钱/,
    // 信息查询
    /(现在|今天|明天|这周)(多少|股价|汇率|天气)/,
    /查一下(.+)的(快递|订单|物流)/,
    // 文件操作
    /(桌面|文档|文件夹)(新建|创建)/,
    /帮我(建个|创建)文件夹/,
    /把这个(.+)复制到/,
    // 快捷下达
    /^设(.+)$/,
    /^做(.+)$/,
    /^发(.+)$/,
    /^查(.+)$/,
    /^搜(.+)$/
];

/** 英文任务模式正则列表 */
const TASK_PATTERNS_EN = [
    /^(open|launch|start|run|execute|launch)\s+\w+/i,
    /^(search|find|look up|google|check)\s+/i,
    /^(play|pause|stop|restart)\s+/i,
    /^(download|install|uninstall|delete|remove)\s+/i,
    /^(send|email|message)\s+/i,
    /^(take|grab)\s+(screenshot|screen)/i,
    /^(shutdown|reboot|restart|lock)\s+/i,
    /^(set|create|add|make)\s+(reminder|alarm|note|task)/i,
    /^(please|can you|could you|would you)\s+(open|search|find|help)/i,
    /help me (open|search|find|download|with)/i,
    /book\s+(a\s+)?(ticket|flight|train|hotel)/i,
    /buy\s+(ticket|flight|train)/i,
    /check\s+(weather|news|email)/i,
    /what'?s\s+(the\s+)?(weather|forecast)/i,
    /how'?s\s+(the\s+)?(weather|forecast)/i,
    /show\s+me\s+(the\s+)?(news|weather|forecast)/i
];

/** 代码审查模式正则列表 - 匹配代码审查相关的请求 */
const CODE_REVIEW_PATTERNS = [
    /^帮我.*代码.*/,
    /^帮我看看?这段?代码/,
    /^帮我检查?代码/,
    /^帮我分析?代码/,
    /^帮我看看有没有bug/,
    /^帮我检查一下代码/,
    /.*代码.*有没有错误/,
    /.*代码.*有问题/,
    /.*代码.*有bug/,
    /^检查一下?这段?代码/,
    /^看看这段代码/,
    /^看看这个代码/,
    /^看看代码/,
    /^分析一下?这段?代码/,
    /^没有用.*代码/,
    /代码有没有问题/,
    /代码有没有bug/,
    /这段代码有问题吗/,
    /这个代码有问题吗/,
    /这段代码有错误吗/,
    /代码.*错误.*吗/
];

class PatternMatcher {
    /**
     * @description 匹配代码审查模式 - 代码审查请求路由到 chat（由 Mimo 处理）
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果 { type, confidence, reason } 或 null
     */
    matchCodeReview(text) {
        for (const pattern of CODE_REVIEW_PATTERNS) {
            if (pattern.test(text)) {
                return { type: 'chat', confidence: 0.9, reason: 'code_review_simple' };
            }
        }
        return null;
    }

    /**
     * @description 匹配英文任务模式
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果 { type, confidence, reason } 或 null
     */
    matchEnglishPattern(text) {
        for (const pattern of TASK_PATTERNS_EN) {
            if (pattern.test(text)) {
                return { type: 'task', confidence: 0.85, reason: 'pattern_match_en' };
            }
        }
        return null;
    }

    /**
     * @description 匹配中文任务模式
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果 { type, confidence, reason } 或 null
     */
    matchChinesePattern(text) {
        for (const pattern of TASK_PATTERNS) {
            if (pattern.test(text)) {
                return { type: 'task', confidence: 0.85, reason: 'pattern_match' };
            }
        }
        return null;
    }
}

module.exports = new PatternMatcher();
module.exports.TASK_PATTERNS = TASK_PATTERNS;
module.exports.TASK_PATTERNS_EN = TASK_PATTERNS_EN;