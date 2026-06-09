/**
 * @file profile_extractor.js
 * @description 画像信息提取器 - 从对话中提取用户信息（姓名、职业、兴趣、性格、重要事情等）
 * @module services/user_profile_learner
 * @author xiaomeng
 * @version 1.3.0
 * @date 2026-06-09
 */

const { logger } = require('../../utils/logger');

/**
 * @description 智能文本分割器 - 将自然语言中的列表分割为独立项
 * @param {string} text - 待分割文本
 * @returns {Array<string>} 分割后的项目列表
 */
function smartSplit(text) {
    if (!text) return [];
    // 常见分隔符：和、以及、以及、或者、或、/
    const separators = /[、，,和与以及或者或\/]+/g;
    return text.split(separators)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 30); // 过滤空项和超长项
}

/**
 * @description 清理提取的值 - 去除无关字符和词缀
 * @param {string} value - 原始值
 * @returns {string} 清理后的值
 */
function cleanValue(value) {
    if (!value || typeof value !== 'string') return '';
    return value
        .replace(/^(一个|一名|一位|我是|我叫|我的)\s*/, '') // 去除前缀
        .replace(/^(的|在|住在|位于|来自)\s*/, '') // 去除开头的"的"
        .replace(/\s*(是|在|住在|位于|来自)\s*$/, '') // 去除后缀
        .replace(/^喜欢\s*/, '') // 去除开头的"喜欢"
        .replace(/^爱\s*/, '') // 去除开头的"爱"
        .replace(/^爱吃\s*/, '') // 去除开头的"爱吃"
        .replace(/^最爱\s*/, '') // 去除开头的"最爱"
        .replace(/^业余时间\s*/, '') // 去除"业余时间"
        .replace(/^平时\s*/, '') // 去除"平时"
        .replace(/^我很\s*/, '') // 去除"我很"
        .replace(/^我有点\s*/, '') // 去除"我有点"
        .replace(/\s+$/, '') // 去除末尾空格
        .replace(/^[：:,\s]+/, '') // 去除开头的冒号、逗号、空格
        .trim();
}

/**
 * @description 判断是否为无效的兴趣项
 * @param {string} value - 待检测值
 * @returns {boolean} 是否无效
 */
function isInvalidInterest(value) {
    if (!value || value.length < 2) return true;
    // 排除包含这些词的值
    const invalidPatterns = ['的零食是', '零食是', '喜欢', '爱好', '平时', '业余', '的是', '事情是'];
    if (invalidPatterns.some(p => value.includes(p))) return true;
    // 排除纯助词或短句
    if (['和', '或', '与', '以及'].includes(value)) return true;
    return false;
}

/**
 * @description 判断是否为无效的性格描述
 * @param {string} value - 待检测值
 * @returns {boolean} 是否无效
 */
function isInvalidPersonality(value) {
    if (!value || value.length < 2) return true;
    // 排除包含这些词的值
    const invalidPatterns = ['喜欢', '爱好', '平时', '业余', '的是', '性格是', '有点'];
    if (invalidPatterns.some(p => value.includes(p))) return true;
    return false;
}

/**
 * @description 判断是否为有效的职业名称
 * @param {string} value - 待检测值
 * @returns {boolean} 是否有效
 */
function isValidOccupation(value) {
    if (!value || value.length < 2) return false;
    // 排除城市名和无效词
    const invalidPatterns = ['在北京', '在上海', '在广州', '在深圳', '在工作', '在住', '个自由'];
    if (invalidPatterns.some(p => value.includes(p))) return false;

    // 常见职业关键词 - 必须包含这些词之一才是有效职业
    const validKeywords = [
        '工程师', '经理', '设计师', '教师', '医生', '律师', '会计', '销售', '市场', '运营',
        '产品', '开发', '测试', '运维', '顾问', '自由职业', '个体户', '老板', '学生', '退休',
        '司机', '厨师', '服务员', '记者', '编辑', '主播', '网红', '自媒体',
        '架构师', '数据分析师', '产品经理', '项目经理', 'HR', '人事', '行政', '财务',
        '前端', '后端', '全栈', '算法', 'DBA', '安全',
        '公务员', '银行', '柜员', '行长', '信贷', '投行', '基金', '证券'
    ];
    // 必须包含职业关键词，或是被验证过的已知职业名称
    return validKeywords.some(k => value.includes(k));
}

