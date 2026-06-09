/**
 * @file content_filter.js
 * @description 内容过滤器 - 根据关键词匹配新闻分类、过滤相关条目和去重
 * @module services/newsService
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 关键词到 RSS 分类的映射
// ============================================================

/** 主题关键词到 RSS 源分类的映射 */
const KEYWORD_TO_CATEGORIES = {
    '时政要闻': ['要闻', '时政'],
    '国际动态': ['国际'],
    '科技财经': ['财经', '科技'],
    '社会民生': ['社会', '健康', '教育'],
    '体育娱乐': ['体育', '文娱']
};

/** 主题关键词正则匹配模式 */
const KEYWORD_PATTERNS = {
    '时政要闻': /习近平|国务院|中央|人大|政协|政策|法规|法律|会议|会谈|会晤|元首|中纪委|纪委|反腐|干部|党员|政治局/,
    '国际动态': /美国|俄罗斯|欧盟|日本|韩国|国际|外交|北约|联合国|战争|冲突|伊朗|朝鲜|乌克兰|特朗普|拜登/,
    '科技财经': /科技|AI|人工智能|芯片|华为|苹果|股市|经济|金融|投资|房价|油价|航天|火箭|卫星|小米|雷军|特斯拉|汽车|新能源|电动车|发布|售价/,
    '社会民生': /教育|医疗|就业|住房|养老|社保|民生|天气|灾害|疫情|事故|犯罪|健康|疾病|安全|老师|学生|高考/,
    '体育娱乐': /足球|篮球|NBA|世界杯|奥运|冠军|电影|电视剧|明星|演唱会|综艺|娱乐|体育|比赛|夺冠/
};

class ContentFilter {
    /**
     * @description 根据查询关键词匹配对应的 RSS 分类，无匹配时返回全部分类
     * @param {string} query - 用户查询关键词
     * @returns {Array<string>} 匹配的 RSS 分类列表
     */
    matchCategories(query) {
        const matched = new Set();
        for (const [cat, pattern] of Object.entries(KEYWORD_PATTERNS)) {
            if (pattern.test(query)) {
                const feeds = KEYWORD_TO_CATEGORIES[cat] || [];
                feeds.forEach(f => matched.add(f));
            }
        }
        // 无匹配时返回全部分类，确保不会漏掉新闻
        if (matched.size === 0) {
            Object.values(KEYWORD_TO_CATEGORIES).flat().forEach(f => matched.add(f));
        }
        return [...matched];
    }

    /**
     * @description 判断新闻条目是否与查询关键词相关
     * @param {Object} item - 新闻条目
     * @param {string} item.title - 标题
     * @param {string} item.summary - 摘要
     * @param {string} query - 查询关键词
     * @returns {boolean} 是否相关
     */
    isRelevant(item, query) {
        if (!query) return true;
        const q = query.toLowerCase();
        const text = `${item.title} ${item.summary}`.toLowerCase();
        const keywords = q
            .split(/[\s,，、]+/)
            .map(k => k.trim())
            .filter(k => k.length > 1 && !['新闻', '资讯', '最新', '热点', '消息'].includes(k));
        if (keywords.length === 0) return true;
        return keywords.some(k => text.includes(k));
    }

    /**
     * @description 按标题去重，使用标题前10个中文字符作为去重键
     * @param {Array<Object>} items - 新闻条目列表
     * @returns {Array<Object>} 去重后的列表
     */
    deduplicate(items) {
        const seen = new Set();
        return items.filter(item => {
            // 取标题前10个中文字符作为去重键，避免因标点/数字差异导致重复
            const key = item.title.replace(/[^一-鿿]/g, '').substring(0, 10);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}

module.exports = new ContentFilter();