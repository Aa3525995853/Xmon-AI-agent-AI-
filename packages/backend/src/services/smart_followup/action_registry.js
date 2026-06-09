/**
 * @file action_registry.js
 * @description 动作注册表 - 定义各类任务场景的关键词匹配规则和后续建议列表，
 *              支持基于文本内容自动检测任务类型并返回对应的后续操作建议
 * @module smart_followup
 * @author xiaomeng
 * @version 1.0.0
 * @date 2026-06-07
 */

// ============================================================
// 常量定义：各类任务的后续动作配置
// ============================================================

/**
 * 后续动作配置表 - 按任务类型分组，每个类型包含关键词列表和建议操作列表
 * @type {Object.<string, {keywords: string[], suggestions: Array<{action: string, label: string, icon: string}>}>}
 */
const FOLLOWUP_ACTIONS = {
    search: {
        keywords: ['搜索', '查到', '查到了', '找到', '找到以下', '以下是'],
        suggestions: [
            { action: 'save_note', label: '保存到笔记', icon: 'fa-save' },
            { action: 'open_url', label: '打开网页', icon: 'fa-external-link-alt' },
            { action: 'search_more', label: '搜索更多', icon: 'fa-search-plus' }
        ]
    },
    file_copy: {
        keywords: ['复制', '移动', '粘贴'],
        suggestions: [
            { action: 'open_file', label: '打开看看', icon: 'fa-folder-open' },
            { action: 'file_properties', label: '查看详情', icon: 'fa-info-circle' }
        ]
    },
    file_create: {
        keywords: ['创建', '新建', '生成'],
        suggestions: [
            { action: 'open_file', label: '打开看看', icon: 'fa-folder-open' },
            { action: 'send_email', label: '发送文件', icon: 'fa-envelope' }
        ]
    },
    screenshot: {
        keywords: ['截图', '截屏', '屏幕'],
        suggestions: [
            { action: 'copy_text', label: '复制文字', icon: 'fa-copy' },
            { action: 'save_image', label: '保存图片', icon: 'fa-image' },
            { action: 'ocr_text', label: '识别文字', icon: 'fa-font' }
        ]
    },
    image_analyze: {
        keywords: ['图片', '照片', '图片分析', 'OCR'],
        suggestions: [
            { action: 'copy_text', label: '复制文字', icon: 'fa-copy' },
            { action: 'translate', label: '翻译内容', icon: 'fa-language' },
            { action: 'save_note', label: '保存到笔记', icon: 'fa-save' }
        ]
    },
    email: {
        keywords: ['邮件', 'email', '发送', '发件'],
        suggestions: [
            { action: 'check_sent', label: '确认已发送', icon: 'fa-check' },
            { action: 'compose_another', label: '再写一封', icon: 'fa-plus' }
        ]
    },
    express: {
        keywords: ['快递', '物流', '包裹'],
        suggestions: [
            { action: 'track_again', label: '刷新物流', icon: 'fa-sync' },
            { action: 'save_number', label: '保存单号', icon: 'fa-save' }
        ]
    },
    translate: {
        keywords: ['翻译', '翻译成', '英文', '中文'],
        suggestions: [
            { action: 'copy_result', label: '复制结果', icon: 'fa-copy' },
            { action: 'translate_again', label: '再翻一次', icon: 'fa-sync' },
            { action: 'save_note', label: '保存笔记', icon: 'fa-save' }
        ]
    },
    weather: {
        keywords: ['天气', '温度', '下雨'],
        suggestions: [
            { action: 'check_week', label: '查看一周', icon: 'fa-calendar' },
            { action: 'check_location', label: '查看其他地方', icon: 'fa-map-marker-alt' }
        ]
    },
    code: {
        keywords: ['代码', '代码生成', '写代码'],
        suggestions: [
            { action: 'copy_code', label: '复制代码', icon: 'fa-copy' },
            { action: 'explain_code', label: '解释代码', icon: 'fa-question-circle' },
            { action: 'run_code', label: '运行代码', icon: 'fa-play' }
        ]
    },
    document: {
        keywords: ['PPT', 'ppt', '演示', '生成'],
        suggestions: [
            { action: 'open_document', label: '打开看看', icon: 'fa-presentation' },
            { action: 'modify_document', label: '修改内容', icon: 'fa-edit' },
            { action: 'send_document', label: '发送文件', icon: 'fa-share' }
        ]
    },
    summary: {
        keywords: ['总结', '概括', '要点'],
        suggestions: [
            { action: 'copy_summary', label: '复制总结', icon: 'fa-copy' },
            { action: 'expand_summary', label: '展开详情', icon: 'fa-expand' },
            { action: 'save_note', label: '保存笔记', icon: 'fa-save' }
        ]
    },
    calculation: {
        keywords: ['计算', '结果', '等于'],
        suggestions: [
            { action: 'copy_result', label: '复制结果', icon: 'fa-copy' },
            { action: 'recalculate', label: '重新计算', icon: 'fa-calculator' }
        ]
    }
};

/** 通用后续建议 - 当无法匹配到具体任务类型时使用 */
const GENERIC_FOLLOWUPS = [
    { action: 'save_note', label: '保存到笔记', icon: 'fa-save' },
    { action: 'share_result', label: '分享结果', icon: 'fa-share-alt' },
    { action: 'do_again', label: '再来一次', icon: 'fa-redo' }
];

// ============================================================
// 核心类：ActionRegistry
// 功能说明：基于关键词的任务类型检测和后续建议查询
// ============================================================

class ActionRegistry {

    /**
     * @description 根据文本内容中的关键词检测任务类型，按配置顺序优先匹配
     * @param {string} text - 待检测的文本内容
     * @returns {string} 检测到的任务类型标识，未匹配时返回 'generic'
     */
    detectType(text) {
        for (const [type, config] of Object.entries(FOLLOWUP_ACTIONS)) {
            for (const keyword of config.keywords) {
                if (text.toLowerCase().includes(keyword.toLowerCase())) {
                    return type;
                }
            }
        }
        return 'generic';
    }

    /**
     * @description 获取指定任务类型的后续建议列表
     * @param {string} type - 任务类型标识
     * @returns {Array<{action: string, label: string, icon: string}>} 建议列表，未知类型返回通用建议
     */
    getSuggestions(type) {
        return FOLLOWUP_ACTIONS[type]?.suggestions || GENERIC_FOLLOWUPS;
    }

    /**
     * @description 检查指定任务类型是否有专属的后续建议
     * @param {string} type - 任务类型标识
     * @returns {boolean} 是否存在专属建议
     */
    hasSuggestions(type) {
        return FOLLOWUP_ACTIONS[type] !== undefined;
    }
}

module.exports = new ActionRegistry();
module.exports.FOLLOWUP_ACTIONS = FOLLOWUP_ACTIONS;