class ProfileExtractor {
    constructor() {
        this.knownOccupations = [
            '软件工程师', '前端工程师', '后端工程师', '全栈工程师', '算法工程师',
            '产品经理', '项目经理', 'UI设计师', 'UX设计师', '平面设计师',
            '教师', '医生', '律师', '会计师', '销售', '市场专员', '运营',
            '自由职业者', '个体户', '老板', '学生', '退休人员',
            '司机', '厨师', '服务员', '记者', '编辑', '主播', '自媒体',
            '架构师', '数据分析师', 'HR', '人事', '行政', '财务', '银行'
        ];

        // 性格关键词
        this.personalityKeywords = [
            '内向', '外向', '开朗', '稳重', '活泼', '乐观', '积极', '消极',
            '敏感', '细腻', '大大咧咧', '随和', '固执', '倔强', '温柔', '刚强',
            '幽默', '风趣', '严肃', '认真', '细心', '粗心', '耐心', '急躁',
            '低调', '高调', '自信', '自卑', '独立', '依赖', '果断', '犹豫',
            '善良', '真诚', '正直', '诚信', '守信', '慷慨', '吝啬', '大方',
            '理性', '感性', '务实', '理想主义', '完美主义', '随性', '自律'
        ];

        // 重要事情关键词
        this.importantEventKeywords = [
            '重要', '关键', '必须', '一定要', '不能忘', '千万别', '记住',
            'flag', 'FLAG', '待办', 'todo', 'TODO', '计划', '目标', '梦想',
            '愿望', '梦想', '理想', '任务', '事情', '约会', '会议', 'deadline'
        ];

        // 纪念日关键词
        this.anniversaryKeywords = [
            '生日', '纪念日', '周年', '结婚纪念', '相识', '相遇', '第一次',
            '情人节', '七夕', '跨年', '过年', '春节', '中秋', '端午',
            '毕业', '入职', '升职', '获奖', '里程碑'
        ];

        // 开心/高兴关键词
        this.happyKeywords = [
            '开心', '高兴', '快乐', '愉快', '喜悦', '兴奋', '激动', '欢呼',
            '太棒了', '太好了', '完美', '完美', '爽', '嗨', 'happy', 'joy',
            '好开心', '好高兴', '好快乐', '超开心', '超高兴', '简直开心',
            '终于', '成功了', '通过了', '拿到了', '中了', '中了彩票',
            '升职了', '加薪了', '脱单了', '结婚了', '怀孕了', '毕业了',
            '被表扬', '被认可', '被夸', '被羡慕', '被嫉妒'
        ];

        // 难过/伤心关键词
        this.sadKeywords = [
            '难过', '伤心', '痛苦', '难受', '郁闷', '沮丧', '失落', '绝望',
            '心碎', '崩溃', '哭', '流泪', '想哭', '悲伤', '哀伤', '凄凉',
            '好难过', '好伤心', '好痛苦', '太难了', '太痛苦了', '心塞',
            '失望', '挫败', '失败', '落空', '泡汤', '黄了', '凉了',
            '分手', '离婚', '失业', '被裁', '被骂', '被拒绝', '被嫌弃',
            '考试没考好', '失恋', '生病', '亲人去世', '狗狗死了', '猫猫走了'
        ];

        // 生气/愤怒关键词
        this.angryKeywords = [
            '生气', '愤怒', '气愤', '恼火', '发火', '火大', '火冒三丈',
            '不爽', '不爽', '讨厌', '恨', '讨厌', '厌恶', '反感',
            '好气', '太气了', '气死了', '气死我了', '无语', '无语了',
            '被气到', '被惹', '被坑', '被骗', '被耍', '被坑了',
            '不公平', '不合理', '太过分', '太过分了', '无语'
        ];
    }

