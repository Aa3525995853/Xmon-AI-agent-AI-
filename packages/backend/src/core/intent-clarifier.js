/**
 * @file intent-clarifier.js
 * @description 意图澄清器，检测模糊/歧义指令并自动追问，支持多轮澄清和参数补全
 * @module core
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 *
 * 核心能力：
 * 1. 检测模糊/歧义指令，自动追问
 * 2. 上下文感知：结合对话历史消歧
 * 3. 多轮澄清：支持最多 N 轮追问，超限后智能猜测
 * 4. 选项引导：为用户提供可选项，降低回答成本
 * 5. 参数补全：检测缺失的关键参数并追问
 */

const serviceBus = require('./service-bus');

/** 最大澄清轮数，超过后自动猜测最佳意图 */
const MAX_CLARIFICATION_ROUNDS = 3;
/** 歧义检测阈值，置信度低于此值时触发追问 */
const AMBIGUITY_THRESHOLD = 0.6;

class IntentClarifier {
    /**
     * @description 构造函数，初始化澄清规则和参数规则
     * @param {Object} [options={}] - 配置选项
     * @param {number} [options.maxRounds] - 最大澄清轮数
     * @param {number} [options.threshold] - 歧义检测阈值
     */
    constructor(options = {}) {
        this.maxRounds = options.maxRounds || MAX_CLARIFICATION_ROUNDS;
        this.threshold = options.threshold || AMBIGUITY_THRESHOLD;
        this._sessions = new Map();
        this._ambiguityRules = this._buildAmbiguityRules();
        this._paramRules = this._buildParamRules();
        this._stats = { clarified: 0, autoResolved: 0, timedOut: 0 };
    }

    /**
     * @description 分析用户输入，检测歧义并返回澄清结果或直接意图
     * @param {string} input - 用户输入文本
     * @param {Object} [context={}] - 上下文信息
     * @param {string} [context.sessionId] - 会话ID
     * @returns {Object} 澄清结果，包含 needsClarification、intent、confidence 等
     */
    clarify(input, context = {}) {
        const sessionId = context.sessionId || 'default';
        const session = this._sessions.get(sessionId);

        if (session && session.pending) {
            return this._handleResponse(input, session, context);
        }

        const analysis = this._analyze(input, context);

        // 情感支持检测：直接路由到聊天模式，不设置任何任务意图
        if (analysis.isEmotionalSupport) {
            return {
                needsClarification: false,
                isEmotionalSupport: true,
                intent: null,
                confidence: 0.95,
                params: {}
            };
        }

        if (analysis.needsClarification) {
            this._stats.clarified++;
            const clarificationId = this._generateId();

            this._sessions.set(sessionId, {
                id: clarificationId,
                pending: true,
                round: 1,
                originalInput: input,
                possibleIntents: analysis.possibleIntents,
                missingParams: analysis.missingParams,
                context,
                createdAt: Date.now()
            });

            serviceBus.publish('clarification:needed', {
                sessionId,
                clarificationId,
                question: analysis.question,
                options: analysis.options,
                round: 1
            });

            return {
                needsClarification: true,
                question: analysis.question,
                options: analysis.options,
                confidence: analysis.confidence,
                possibleIntents: analysis.possibleIntents,
                missingParams: analysis.missingParams,
                clarificationId,
                round: 1
            };
        }

        this._stats.autoResolved++;
        return {
            needsClarification: false,
            confidence: analysis.confidence,
            intent: analysis.intent,
            params: analysis.params
        };
    }

    /**
     * @description 处理澄清会话中的用户回复，尝试解析为明确意图
     * @param {string} input - 用户回复文本
     * @param {Object} session - 当前澄清会话
     * @param {Object} context - 上下文信息
     * @returns {Object} 澄清结果
     */
    _handleResponse(input, session, context) {
        session.round++;

        const resolved = this._tryResolve(input, session, context);

        if (resolved || session.round >= this.maxRounds) {
            session.pending = false;
            this._sessions.delete(context.sessionId || 'default');

            if (resolved) {
                serviceBus.publish('clarification:resolved', {
                    sessionId: context.sessionId || 'default',
                    round: session.round,
                    intent: resolved.intent
                });

                return {
                    needsClarification: false,
                    confidence: resolved.confidence,
                    intent: resolved.intent,
                    params: resolved.params,
                    clarifiedFrom: session.originalInput,
                    roundsUsed: session.round
                };
            }

            this._stats.timedOut++;
            const bestGuess = this._bestGuess(session);

            serviceBus.publish('clarification:timeout', {
                sessionId: context.sessionId || 'default',
                rounds: session.round,
                fallback: bestGuess.intent
            });

            return {
                needsClarification: false,
                confidence: bestGuess.confidence,
                intent: bestGuess.intent,
                params: bestGuess.params,
                clarifiedFrom: session.originalInput,
                roundsUsed: session.round,
                wasGuessed: true
            };
        }

        const nextQuestion = this._nextQuestion(session, input);

        serviceBus.publish('clarification:continue', {
            sessionId: context.sessionId || 'default',
            round: session.round,
            question: nextQuestion.question
        });

        return {
            needsClarification: true,
            question: nextQuestion.question,
            options: nextQuestion.options,
            confidence: nextQuestion.confidence,
            round: session.round,
            clarificationId: session.id
        };
    }

