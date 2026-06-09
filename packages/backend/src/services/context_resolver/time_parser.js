/**
 * 时间解析器
 */

class TimeParser {
    getDateOffset(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date;
    }

    getDayOfWeek(dayIndex) {
        const now = new Date();
        const currentDay = now.getDay();
        const diff = (dayIndex - currentDay + 7) % 7;
        const date = new Date(now);
        date.setDate(now.getDate() + diff);
        return date;
    }

    getNextDayOfWeek(dayIndex) {
        const now = new Date();
        const currentDay = now.getDay();
        let diff = (dayIndex - currentDay + 7) % 7;
        if (diff === 0) diff = 7;
        diff += 7;
        const date = new Date(now);
        date.setDate(now.getDate() + diff);
        return date;
    }

    getNextWeekend() {
        const now = new Date();
        const day = now.getDay();
        let daysUntilSat = (6 - day + 7) % 7;
        if (daysUntilSat === 0) daysUntilSat = 7;
        const date = new Date(now);
        date.setDate(now.getDate() + daysUntilSat);
        return date;
    }

    /**
     * 检测是否包含时间表达
     */
    containsExpression(text) {
        const patterns = [
            '今天', '明天', '后天', '大后天', '昨天', '前天',
            '周一', '周二', '周三', '周四', '周五', '周六', '周日', '周末',
            '这周一', '这周二', '这周三', '这周四', '这周五', '这周六', '这周日'
        ];
        for (const key of patterns) {
            if (text.includes(key)) return true;
        }
        if (/下周[一二三四五六日]/.test(text)) return true;
        if (/下个?月\d+日/.test(text)) return true;
        return false;
    }

    /**
     * 提取时间实体
     */
    extract(text) {
        const absolutePatterns = {
            '今天': () => this.getDateOffset(0),
            '明天': () => this.getDateOffset(1),
            '后天': () => this.getDateOffset(2),
            '大后天': () => this.getDateOffset(3),
            '昨天': () => this.getDateOffset(-1),
            '前天': () => this.getDateOffset(-2)
        };

        const relativePatterns = {
            '周一': () => this.getDayOfWeek(1),
            '周二': () => this.getDayOfWeek(2),
            '周三': () => this.getDayOfWeek(3),
            '周四': () => this.getDayOfWeek(4),
            '周五': () => this.getDayOfWeek(5),
            '周六': () => this.getDayOfWeek(6),
            '周日': () => this.getDayOfWeek(0),
            '周末': () => this.getNextWeekend()
        };

        // 检查绝对时间
        for (const [key, fn] of Object.entries(absolutePatterns)) {
            if (text.includes(key)) {
                return { raw: key, parsed: fn(), type: 'absolute' };
            }
        }

        // 检查相对时间
        for (const [key, fn] of Object.entries(relativePatterns)) {
            if (text.includes(key)) {
                if (text.includes('下' + key)) {
                    return { raw: '下' + key, parsed: this.getNextDayOfWeek(parseInt(key[1])), type: 'relative' };
                }
                return { raw: key, parsed: fn(), type: 'relative' };
            }
        }

        // 检测"下周五"等复合表达
        const nextWeekMatch = text.match(/下周([一二三四五六日])/);
        if (nextWeekMatch) {
            const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0 };
            const dayIndex = dayMap[nextWeekMatch[1]];
            return { raw: '下周' + nextWeekMatch[1], parsed: this.getNextDayOfWeek(dayIndex), type: 'relative' };
        }

        return null;
    }
}

module.exports = new TimeParser();