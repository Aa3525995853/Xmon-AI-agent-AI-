/**
 * 流式聊天控制器配置
 * 集中管理所有魔法数字和硬编码字符串
 * 支持环境变量覆盖
 */

// 辅助函数：从环境变量读取数值，带默认值
const getEnvNumber = (key, defaultValue) => {
    const value = process.env[key];
    if (value === undefined || value === '') {
        return defaultValue;
    }
    const num = Number(value);
    if (isNaN(num)) {
        console.warn(`[配置警告] 环境变量 ${key}="${value}" 不是有效数字，使用默认值 ${defaultValue}`);
        return defaultValue;
    }
    return num;
};

/**
 * @description 从环境变量读取字符串，支持默认值
 * @param {string} key - 环境变量名称
 * @param {string} defaultValue - 默认值
 * @returns {string} 环境变量值或默认值
 */
const getEnvString = (key, defaultValue) => {
    const value = process.env[key];
    return (value !== undefined && value !== '') ? value : defaultValue;
};

// =========== 背压控制配置 =========
const BACKPRESSURE_CONFIG = {
    highWaterMark: getEnvNumber('STREAM_HIGH_WATER_MARK', 128 * 1024),  // 128KB - 高水位标记
    lowWaterMark: getEnvNumber('STREAM_LOW_WATER_MARK', 32 * 1024),     // 32KB - 低水位标记
    maxQueueSize: getEnvNumber('STREAM_MAX_QUEUE_SIZE', 200)          // 最大队列大小
};

// ================= 音频配置 ==============
const AUDIO_CONFIG = {
    sampleRate: getEnvNumber('TTS_SAMPLE_RATE', 24000),          // 采样率 (Hz)
    format: getEnvString('TTS_FORMAT', 'pcm16'),         // 音频格式
    encoding: getEnvString('TTS_ENCODING', 'utf-8')           // 文本编码
};

// ==================== LLM 配置 ==================
const LLM_CONFIG = {
    defaultModel: getEnvString('LLM_DEFAULT_MODEL', 'mimo-v2.5'),
    temperature: getEnvNumber('LLM_TEMPERATURE', 0.85),          // 温度参数
    topP: getEnvNumber('LLM_TOP_P', 0.95),               // Top-P 采样
    presencePenalty: getEnvNumber('LLM_PRESENCE_PENALTY', 0.2),       // 存在惩罚
    frequencyPenalty: getEnvNumber('LLM_FREQUENCY_PENALTY', 0.2),      // 频率惩罚

    // 超时配置 (毫秒) - 长文本需要更长时间
    timeout: {
        'mimo-v2-flash': getEnvNumber('LLM_TIMEOUT_MIMO', 180000),  // Mimo v2-flash 超时 180 秒
        'mimo-v2.5': getEnvNumber('LLM_TIMEOUT_MIMO', 180000),     // Mimo v2.5 超时 180 秒
        'default': getEnvNumber('LLM_TIMEOUT_DEFAULT', 180000)      // 其他模型超时 180 秒
    },

    // 流式处理超时 - 增加以支持更长响应
    streamTimeout: getEnvNumber('LLM_STREAM_TIMEOUT', 300000),       // 流式响应超时 300 秒

    // 思考模式配置
    thinking: {
        type: 'disabled'        // 禁用思考模式
    }
};

// ============================================================
// 模块名称：句子处理配置
// 功能说明：定义句子边界正则、最大/最小长度和短句合并阈值
// ============================================================
const SENTENCE_CONFIG = {
    boundary: /[。！？.!?；;]/,    // 句子边界正则
    maxLength: getEnvNumber('SENTENCE_MAX_LENGTH', 200),         // 单句最大长度（增大以支持数学公式等长内容）
    minLength: getEnvNumber('SENTENCE_MIN_LENGTH', 2),             // 最小句子长度
    mergeThreshold: getEnvNumber('SENTENCE_MERGE_THRESHOLD', 100)          // 短句合并阈值（相应增大）
};

// ============= 情绪配置 =============
const EMOTION_CONFIG = {
    // 情绪映射表
    emotionMap: {
        '开心': '开心',
        '悲伤': '悲伤',
        '生气': '生气',
        '惊讶': '惊讶',
        '温柔': '温柔',
        '调皮': '调皮',
        '俏皮': '调皮',
        '撒娇': '调皮',
        '平静': '温柔',
    'calm': '温柔',
        'happy': '开心',
        'sad': '悲伤'
    },

    // 默认情绪
    defaultEmotion: '开心',

    // 情绪关键词检测
    keywords: {
        '开心': /开心|高兴|快乐|哈哈|嘻嘻|耶|太棒/,
        '悲伤': /难过|伤心|呜呜|失望|遗憾/,
        '生气': /生气|讨厌|烦|愤怒/,
        '惊讶': /哇|天哪|真的吗|不会吧|竟然/
    },

    // 可用的情绪标签
    availableEmotions: ['开心', '悲伤', '生气', '惊讶', '温柔', '调皮', '俏皮', '撒娇', '平静']
};