    /**
     * @description 分析输入文本，按优先级匹配歧义规则，返回分析结果
     * @param {string} input - 输入文本
     * @param {Object} context - 上下文信息
     * @returns {Object} 分析结果，包含 needsClarification、intent、confidence 等
     */
    _analyze(input, context) {
        const text = input.toLowerCase().trim();
        const results = [];

        // 先检查情感支持（优先级 15，最高）
        const emotionalRule = this._ambiguityRules.find(r => r.name === 'emotional_support');
        if (emotionalRule) {
            const match = emotionalRule.test(text, context);
            // emotional_support 规则返回 null 表示检测到情感倾诉
            if (match === null) {
                return {
                    needsClarification: false,
                    isEmotionalSupport: true,
                    confidence: 0.95,
                    intent: null,
                    params: {}
                };
            }
        }

        const sortedRules = this._ambiguityRules
            .slice()
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));

        let highestMatchedPriority = -1;

        for (const rule of sortedRules) {
            // 跳过已经检查过的情感支持规则
            if (rule.name === 'emotional_support') continue;

            const match = rule.test(text, context);
            if (match) {
                if (highestMatchedPriority === -1) {
                    highestMatchedPriority = rule.priority || 0;
                }
                if ((rule.priority || 0) >= highestMatchedPriority) {
                    results.push(match);
                } else {
                    break;
                }
            }
        }

        if (results.length === 0) {
            return {
                needsClarification: false,
                confidence: 1.0,
                intent: null,
                params: {}
            };
        }

        if (results.length === 1 && results[0].confidence >= this.threshold) {
            const missing = this._checkMissingParams(text, results[0].intent, context);
            if (missing.length === 0) {
                return {
                    needsClarification: false,
                    confidence: results[0].confidence,
                    intent: results[0].intent,
                    params: results[0].params || {}
                };
            }

            return {
                needsClarification: true,
                confidence: results[0].confidence,
                possibleIntents: [results[0].intent],
                missingParams: missing,
                question: missing[0].question,
                options: missing[0].options
            };
        }

        const sorted = results.sort((a, b) => b.confidence - a.confidence);
        const topTwo = sorted.slice(0, 2);

        if (topTwo.length >= 2 && topTwo[0].confidence - topTwo[1].confidence < 0.2) {
            return {
                needsClarification: true,
                confidence: topTwo[0].confidence,
                possibleIntents: topTwo.map(r => r.intent),
                missingParams: [],
                question: this._disambiguateQuestion(topTwo),
                options: topTwo.map(r => ({
                    label: r.label || r.intent,
                    value: r.intent,
                    description: r.description || ''
                }))
            };
        }

        const best = sorted[0];
        const missing = this._checkMissingParams(text, best.intent, context);

        if (missing.length > 0) {
            return {
                needsClarification: true,
                confidence: best.confidence,
                possibleIntents: [best.intent],
                missingParams: missing,
                question: missing[0].question,
                options: missing[0].options
            };
        }

        return {
            needsClarification: false,
            confidence: best.confidence,
            intent: best.intent,
            params: best.params || {}
        };
    }

    /**
     * @description 尝试将用户回复解析为明确意图
     * @param {string} input - 用户回复文本
     * @param {Object} session - 澄清会话
     * @param {Object} context - 上下文
     * @returns {Object|null} 解析结果，无法解析时返回 null
     */
    _tryResolve(input, session, context) {
        const text = input.toLowerCase().trim();

        for (const possible of session.possibleIntents) {
            const rule = this._ambiguityRules.find(r => {
                const match = r.test(text, context);
                return match && match.intent === possible;
            });
            if (rule) {
                const match = rule.test(text, context);
                if (match && match.confidence >= 0.5) {
                    return match;
                }
            }
        }

        const optionMatch = session.missingParams
            ? session.missingParams.flatMap(p => p.options || [])
            : [];
        const selected = optionMatch.find(o =>
            text.includes(o.value) || text.includes(o.label.toLowerCase())
        );

        if (selected) {
            return {
                intent: session.possibleIntents[0],
                confidence: 0.8,
                params: { [session.missingParams[0]?.name]: selected.value }
            };
        }

        if (/是|对|嗯|好|yes|ok/i.test(text)) {
            return {
                intent: session.possibleIntents[0],
                confidence: 0.7,
                params: {}
            };
        }

        if (/不|不是|no|别/i.test(text)) {
            if (session.possibleIntents.length > 1) {
                return {
                    intent: session.possibleIntents[1],
                    confidence: 0.6,
                    params: {}
                };
            }
        }

        return null;
    }

    /**
     * @description 澄清超限时，猜测最佳意图作为兜底
     * @param {Object} session - 澄清会话
     * @returns {Object} 猜测结果，包含 intent、confidence、params
     */
    _bestGuess(session) {
        if (session.possibleIntents.length > 0) {
            return {
                intent: session.possibleIntents[0],
                confidence: 0.4,
                params: {}
            };
        }
        return { intent: 'llm:chat', confidence: 0.3, params: {} };
    }

    /**
     * @description 生成下一轮追问的问题和选项
     * @param {Object} session - 澄清会话
     * @param {string} userInput - 用户输入
     * @returns {Object} 包含 question、options、confidence 的追问信息
     */
    _nextQuestion(session, userInput) {
        if (session.missingParams.length > 0) {
            const nextMissing = session.missingParams[0];
            return {
                question: nextMissing.question,
                options: nextMissing.options,
                confidence: 0.5
            };
        }

        return {
            question: `我不太确定你的意思，能再说具体一点吗？（第${session.round}次追问）`,
            options: session.possibleIntents.map(intent => ({
                label: this._intentLabel(intent),
                value: intent,
                description: ''
            })),
            confidence: 0.4
        };
    }

    /**
     * @description 检查指定意图的必需参数是否缺失
     * @param {string} text - 输入文本
     * @param {string} intent - 意图标识
     * @param {Object} context - 上下文
     * @returns {Array} 缺失参数列表
     */
    _checkMissingParams(text, intent, context) {
        const rule = this._paramRules[intent];
        if (!rule) return [];

        const missing = [];
        for (const param of rule.params) {
            const extracted = param.extract(text, context);
            if (!extracted && param.required) {
                missing.push({
                    name: param.name,
                    question: param.question,
                    options: param.options || []
                });
            }
        }
        return missing;
    }

    /**
     * @description 生成消歧问题文本
     * @param {Array} topTwo - 置信度最高的两个匹配结果
     * @returns {string} 消歧问题文本
     */
    _disambiguateQuestion(topTwo) {
        const labels = topTwo.map(r => r.label || r.intent);
        if (labels.length === 2) {
            return `你是想${labels[0]}，还是${labels[1]}呢？`;
        }
        return '你想让我做什么呢？可以说得更具体一点~';
    }

    /**
     * @description 将意图标识转换为中文标签
     * @param {string} intent - 意图标识
     * @returns {string} 中文标签
     */
    _intentLabel(intent) {
        const labels = {
            'news:search': '搜索新闻',
            'weather:query': '查天气',
            'system:launch_app': '打开应用',
            'system:play_music': '播放音乐',
            'system:search_web': '搜索网页',
            'system:open_url': '打开网址',
            'browser:execute': '浏览器操作',
            'llm:complex_task': '处理复杂任务',
            'llm:chat': '聊天'
        };
        return labels[intent] || intent;
    }

    /**
     * @description 构建歧义检测规则列表，按优先级排序
     * @returns {Array} 歧义检测规则数组
     */
    _buildAmbiguityRules() {
        return [
            // === 第0优先级：情感支持检测 ===
            // 检测到情感倾诉时，直接路由到聊天模式，不触发任务流程
            {
                name: 'emotional_support',
                priority: 15,
                test(text, ctx) {
                    const emotionalKeywords = [
                        '累', '好累', '好烦', '难过', '伤心', '委屈', '郁闷', '沮丧', '失落',
                        '压力大', '焦虑', '担心', '害怕', '迷茫', '无奈',
                        '被骂', '被批评', '被骂了', '被吵', '被说了',
                        '开心', '高兴', '快乐', '兴奋', '激动', '棒', '太好了',
                        '成功', '通过了', '完成了', '搞定', '搞定啦',
                        '倾诉', '吐槽', '抱怨', '诉苦', '哭诉', '发泄',
                        '无聊', '没事干', '闲着', '发呆'
                    ];

                    for (const keyword of emotionalKeywords) {
                        if (text.includes(keyword)) {
                            const isEmotionalExpression =
                                /^(我|小梦|梦梦|哥哥|姐姐|亲爱的)[，,，, ]./.test(text) ||
                                /^我.+?(累|烦|难(过)?|伤心|困|压力|焦虑|难过|委屈|开心|高兴|生气|崩溃|难受|心疼|被骂|完成|搞定)/.test(text) ||
                                /^我[^，,，。.]{0,20}[累烦难伤心困压力焦虑难过委屈被骂完成搞定].{0,10}$/.test(text) ||
                                /^我[好很真太挺越].{0,10}[累烦难困压力大焦虑累被骂完成搞定]/u.test(text);

                            if (isEmotionalExpression) {
                                return null;
                            }
                        }
                    }
                    return false;
                }
            },
            {
                name: 'news',
                priority: 10,
                test(text, ctx) {
                    if (/新闻|资讯|热点|头条|今日/.test(text)) {
                        const categoryMatch = text.match(/(科技|体育|娱乐|财经|国际|国内|社会|军事|教育|健康)/);
                        return {
                            intent: 'news:search',
                            confidence: categoryMatch ? 0.95 : 0.85,
                            label: '搜索新闻',
                            description: '帮你搜索最新新闻资讯',
                            params: { query: text, category: categoryMatch ? categoryMatch[1] : '' }
                        };
                    }
                    return null;
                }
            },
            {
                name: 'weather',
                priority: 10,
                test(text, ctx) {
                    if (/天气|气温|温度|下雨|刮风|穿衣/.test(text)) {
                        const cityMatch = text.match(/([\u4e00-\u9fff]{2,4})(?:的|今天|明天|这)?(?:天气|气温)/);
                        return {
                            intent: 'weather:query',
                            confidence: cityMatch ? 0.95 : 0.6,
                            label: '查天气',
                            description: '帮你查询天气预报',
                            params: { city: cityMatch ? cityMatch[1] : '' }
                        };
                    }
                    return null;
                }
            },
            {
                name: 'launch_app',
                priority: 8,
                test(text, ctx) {
                    if (/打开|启动|运行/.test(text)) {
                        const appMatch = text.match(/(?:打开|启动|运行)\s*(.+)/);
                        const appName = appMatch ? appMatch[1].trim() : '';
                        return {
                            intent: 'system:launch_app',
                            confidence: appName ? 0.9 : 0.4,
                            label: '打开应用',
                            description: '帮你打开指定的应用程序',
                            params: { app_name: appName }
                        };
                    }
                    return null;
                }
            },
            {
                name: 'play_music',
                priority: 8,
                test(text, ctx) {
                    if (/播放|听.*歌|音乐/.test(text)) {
                        const songMatch = text.match(/(?:播放|听)\s*(.+)/);
                        const songName = songMatch ? songMatch[1].trim() : '';
                        return {
                            intent: 'system:play_music',
                            confidence: songName ? 0.9 : 0.5,
                            label: '播放音乐',
                            description: '帮你播放音乐',
                            params: { song: songName || text }
                        };
                    }
                    return null;
                }
            },
            {
                name: 'search',
                priority: 5,
                test(text, ctx) {
                    if (/搜索|搜一下|查一下|帮我查/.test(text)) {
                        const queryMatch = text.match(/(?:搜索|搜一下|查一下|帮我查)\s*(.+)/);
                        const query = queryMatch ? queryMatch[1].trim() : '';
                        return {
                            intent: 'system:search_web',
                            confidence: query ? 0.85 : 0.4,
                            label: '搜索内容',
                            description: '帮你搜索网页内容',
                            params: { query: query || text }
                        };
                    }
                    return null;
                }
            },
            {
                name: 'browser',
                priority: 6,
                test(text, ctx) {
                    if (/浏览|打开网页|访问|抓取|截图/.test(text)) {
                        return {
                            intent: 'browser:execute',
                            confidence: 0.8,
                            label: '浏览器操作',
                            description: '帮你操作浏览器完成任务',
                            params: { task: text }
                        };
                    }
                    return null;
                }
            },
            {
                name: 'complex',
                priority: 3,
                test(text, ctx) {
                    if (/帮我|请|写|做|生成|创建|制作|分析|整理/.test(text) && text.length > 10) {
                        return {
                            intent: 'llm:complex_task',
                            confidence: 0.6,
                            label: '处理复杂任务',
                            description: '帮你完成复杂的创作或分析任务',
                            params: { prompt: text }
                        };
                    }
                    return null;
                }
            },
            {
                name: 'vague_open',
                priority: 1,
                test(text, ctx) {
                    if (/^(打开|开)$/.test(text)) {
                        return {
                            intent: 'system:launch_app',
                            confidence: 0.3,
                            label: '打开应用',
                            description: '你想打开什么应用呢？',
                            params: { app_name: '' }
                        };
                    }
                    if (/^(播放|听)$/.test(text)) {
                        return {
                            intent: 'system:play_music',
                            confidence: 0.3,
                            label: '播放音乐',
                            description: '你想听什么歌呢？',
                            params: { song: '' }
                        };
                    }
                    return null;
                }
            },
            {
                name: 'vague_search',
                priority: 1,
                test(text, ctx) {
                    if (/^(搜|查|找)$/.test(text)) {
                        return {
                            intent: 'system:search_web',
                            confidence: 0.3,
                            label: '搜索内容',
                            description: '你想搜什么呢？',
                            params: { query: '' }
                        };
                    }
                    return null;
                }
            }
        ];
    }

    /**
     * @description 构建参数补全规则，定义各意图的必需参数和提取方法
     * @returns {Object} 参数规则映射
     */
    _buildParamRules() {
        return {
            'weather:query': {
                params: [
                    {
                        name: 'city',
                        required: true,
                        extract(text, ctx) {
                            const m = text.match(/([\u4e00-\u9fff]{2,4})(?:的|今天|明天|这)?(?:天气|气温)/);
                            return m ? m[1] : null;
                        },
                        question: '你想查哪个城市的天气呢？',
                        options: [
                            { label: '北京', value: '北京' },
                            { label: '上海', value: '上海' },
                            { label: '广州', value: '广州' },
                            { label: '深圳', value: '深圳' }
                        ]
                    }
                ]
            },
            'system:launch_app': {
                params: [
                    {
                        name: 'app_name',
                        required: true,
                        extract(text, ctx) {
                            const m = text.match(/(?:打开|启动|运行)\s*(.+)/);
                            return m ? m[1].trim() : null;
                        },
                        question: '你想打开什么应用呢？',
                        options: [
                            { label: '记事本', value: '记事本' },
                            { label: '浏览器', value: '浏览器' },
                            { label: '微信', value: '微信' },
                            { label: '计算器', value: '计算器' }
                        ]
                    }
                ]
            },
            'system:play_music': {
                params: [
                    {
                        name: 'song',
                        required: true,
                        extract(text, ctx) {
                            const m = text.match(/(?:播放|听)\s*(.+)/);
                            return m ? m[1].trim() : null;
                        },
                        question: '你想听什么歌呢？可以说歌名或歌手~',
                        options: []
                    }
                ]
            },
            'system:search_web': {
                params: [
                    {
                        name: 'query',
                        required: true,
                        extract(text, ctx) {
                            const m = text.match(/(?:搜索|搜一下|查一下|帮我查)\s*(.+)/);
                            return m ? m[1].trim() : null;
                        },
                        question: '你想搜什么呢？',
                        options: []
                    }
                ]
            },
            'news:search': {
                params: [
                    {
                        name: 'category',
                        required: false,
                        extract(text, ctx) {
                            const m = text.match(/(科技|体育|娱乐|财经|国际|国内|社会|军事|教育|健康)/);
                            return m ? m[1] : null;
                        },
                        question: '你对哪类新闻感兴趣？',
                        options: [
                            { label: '科技', value: '科技' },
                            { label: '娱乐', value: '娱乐' },
                            { label: '财经', value: '财经' },
                            { label: '国际', value: '国际' }
                        ]
                    }
                ]
            }
        };
    }

    /**
     * @description 获取澄清器统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return { ...this._stats, activeSessions: this._sessions.size };
    }

    /**
     * @description 清除指定会话的澄清状态
     * @param {string} [sessionId] - 会话ID
     */
    clearSession(sessionId) {
        this._sessions.delete(sessionId || 'default');
    }

    /**
     * @description 生成唯一澄清ID
     * @returns {string} 澄清ID
     */
    _generateId() {
        return `clarify_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    }
}

module.exports = new IntentClarifier();
