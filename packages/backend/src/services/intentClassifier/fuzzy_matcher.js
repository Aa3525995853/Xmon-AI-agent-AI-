/**
 * @file fuzzy_matcher.js
 * @description 模糊匹配器 - 使用 Levenshtein 编辑距离和变体词表进行容错匹配
 * @module intentClassifier
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

/** 模糊匹配相似度阈值 - 低于此值不认为匹配成功 */
const FUZZY_SIMILARITY_THRESHOLD = 0.6;

/** 编辑距离匹配相似度阈值 - 短文本专用 */
const LEVENSHTEIN_SIMILARITY_THRESHOLD = 0.7;

/**
 * @description 计算两个字符串的 Levenshtein 编辑距离
 * @param {string} str1 - 字符串1
 * @param {string} str2 - 字符串2
 * @returns {number} 编辑距离（非负整数）
 */
function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
            }
        }
    }
    return dp[m][n];
}

/** 模糊匹配模式词表 - 每个标准词对应多个常见错别字/拼音变体 */
const FUZZY_PATTERNS = [
    // 打开类
    { canonical: '打开', variants: ['打关', '打茩', '打汗', '打开', 'dakai'] },
    { canonical: '启动', variants: ['启动', '起动', '启恸', 'qidong'] },
    { canonical: '运行', variants: ['云行', '运兴', '晕行'] },
    // 搜索类
    { canonical: '搜索', variants: ['搜素', '搜繪', 'sosuo', 'sousuo'] },
    { canonical: '查找', variants: ['查址', 'cha zhao'] },
    // 操作类
    { canonical: '整理', variants: ['整里', '整李', 'zhengli'] },
    { canonical: '删除', variants: ['册除', '删徐', 'shanchu'] },
    { canonical: '移动', variants: ['移恸', '移云'] },
    { canonical: '复制', variants: ['复致', '复製'] },
    { canonical: '重命名', variants: ['重命名', '仲命名', '重新命名'] },
    // 快捷类
    { canonical: '帮我', variants: ['邦我', '扮我', 'bangwo', '帮v'] },
    { canonical: '设个', variants: ['设个', '设介', '设個'] },
    { canonical: '做个', variants: ['做個', 'zuo个'] },
    { canonical: '查一下', variants: ['查一吓', '查了下', 'cha一下'] },
    // 办公类
    { canonical: '表格', variants: ['表格', 'biaoge', 'excell'] },
    { canonical: '文档', variants: ['文档', '文挡', 'wendang'] },
    { canonical: '生成', variants: ['生成', 'shengcheng'] },
    { canonical: '总结', variants: ['总结', '总解', 'zongjie'] },
    // 文件操作
    { canonical: '桌面', variants: ['桌面', '卓面', 'zhuomian'] },
    { canonical: '文件夹', variants: ['文件夹', '文件碥', 'wenjianjia'] },
    { canonical: '下载', variants: ['下載', 'xiazai', 'xia zai'] }
];

class FuzzyMatcher {
    /**
     * @description 模糊匹配 - 综合使用包含匹配和编辑距离匹配
     * @param {string} text - 用户输入文本
     * @returns {Object|null} 匹配结果 { canonical, similarity } 或 null
     */
    match(text) {
        if (!text || text.length < 3) return null;

        const lowerText = text.toLowerCase();
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const fp of FUZZY_PATTERNS) {
            for (const variant of fp.variants) {
                // 全包含匹配
                if (lowerText.includes(variant.toLowerCase())) {
                    const similarity = variant.length / Math.max(lowerText.length, variant.length);
                    if (similarity > bestSimilarity) {
                        bestSimilarity = similarity;
                        bestMatch = fp.canonical;
                    }
                }

                // 编辑距离匹配（仅对短文本启用，长文本计算代价过高）
                if (text.length <= 10 && variant.length <= 10) {
                    const dist = levenshteinDistance(lowerText.replace(/\s/g, ''), variant.toLowerCase().replace(/\s/g, ''));
                    const maxLen = Math.max(lowerText.replace(/\s/g, '').length, variant.length);
                    const similarity = 1 - dist / maxLen;

                    if (similarity > LEVENSHTEIN_SIMILARITY_THRESHOLD && similarity > bestSimilarity) {
                        bestSimilarity = similarity;
                        bestMatch = fp.canonical;
                    }
                }
            }
        }

        if (bestMatch && bestSimilarity > FUZZY_SIMILARITY_THRESHOLD) {
            return { canonical: bestMatch, similarity: bestSimilarity };
        }
        return null;
    }
}

module.exports = new FuzzyMatcher();