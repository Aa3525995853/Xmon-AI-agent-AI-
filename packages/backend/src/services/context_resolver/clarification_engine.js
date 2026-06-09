/**
 * 澄清引擎
 */

const REQUIRED_FIELDS = {
    'book_flight': ['time', 'destination', 'quantity'],
    'book_hotel': ['time', 'location', 'quantity'],
    'schedule_meeting': ['time', 'attendees'],
    'organize_files': ['target'],
    'general_task': []
};

const QUESTION_TEMPLATES = {
    'book_flight': {
        'time': '请问几号出发呢？',
        'destination': '目的地是哪里呀？',
        'quantity': '几个人呢？'
    },
    'book_hotel': {
        'time': '请问几号入住？',
        'location': '在哪个城市呢？',
        'quantity': '几个人住？'
    },
    'schedule_meeting': {
        'time': '什么时候开会呢？',
        'attendees': '有谁要参加？'
    }
};

class ClarificationEngine {
    /**
     * 检查缺失字段
     */
    checkMissing(intent, resolved) {
        const required = REQUIRED_FIELDS[intent] || REQUIRED_FIELDS['general_task'];
        return required.filter(field => !resolved[field]);
    }

    /**
     * 生成澄清问题
     */
    generate(intent, missingFields) {
        const templates = QUESTION_TEMPLATES[intent] || {};
        return missingFields
            .filter(field => templates[field])
            .map(field => ({
                field,
                question: templates[field]
            }));
    }
}

module.exports = new ClarificationEngine();