    /**
     * @description 从对话中提取用户信息
     * @param {Object|string} conversation - 对话对象或文本
     * @returns {Promise<Object>} 提取结果
     */
    async extract(conversation) {
        const extracted = {
            name: null,
            nickname: null,
            occupation: null,
            location: null,
            interests: [],
            personality: [],
            importantEvents: [],
            anniversaries: [],
            happyMoments: [],
            sadMoments: [],
            angryMoments: [],
            preferences: {}
        };

        // 获取消息文本
        const texts = this._getTextFromConversation(conversation);

        for (const text of texts) {
            // 提取姓名 - 只从"我叫"模式提取（"我是XX"用于职业，不用于姓名）
            const nameMatch = text.match(/我叫\s*([^\s，。！？,，]+?)(?:\s*[,，]|叫我|就行|好|$)/);
            if (nameMatch && nameMatch[1]) {
                const name = cleanValue(nameMatch[1]);
                // 验证提取的是否是有效姓名（不能是职业关键词）
                if (!isValidOccupation(name)) {
                    extracted.name = name;
                }
            }

            // 提取昵称
            const nicknameMatch = text.match(/(?:叫我|绰号|昵称)\s*([^\s，。！？,，]+?)(?:\s*[,，]|就行|好|$)/);
            if (nicknameMatch && nicknameMatch[1]) {
                extracted.nickname = cleanValue(nicknameMatch[1]);
            }

            // 提取职业 - 多种模式
            this.extractOccupation(text, extracted);

            // 提取位置（可选）
            this.extractLocation(text, extracted);

            // 提取兴趣
            this.extractInterests(text, extracted);

            // 提取性格特点
            this.extractPersonality(text, extracted);

            // 提取重要事情
            this.extractImportantEvents(text, extracted);

            // 提取纪念日
            this.extractAnniversaries(text, extracted);

            // 提取情绪记忆（开心、难过、生气的事）
            this.extractEmotionMemories(text, extracted);

            // 提取食物偏好
            this.extractFoodPreferences(text, extracted);
        }

        // 去重并过滤无效项
        extracted.interests = this.deduplicateInterests(extracted.interests.filter(i => !isInvalidInterest(i)));
        extracted.personality = this.deduplicateInterests(extracted.personality.filter(i => !isInvalidPersonality(i)));
        extracted.importantEvents = this.deduplicateList(extracted.importantEvents);
        extracted.anniversaries = this.deduplicateList(extracted.anniversaries);
        extracted.happyMoments = this.deduplicateList(extracted.happyMoments);
        extracted.sadMoments = this.deduplicateList(extracted.sadMoments);
        extracted.angryMoments = this.deduplicateList(extracted.angryMoments);

        if (extracted.preferences.food) {
            extracted.preferences.food = [...new Set(extracted.preferences.food.filter(f => f && f.length > 1))];
        }

        return extracted;
    }

    /**
     * @description 智能去重相似兴趣项
     * @param {Array<string>} interests - 兴趣列表
     * @returns {Array<string>} 去重后的兴趣列表
     */
    deduplicateInterests(interests) {
        const result = [];
        const seen = new Set();

        for (const item of interests) {
            // 标准化：去除前缀"喜欢"、"爱"等
            const normalized = item.replace(/^(喜欢|爱)\s*/, '').toLowerCase();

            // 检查是否与已添加的项相似
            let isSimilar = false;
            for (const existing of result) {
                const existingNorm = existing.replace(/^(喜欢|爱)\s*/, '').toLowerCase();
                // 完全相同
                if (normalized === existingNorm) {
                    isSimilar = true;
                    break;
                }
                // 包含关系（保留更长的那个）
                if (normalized.includes(existingNorm) && existing.length < item.length) {
                    const idx = result.indexOf(existing);
                    result[idx] = item;
                    isSimilar = true;
                    break;
                }
                if (existingNorm.includes(normalized) && item.length < existing.length) {
                    isSimilar = true;
                    break;
                }
            }

            if (!isSimilar && !seen.has(normalized)) {
                result.push(item);
                seen.add(normalized);
            }
        }

        return result;
    }