// ============================================================
// 模块名称：系统控制配置
// 功能说明：定义系统控制工具名称映射和默认回复模板
// ============================================================
const SYSTEM_CONTROL_CONFIG = {
    // 工具名称映射
    toolNames: {
        launch_app: '打开应用',
        play_music: '播放音乐',
        search_web: '搜索',
        search_shopping: '搜索购物',
        search_video: '搜索视频',
     open_url: '打开网页',
        get_system_info: '获取系统信息',
        create_folder: '创建文件夹'
    },

    // 默认回复
    successTemplate: (displayName) => `好的，已经${displayName}啦~`,
    errorTemplate: (message) => `抱歉，${message}`,
    fallbackError: '抱歉，操作失败了~',
    networkError: '嗯……信号不好……',
    defaultFallback: '嗯……'
};

// ==================== 对话历史配置 ================
const CONVERSATION_CONFIG = {
    maxHistoryLength: getEnvNumber('CONVERSATION_MAX_HISTORY', 6),        // 最大历史消息数
    maxTokens: {
      short: 150,           // 短回复
        normal: 200,            // 普通回复
        long: 500               // 长回复（带工具调用）
    }
};

// ================= SSE 事件类型 ============
const SSE_EVENTS = {
    TEXT: 'text',
    AUDIO: 'audio',
    AUDIO_END: 'audio_end',
    DONE: 'done',
    CONFIG: 'config',
    SENTENCE_COMPLETE: 'sentence_complete'
};

// ============================================================
// 模块名称：日志前缀
// 功能说明：定义各模块的日志前缀常量
// ============================================================
const LOG_PREFIX = {
    STREAM: '[流式]',
    TTS: '[逐句TTS]',
    LLM: '[LLM]',
    SYSTEM: '[系统控制]',
    ERROR: '[错误]',
    CLEANUP: '[清理]'
};

// =============== 性格模式 ===========
const PERSONALITY_MODES = {
    NORMAL: 'normal',
    BAD: 'bad',
    CUTE: 'cute'
};

// ==================== 工具调用指令模板 ================
const TOOL_INSTRUCTIONS = `用户需要你执行任务，请积极使用提供的工具函数来完成任务。当前日期: {{date}}。

【强制规则 - 必须遵守】
1. 生成Excel/表格：必须调用 generate_table 工具，禁止自己写Python代码！
2. 生成图表：必须调用 generate_chart 工具
3. 文件必须保存到服务器 uploads/generated/ 目录
4. 搜索最多2次，然后直接生成内容
5. 不要说自己做不到

【返回格式 - 非常重要】
当 generate_table 工具执行成功后：
1. 工具会返回一个JSON，格式如下：
   {"success":true,"filename":"文件名.xlsx","previewUrl":"http://localhost:3000/online-table.html?file=文件名.xlsx",...}
2. 你必须提取 JSON 中的 filename 字段，然后生成以下格式的回复（直接复制下面的格式，只替换"文件名.xlsx"）：
📊 Excel表格已生成：[在线查看和编辑](http://localhost:3000/online-table.html?file=文件名.xlsx)
💾 也可以直接下载：[下载Excel](http://localhost:3000/uploads/generated/文件名.xlsx)

【注意】不要省略链接！这是用户查看结果的主要方式。

如果生成了图表，格式：
📈 图表已生成：[查看图表](http://localhost:3000/uploads/charts/图表文件名.png)`;

function getToolInstructions() {
    const now = new Date();
    return TOOL_INSTRUCTIONS.replace('{{date}}', `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`);
}

// ==================== 意图检测模式 ================
const INTENT_PATTERNS = {
    dataAnalysis: /(分析.*趋势|分析.*数据|画.*图表|销售.*分析|数据.*分析|趋势.*图)/,
    chartOrCode: /(图表|画图|可视化|绘制|生成图表|画出图表|画图表|代码执行|运行代码|数据分析|分析.*趋势|分析.*数据|销售.*分析)/,
    multiStep: /(搜索|搜一下|查一下).*(?:并|然后|接着|再|同时|写成|保存|生成|整理|分析|总结|报告|文档|早报)/
};

module.exports = {
    BACKPRESSURE_CONFIG,
    AUDIO_CONFIG,
    LLM_CONFIG,
    SENTENCE_CONFIG,
    EMOTION_CONFIG,
    SYSTEM_CONTROL_CONFIG,
    CONVERSATION_CONFIG,
    SSE_EVENTS,
    LOG_PREFIX,
    PERSONALITY_MODES,
    getToolInstructions,
    INTENT_PATTERNS
};

// ============================================================
// 模块名称：配置验证
// 功能说明：在模块加载时验证配置的有效性，仅在非生产环境或启用验证时执行
// ============================================================
if (process.env.NODE_ENV !== 'production' || process.env.VALIDATE_CONFIG === 'true') {
    try {
        const { validateStreamChatConfig, validateWithWarnings } = require('./configValidator');
        const configExports = module.exports;
        const validationResult = validateStreamChatConfig(configExports);

        if (!validationResult.valid) {
            console.error('[配置错误] 配置验证失败:', validationResult.errors);
            throw new Error(`配置验证失败: ${validationResult.errors.join(', ')}`);
        }

      // 显示警告（不阻止启动）
        validateWithWarnings(configExports);
    } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') {
            throw error;
        }
        // 如果 configValidator 不存在，跳过验证
    }
}
