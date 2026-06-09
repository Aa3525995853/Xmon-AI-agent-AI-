/**
 * 意图分类器
 */

const INTENT_PATTERNS = {
    'book_flight': ['订机票', '买机票', '订张机票', '去北京的票', '去.*的飞机'],
    'book_hotel': ['订酒店', '订房', '住酒店', '订个房间'],
    'schedule_meeting': ['开会', '预约', '约个会议', '安排会议'],
    'organize_files': ['整理', '归类', '整理.*文件', '整理.*桌面'],
    'search_info': ['搜索', '查一下', '帮我看看', '找找'],
    'send_email': ['发邮件', '发个邮件', '发送邮件'],
    'create_document': ['写', '创建', '生成', '做.*文档']
};

class IntentClassifier {
    /**
     * 识别意图
     */
    identify(text, resolved) {
        for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
            for (const pattern of patterns) {
                if (new RegExp(pattern).test(text)) {
                    return intent;
                }
            }
        }
        return 'general_task';
    }

    /**
     * 获取意图描述
     */
    getIntentDescription(intent) {
        const descriptions = {
            'book_flight': '订机票',
            'book_hotel': '订酒店',
            'schedule_meeting': '安排会议',
            'organize_files': '整理文件',
            'search_info': '搜索信息',
            'send_email': '发送邮件',
            'create_document': '创建文档',
            'general_task': '通用任务'
        };
        return descriptions[intent] || '未知任务';
    }
}

module.exports = new IntentClassifier();