    /**
     * @description 通用去重方法 - 按字符串标准化后去重
     * @param {Array<string>} items - 项目列表
     * @returns {Array<string>} 去重后的列表
     */
    deduplicateList(items) {
        const seen = new Set();
        const result = [];
        for (const item of items) {
            const normalized = item.trim().toLowerCase();
            if (normalized && !seen.has(normalized)) {
                seen.add(normalized);
                result.push(item.trim());
            }
        }
        return result;
    }

    /**
     * @description 提取职业信息
     * @param {string} text - 文本
     * @param {Object} extracted - 提取结果对象
     */
    extractOccupation(text, extracted) {
        // 模式1: "我是一名XX" 或 "我是个XX" 或 "我是XX" - 跳过量词
        const pattern1 = text.match(/我(?:是|做)(?:一个?|名)?\s*([^\s，。！？,，]+?)(?:[,，。]|工作|$)/);
        if (pattern1 && pattern1[1]) {
            let value = pattern1[1];
            // 去除开头的"名"字
            value = value.replace(/^名/, '');
            value = cleanValue(value);
            if (isValidOccupation(value) && value.length <= 10 && value.length >= 2) {
                extracted.occupation = value;
                return;
            }
        }

        // 模式2: 已知职业列表匹配
        for (const job of this.knownOccupations) {
            // 优先匹配完整职业名称
            const fullMatch = text.match(new RegExp(`(?:我(?:是|做)|从事|担当)(?:一个?|名)?\\s*${job}`));
            if (fullMatch) {
                extracted.occupation = job;
                return;
            }
        }

        // 模式3: "从事XX工作" 或 "做XX工作"
        const pattern3 = text.match(/(?:从事|做)([^\s，。！？,，]+?)(?:工作|行业)/);
        if (pattern3 && pattern3[1]) {
            const value = cleanValue(pattern3[1]);
            if (isValidOccupation(value)) {
                extracted.occupation = value;
            }
        }
    }

    /**
     * @description 提取位置信息
     * @param {string} text - 文本
     * @param {Object} extracted - 提取结果对象
     */
    extractLocation(text, extracted) {
        // 常见后缀关键词
        const locationSuffixes = ['市', '区', '县', '省', '镇', '城', '街', '路', '村', '嘴', '开发区', '园区'];

        // 模式1: 匹配有标准后缀的位置
        const pattern1 = /(?:住在|在|位于|来自|家住)\s*([^\s，。！？,，]+?(?:市|区|县|省|镇|城|街|路|村|嘴|开发区|园区))/;
        const match1 = text.match(pattern1);
        if (match1 && match1[1]) {
            let value = match1[1].replace(/^住/, '');
            if (value.length >= 3 && value.length <= 20) {
                extracted.location = cleanValue(value);
                return;
            }
        }

        // 模式2: 匹配 "XX区" 如 "天河区"、"浦东新区"
        const pattern2 = /([^\s，。！？,，]+?(?:区|开发区|园区))/;
        const match2 = text.match(pattern2);
        if (match2 && match2[1] && match2[1].length >= 3) {
            extracted.location = match2[1];
            return;
        }

        // 模式3: 匹配 "XX路XX号" 或 "XX街XX号"
        const pattern3 = /(?:住在|在|位于|来自|家住)\s*([^\s，。！？,，]+?(?:路|街)\d*号?)/;
        const match3 = text.match(pattern3);
        if (match3 && match3[1]) {
            let value = match3[1].replace(/^住/, '');
            if (value.length >= 3) {
                extracted.location = cleanValue(value);
                return;
            }
        }
    }

