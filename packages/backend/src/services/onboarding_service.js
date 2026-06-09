/**
 * @file Onboarding 服务
 * @description 自然对话式首次体验，像交朋友一样先破冰再了解需求
 *              最小信息收集：称呼 + 使用场景
 * @module services/onboarding_service
 * @version 2.0.0
 * @date 2026-06-06
 */

const fs = require('fs');
const path = require('path');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../config/runtimePaths');

// ============================================================
// 常量定义
// ============================================================

/** UUID 正则表达式（用于多用户支持） */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Onboarding 实例缓存 */
const instances = new Map();

// ============================================================
// 工厂函数
// ============================================================

/**
 * 获取 Onboarding 服务实例（多用户支持）
 * @param {string} userId - 用户ID，默认 'legacy'
 * @returns {OnboardingService} Onboarding 服务实例
 */
function getOnboardingService(userId = 'legacy') {
    if (process.env.ENABLE_AUTH !== 'true') {
        return instances.get('legacy') || createLegacyInstance();
    }

    if (userId !== 'legacy' && !UUID_REGEX.test(userId)) {
        throw new Error('Invalid User ID format');
    }

    if (!instances.has(userId)) {
        instances.set(userId, new OnboardingService(userId));
    }
    return instances.get(userId);
}

/**
 * 创建遗留用户实例
 * @returns {OnboardingService} Onboarding 服务实例
 */
function createLegacyInstance() {
    if (!instances.has('legacy')) {
        instances.set('legacy', new OnboardingService('legacy'));
    }
    return instances.get('legacy');
}

/**
 * 清理指定用户的 Onboarding 缓存
 * @param {string} userId - 用户ID
 */
function clearOnboardingCache(userId) {
    if (instances.has(userId)) {
        instances.delete(userId);
        console.log(`[Onboarding] 已清理用户缓存: ${userId}`);
    }
}

// ============================================================
// OnboardingService 类
// ============================================================

/**
 * Onboarding 服务类
 * 负责首次体验引导，自然收集用户称呼和使用场景
 * @class
 */
class OnboardingService {
    /**
     * 构造函数
     * @param {string} userId - 用户ID
     */
    constructor(userId = 'legacy') {
        this.userId = userId;

        // 根据用户ID选择数据路径
        if (userId === 'legacy') {
            this.dataPath = dataPath('onboarding.json');
            this.profilePath = dataPath('user_profile.json');
        } else {
            this.dataPath = dataPath('users', `user_${userId}`, 'onboarding.json');
            this.profilePath = dataPath('users', `user_${userId}`, 'user_profile.json');
        }

        this.data = this.loadData();
    }