    /**
     * @description 提取兴趣信息
     * @param {string} text - 文本
     * @param {Object} extracted - 提取结果对象
     */
    extractInterests(text, extracted) {
        // 使用 Set 避免重复添加
        const foundInterests = new Set(extracted.interests.map(i => i.replace(/^(喜欢|爱)\s*/, '').toLowerCase()));

        // 常见兴趣关键词
        const interestKeywords = [
            '打篮球', '游泳', '跑步', '健身', '瑜伽', '爬山', '骑行',
            '摄影', '画画', '弹吉他', '钢琴', '吉他', '唱歌', '跳舞',
            '写代码', '编程', '游戏', '电竞', '小说', '阅读', '写作',
            '研究股票', '投资', '理财', '炒股',
            '旅游', '旅行', '户外', '露营', '滑雪', '冲浪',
            '美食', '烹饪', '做饭', '烘焙', '咖啡',
            '电影', '追剧', '美剧', '日剧', '动漫',
            '养宠物', '遛狗', '猫', '狗',
            '园艺', '养花', '种植', '手工', 'DIY'
        ];

        // 检查是否包含兴趣关键词
        for (const keyword of interestKeywords) {
            const normalized = keyword.toLowerCase();
            if (text.includes(keyword) && !text.includes('不喜欢') && !text.includes('讨厌') && !foundInterests.has(normalized)) {
                extracted.interests.push(keyword);
                foundInterests.add(normalized);
            }
        }

        // 模式: "喜欢XX和XX" 或 "爱好XX、XX"
        const pattern = text.match(/(?:喜欢|爱好)\s*([^\s，。！？,，]+)/);
        if (pattern && pattern[1]) {
            const items = smartSplit(pattern[1]);
            for (const item of items) {
                const cleaned = cleanValue(item);
                const normalized = cleaned.toLowerCase();
                if (cleaned.length > 1 && cleaned.length < 10 && !isInvalidInterest(cleaned) && !foundInterests.has(normalized)) {
                    extracted.interests.push(cleaned);
                    foundInterests.add(normalized);
                }
            }
        }
    }

    /**
     * @description 提取食物偏好
     * @param {string} text - 文本
     * @param {Object} extracted - 提取结果对象
     */
    extractFoodPreferences(text, extracted) {
        // 常见食物关键词
        const foodKeywords = [
            '川菜', '湘菜', '粤菜', '鲁菜', '苏菜', '浙菜', '闽菜', '徽菜', '京菜',
            '火锅', '烧烤', '烤肉', '炸鸡', '汉堡', '披萨', '寿司', '韩餐', '日料',
            '麻辣烫', '串串', '小龙虾', '海鲜', '自助餐', '甜品', '蛋糕', '奶茶',
            '咖啡', '茶', '果汁', '坚果', '巧克力', '冰淇淋', '面包', '面条', '米饭',
            '素食', '轻食', '沙拉', '水果', '零食', '小吃', '早餐', '夜宵'
        ];

        // 检查是否包含食物关键词
        for (const keyword of foodKeywords) {
            if (text.includes(keyword) && !text.includes('不喜欢') && !text.includes('讨厌')) {
                const cleaned = keyword.replace(/^喜欢\s*/, '').replace(/^爱吃\s*/, '');
                if (cleaned.length > 1) {
                    if (!extracted.preferences.food) {
                        extracted.preferences.food = [];
                    }
                    extracted.preferences.food.push(cleaned);
                }
            }
        }
    }

    /**
     * @description 提取性格特点
     * @param {string} text - 文本
     * @param {Object} extracted - 提取结果对象
     */
    extractPersonality(text, extracted) {
        const foundPersonality = new Set(extracted.personality.map(p => p.toLowerCase()));

        // 模式1: "我很XX" 或 "我有点XX" 或 "我是XX的人"
        const pattern1 = /(?:我很|我有点|我是.*的人|我的性格是|我性格)([^\s，。！？,，]+)/;
        const match1 = text.match(pattern1);
        if (match1 && match1[1]) {
            const items = smartSplit(match1[1]);
            for (const item of items) {
                const cleaned = cleanValue(item);
                if (cleaned.length >= 2 && cleaned.length <= 6 && !isInvalidPersonality(cleaned)) {
                    if (this.personalityKeywords.some(k => cleaned.includes(k))) {
                        if (!foundPersonality.has(cleaned.toLowerCase())) {
                            extracted.personality.push(cleaned);
                            foundPersonality.add(cleaned.toLowerCase());
                        }
                    }
                }
            }
        }

        // 模式2: 直接匹配性格关键词
        for (const keyword of this.personalityKeywords) {
            if (text.includes(keyword) && !foundPersonality.has(keyword.toLowerCase())) {
                // 检查是否在否定语境中
                if (!text.includes('不' + keyword) && !text.includes('不是' + keyword)) {
                    extracted.personality.push(keyword);
                    foundPersonality.add(keyword.toLowerCase());
                }
            }
        }
    }

    /**
     * @description 提取重要事情/待办事项
     * @param {string} text - 文本
     * @param {Object} extracted - 提取结果对象
     */
    extractImportantEvents(text, extracted) {
        // 模式1: "重要/关键的事情是XX" 或 "必须XX"
        const pattern1 = /(?:重要的事情|关键的事|必须|一定要|不能忘|千万别|记住|flag|FINDING)([^\s，。！？,，]+)/;
        const match1 = text.match(pattern1);
        if (match1 && match1[1]) {
            const items = smartSplit(match1[1]);
            for (const item of items) {
                const cleaned = cleanValue(item);
                if (cleaned.length >= 2 && cleaned.length <= 50 && !cleaned.includes('的是')) {
                    extracted.importantEvents.push(cleaned);
                }
            }
        }

        // 模式2: "我的计划是XX" 或 "我的目标是XX"
        const pattern2 = /(?:我的计划|我的目标|我的梦想|我的愿望)(?:是)?([^\s，。！？,，]+)/;
        const match2 = text.match(pattern2);
        if (match2 && match2[1]) {
            const items = smartSplit(match2[1]);
            for (const item of items) {
                const cleaned = cleanValue(item);
                if (cleaned.length >= 2 && cleaned.length <= 50) {
                    extracted.importantEvents.push(cleaned);
                }
            }
        }

        // 模式3: "待办/TO DO XX"
        const pattern3 = /(?:待办|todo|TODO)(?:事项)?[:：]?\s*([^\s，。！？,，]+)/;
        const match3 = text.match(pattern3);
        if (match3 && match3[1]) {
            const items = smartSplit(match3[1]);
            for (const item of items) {
                const cleaned = cleanValue(item);
                if (cleaned.length >= 2 && cleaned.length <= 50) {
                    extracted.importantEvents.push(cleaned);
                }
            }
        }
    }

    /**
     * @description 提取纪念日/重要日期
     * @param {string} text - 文本
     * @param {Object} extracted - 提取结果对象
     */
    extractAnniversaries(text, extracted) {
        // 模式1: "XX生日" 或 "XX纪念日" - 提取相关事件
        for (const keyword of this.anniversaryKeywords) {
            if (text.includes(keyword)) {
                // 尝试提取完整的事件描述
                const pattern = new RegExp(`([^，。！？,，]*${keyword}[^，。！？,，]*)`);
                const match = text.match(pattern);
                if (match && match[1]) {
                    const cleaned = cleanValue(match[1]);
                    if (cleaned.length >= 2 && cleaned.length <= 30) {
                        extracted.anniversaries.push(cleaned);
                    }
                }
            }
        }

        // 模式2: "我的XX是XX月XX日" - 提取具体日期信息
        const datePattern = /(?:我的|是)?\s*([^的\s]+)(?:生日|纪念日)(?:是|在|:|：)?\s*(\d{1,2}[月号]\d{1,2}[日号]?)/;
        const dateMatch = text.match(datePattern);
        if (dateMatch && dateMatch[1] && dateMatch[2]) {
            const event = cleanValue(dateMatch[1]) + '生日';
            const date = dateMatch[2];
            extracted.anniversaries.push(`${event}（${date}）`);
        }
    }

    /**
     * @description 提取情绪记忆（开心、难过、生气的事）
     * @param {string} text - 文本内容
     * @param {Object} extracted - 提取结果对象
     */
    extractEmotionMemories(text, extracted) {
        // 检测情绪类型和原因
        this.extractEmotionType(text, extracted, 'happy', this.happyKeywords);
        this.extractEmotionType(text, extracted, 'sad', this.sadKeywords);
        this.extractEmotionType(text, extracted, 'angry', this.angryKeywords);
    }