    /**
     * 从磁盘加载数据
     * @returns {Object} Onboarding 数据
     */
    loadData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const content = fs.readFileSync(this.dataPath, 'utf8');
                return JSON.parse(content);
            }
        } catch (e) {
            // 加载失败时返回默认数据
        }
        return this.getDefaultData();
    }

    /**
     * 获取默认数据
     * @returns {Object} 默认数据对象
     */
    getDefaultData() {
        return {
            completed: false,
            currentStep: 0,
            collectedInfo: {},
            startTime: null
        };
    }

    /**
     * 保存数据到磁盘
     */
    saveData() {
        try {
            const dataDir = path.dirname(this.dataPath);
            ensureDir(dataDir);
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {
            console.error('[Onboarding] 保存数据失败:', e.message);
        }
    }

    isCompleted() {
        return this.data.completed;
    }

    /**
     * 获取首次问候语 - 破冰 + 自然带出称呼问题
     */
    getFirstGreeting() {
        if (this.data.completed) {
            return null;
        }

        this.data.startTime = Date.now();
        this.data.currentStep = 1;
        this.saveData();

        // 第一句话 + 自然引出称呼问题
        const greeting = '嗨！我是小梦 🌟\n既是你的AI打工人，也是随时在线的数字伙伴。\n别客气，随便使唤我，我可是很厉害的~\n\n对了，以后怎么称呼你比较好呀？我叫你"老板"还是有个更亲切的名字？😄';

        return {
            text: greeting,
            isOnboarding: true,
            nextStep: 'collect_name'
        };
    }

    /**
     * 处理用户回复 - 根据当前步骤决定响应
     */
    processResponse(userInput) {
        if (this.data.completed) {
            return null;
        }

        const step = this.data.currentStep;

        switch (step) {
            case 1:
            case 2:
                return this.handleCollectName(userInput);
            case 3:
                return this.handleCollectScenario(userInput);
            default:
                // 首次交互，尝试提取名字
                if (!this.data.collectedInfo.name) {
                    return this.handleCollectName(userInput);
                }
                return this.handleCollectScenario(userInput);
        }
    }

    /**
     * 步骤1-2: 收集称呼
     */
    handleCollectName(userInput) {
        const info = this.data.collectedInfo;

        // 尝试从用户输入中提取名字
        const extractedName = this.extractName(userInput);
        if (extractedName) {
            info.name = extractedName;
            this.data.currentStep = 3;
            this.saveData();

            // 第二步：确认名字 + 问场景
            const scenarioQuestion = `好嘞，${info.name}，记住了！🤝\n\n为了以后更懂你，悄悄问一句：你平时最想让我帮你搞定哪类事儿？\n\n比如是\n📝 写文档/做表/写代码 — 这种烧脑的\n🔍 查资料/定闹钟/写邮件 — 这种琐碎的\n\n随便回个词就行，我好心里有数~`;

            return {
                text: scenarioQuestion,
                isOnboarding: true,
                nextStep: 'collect_scenario'
            };
        }

        // 没有提取到名字，继续问
        if (this.data.currentStep === 2) {
            this.data.currentStep = 3;
            this.saveData();
        } else {
            this.data.currentStep = 2;
            this.saveData();
        }

        const responses = [
            '哈哈，没听太清楚~你叫什么名字呀？直接告诉我就行~',
            '嗯？你说啥？我好像没记住...你叫什么来着？😄',
            '不好意思，刚才走神了~你叫什么名字呀？'
        ];

        return {
            text: responses[Math.floor(Math.random() * responses.length)],
            isOnboarding: true,
            nextStep: 'collect_name'
        };
    }

    /**
     * 从用户输入中提取名字
     */
    extractName(input) {
        // 清理输入
        let cleanInput = input.trim();

        // 后缀过滤 - 去掉常见的句尾词
        const suffixes = ['就行', '就好', '就成', '就好了', '好', '呀', '啊', '啦', '嘞', '呢', '呗', '哈', '呗', '嘛'];
        for (const suffix of suffixes) {
            if (cleanInput.endsWith(suffix)) {
                cleanInput = cleanInput.slice(0, -suffix.length);
                break;
            }
        }

        const patterns = [
            /叫我\s*([^\s，。！？.。,!！?？]{2,10})/,
            /我(?:叫|是|喊)\s*([^\s，。！？.。,!！?？]{2,10})/,
            /我的名字(?:叫|是)?\s*([^\s，。！？.。,!！?？]{2,10})/,
            /^([^\s，。！？.。,!！?？]{2,6})$/,
            /^(.{2,6})(?:好|呀|啊|啦|嘞)$/
        ];

        for (const pattern of patterns) {
            const match = cleanInput.match(pattern);
            if (match && match[1]) {
                let name = match[1].trim();
                // 再次清理后缀
                for (const suffix of suffixes) {
                    if (name.endsWith(suffix)) {
                        name = name.slice(0, -suffix.length);
                        break;
                    }
                }
                // 黑名单过滤
                const blacklist = ['一个', '那种', '真的', '因为', '所以', '但是', '就是', '名字', '叫我', '我叫', '就行', '就好', '就成'];
                if (!blacklist.includes(name) && name.length >= 2 && name.length <= 10) {
                    return name;
                }
            }
        }
        return null;
    }

    /**
     * 步骤3: 收集使用场景
     */
    handleCollectScenario(userInput) {
        const info = this.data.collectedInfo;
        const input = userInput.toLowerCase();

        // 分析用户偏好
        const scenarioInfo = this.analyzeScenario(input);
        info.primaryScenario = scenarioInfo.type;
        info.preferences = scenarioInfo.preferences;

        this.data.completed = true;
        this.saveData();

        // 第三步：完成 + 给标签
        const roleLabel = this.getRoleLabel(scenarioInfo.type);
        const completionText = `收到！那以后我就是你的${roleLabel}了 📝\n\n随时召唤我，咱们开工！有什么想做的尽管说~`;

        // 更新用户画像
        this.updateUserProfile();

        return {
            text: completionText,
            isOnboarding: true,
            nextStep: 'completed',
            completed: true
        };
    }

    /**
     * 分析用户的使用场景偏好
     */
    analyzeScenario(input) {
        const result = {
            type: 'balanced',
            preferences: []
        };

        // 高价值场景关键词
        const workKeywords = ['文档', '写', '做表', '表格', 'excel', 'ppt', 'word', '代码', '编程', '写代码', '数据分析', '报告', '方案', '策划', '烧脑'];
        const trivialKeywords = ['查', '资料', '闹钟', '邮件', '天气', '搜索', '问问', '琐碎', '简单', '小'];

        let workScore = 0;
        let trivialScore = 0;

        for (const keyword of workKeywords) {
            if (input.includes(keyword)) {
                workScore++;
                result.preferences.push(keyword);
            }
        }

        for (const keyword of trivialKeywords) {
            if (input.includes(keyword)) {
                trivialScore++;
                result.preferences.push(keyword);
            }
        }

        // 根据得分判断类型
        if (workScore > trivialScore) {
            result.type = 'work_focused';
        } else if (trivialScore > workScore) {
            result.type = 'life_assistant';
        }

        return result;
    }

    /**
     * 根据场景类型获取角色标签
     */
    getRoleLabel(type) {
        const labels = {
            'work_focused': '专属文案/代码助理',
            'life_assistant': '贴心生活管家',
            'balanced': '全能小助手'
        };
        return labels[type] || labels.balanced;
    }

    /**
     * 更新用户画像
     */
    updateUserProfile() {
        let profile = {};
        try {
            if (fs.existsSync(this.profilePath)) {
                profile = JSON.parse(fs.readFileSync(this.profilePath, 'utf8'));
            }
        } catch (e) {}

        // 确保结构存在
        if (!profile.identity) profile.identity = {};
        if (!profile.preferences) profile.preferences = {};
        if (!profile.learned) profile.learned = {};

        // 写入收集到的信息
        const info = this.data.collectedInfo;

        if (info.name) {
            profile.identity.name = info.name;
            profile.identity.nickname = info.name;
        }

        if (info.primaryScenario) {
            profile.preferences.primaryScenario = info.primaryScenario;
        }

        if (info.preferences && info.preferences.length > 0) {
            profile.preferences.keywords = info.preferences;
        }

        // 添加 onboarding 完成时间戳
        profile.onboarding = {
            completedAt: Date.now(),
            version: 'v2' // 新版本标识
        };

        try {
            const profileDir = path.dirname(this.profilePath);
            if (!fs.existsSync(profileDir)) {
                fs.mkdirSync(profileDir, { recursive: true });
            }
            fs.writeFileSync(this.profilePath, JSON.stringify(profile, null, 2), 'utf8');
            console.log('[Onboarding] 用户画像已更新 v2');
        } catch (e) {
            console.error('[Onboarding] 更新用户画像失败:', e.message);
        }
    }

    /**
     * 获取收集到的信息
     */
    getCollectedInfo() {
        return this.data.collectedInfo;
    }

    /**
     * 重置 Onboarding（用于测试）
     */
    reset() {
        this.data = this.getDefaultData();
        this.saveData();
    }

    /**
     * 获取当前步骤
     */
    getCurrentStep() {
        return this.data.currentStep;
    }

    /**
     * 跳过 Onboarding
     */
    skip() {
        this.data.collectedInfo = { name: '朋友' };
        return this.handleCollectScenario('随便');
    }
}

const legacyOnboardingService = new OnboardingService('legacy');

module.exports = {
    getOnboardingService,
    clearOnboardingCache,
    legacyOnboardingService,
    OnboardingService
};