    /**
     * @description 提取特定情绪类型的事件
     * @param {string} text - 文本内容
     * @param {Object} extracted - 提取结果
     * @param {string} emotionType - 情绪类型（happy/sad/angry）
     * @param {Array<string>} keywords - 情绪关键词
     */
    extractEmotionType(text, extracted, emotionType, keywords) {
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                const idx = text.indexOf(keyword);
                let event = '';

                // 策略1：提取情绪词后面的原因（如"开心因为XXX"、"难过XXX"）
                const afterEmotion = text.substring(idx + keyword.length);
                const afterMatch = afterEmotion.match(/^([，。！？:：\s]*[^\s，。！？,，]{2,30})/);
                if (afterMatch) {
                    let afterText = afterMatch[1].replace(/^[，。！？:：\s]+/, '').trim();
                    if (afterText.length >= 2) {
                        event = afterText;
                    }
                }

                // 策略2：如果后面没内容，提取前面的原因
                if (!event) {
                    const beforeEmotion = text.substring(0, idx);
                    // 查找情绪词前面的有效内容
                    const beforeMatch = beforeEmotion.match(/([^\s，。！？,，]{2,30}\s*(?:被|因为|所以|导致|让我|使我|叫我|使我))[^\s，。！？,，]*$/);
                    if (beforeMatch) {
                        event = beforeMatch[1].replace(/\s+$/, '') + beforeEmotion.substring(beforeEmotion.lastIndexOf(beforeMatch[1]) + beforeMatch[1].length);
                    }
                }

                // 策略3：提取"XXX了"模式的完整事件
                if (!event) {
                    const completeMatch = text.match(/(.{0,20}(?:了|成功|通过|拿到|升职|加薪|脱单|结婚|毕业|中奖|分手|失业|被骗|被骂|被拒|狗狗|猫猫)[^，。！？,，]{0,10})/);
                    if (completeMatch) {
                        event = completeMatch[1].trim();
                    }
                }

                // 策略4：提取情绪词附近的内容作为描述
                if (!event) {
                    const start = Math.max(0, idx - 15);
                    const end = Math.min(text.length, idx + keyword.length + 15);
                    event = text.substring(start, end).replace(/^[，。！？:：\s]+/, '').replace(/[，。！？:：\s]+$/, '').trim();
                }

                // 清理并验证
                event = cleanValue(event);
                if (event.length >= 2 && event.length <= 50) {
                    // 添加情绪标签
                    const labeledEvent = `[${emotionType}] ${event}`;
                    extracted[`${emotionType}Moments`].push(labeledEvent);
                    break; // 每个文本只记录一次该情绪类型
                }
            }
        }
    }

    /**
     * @description 从对话对象中提取文本内容
     * @param {Object|string} conversation - 对话对象或文本
     * @returns {Array<string>} 文本内容数组
     */
    _getTextFromConversation(conversation) {
        const texts = [];

        if (typeof conversation === 'string') {
            texts.push(conversation);
        } else if (conversation.messages) {
            conversation.messages.forEach(msg => {
                if (msg.content) {
                    texts.push(msg.content);
                }
            });
        } else if (conversation.text) {
            texts.push(conversation.text);
        }

        return texts;
    }

    /**
     * @description 提取文本中的情感状态
     * @param {string} text - 文本内容
     * @returns {string} 情感类型（positive/negative/neutral）
     */
    extractEmotion(text) {
        const emotions = {
            positive: ['开心', '高兴', '喜欢', '棒', '好', 'love', 'happy'],
            negative: ['难过', '伤心', '生气', '烦', 'sad', 'angry'],
            neutral: []
        };

        const lowerText = text.toLowerCase();

        for (const [emotion, keywords] of Object.entries(emotions)) {
            if (keywords.some(k => lowerText.includes(k))) {
                return emotion;
            }
        }

        return 'neutral';
    }

    /**
     * @description 提取文本中的语气偏好
     * @param {string} text - 文本内容
     * @returns {string} 语气类型（formal/casual/friendly）
     */
    extractTonePreference(text) {
        const tones = {
            formal: ['正式', '商务', 'professional'],
            casual: ['随意', '轻松', 'casual'],
            friendly: ['友好', '温和', 'friendly']
        };

        for (const [tone, keywords] of Object.entries(tones)) {
            if (keywords.some(k => text.includes(k))) {
                return tone;
            }
        }

        return 'friendly';
    }
}

module.exports = new ProfileExtractor();