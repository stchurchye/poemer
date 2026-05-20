const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function getShanghaiParts(date) {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const readNum = (type) => {
        const raw = parts.find((p) => p.type === type)?.value;
        if (raw == null || raw === '')
            return NaN;
        const n = Number(raw);
        return Number.isFinite(n) ? n : NaN;
    };
    let year = readNum('year');
    let month = readNum('month');
    let day = readNum('day');
    let hour = readNum('hour');
    let minute = readNum('minute');
    // Hermes / 部分环境 formatToParts 缺少 day，用 en-CA 再取一次
    if ([year, month, day, hour, minute].some(Number.isNaN)) {
        const fb = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(date);
        const fbNum = (type) => {
            const raw = fb.find((p) => p.type === type)?.value;
            const n = Number(raw);
            return Number.isFinite(n) ? n : NaN;
        };
        year = fbNum('year');
        month = fbNum('month');
        day = fbNum('day');
        hour = fbNum('hour');
        minute = fbNum('minute');
    }
    const weekdayShort = parts.find((p) => p.type === 'weekday')?.value ?? '';
    let weekdayIndex = WEEKDAYS.findIndex((w) => weekdayShort.includes(w.replace('周', '')));
    if (weekdayIndex < 0) {
        weekdayIndex = WEEKDAYS.findIndex((w) => weekdayShort.includes(w));
    }
    return {
        year: Number.isFinite(year) ? year : date.getFullYear(),
        month: Number.isFinite(month) ? month : date.getMonth() + 1,
        day: Number.isFinite(day) ? day : date.getDate(),
        hour: Number.isFinite(hour) ? hour : 0,
        minute: Number.isFinite(minute) ? minute : 0,
        weekday: weekdayIndex >= 0 ? WEEKDAYS[weekdayIndex] : WEEKDAYS[date.getDay()],
    };
}
function getDayPeriod(hour) {
    if (hour >= 5 && hour < 12)
        return '上午';
    if (hour >= 12 && hour < 18)
        return '下午';
    if (hour >= 18 && hour < 24)
        return '晚上';
    return '夜里';
}
function formatClock(hour, minute) {
    const period = getDayPeriod(hour);
    if (minute === 0)
        return `${period} ${hour}点整`;
    return `${period} ${hour}点${minute}分`;
}
function isSameCalendarDay(a, b) {
    const pa = getShanghaiParts(a);
    const pb = getShanghaiParts(b);
    return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}
function formatDateLabel(date, now) {
    const p = getShanghaiParts(date);
    const n = getShanghaiParts(now);
    if (isSameCalendarDay(date, now))
        return '今天';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameCalendarDay(date, yesterday))
        return '昨天';
    if (p.year === n.year)
        return `${p.month}月${p.day}日`;
    return `${p.year}年${p.month}月${p.day}日`;
}
function formatSpeechDate(date, now) {
    const p = getShanghaiParts(date);
    const label = formatDateLabel(date, now);
    const clock = formatClock(p.hour, p.minute);
    if (label === '今天' || label === '昨天') {
        return `${label}，${p.weekday}，${clock}`;
    }
    return `${p.year}年${p.month}月${p.day}日，${p.weekday}，${clock}`;
}
/** 将 ISO 时间格式化为家人可读的中文时间 */
export function formatRevisionTime(iso, now = new Date()) {
    const date = new Date(iso);
    const p = getShanghaiParts(date);
    const dateLabel = formatDateLabel(date, now);
    const itemTime = formatClock(p.hour, p.minute);
    const groupTitle = `${dateLabel} · ${p.weekday}`;
    const full = `${dateLabel} · ${p.weekday} · ${itemTime}`;
    const dateKey = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    return {
        groupTitle,
        itemTime,
        full,
        speech: formatSpeechDate(date, now),
        dateKey,
    };
}
/** 按天分组版本列表 */
export function groupRevisionsByDay(items, now = new Date()) {
    const map = new Map();
    for (const item of items) {
        const { dateKey, groupTitle } = formatRevisionTime(item.createdAt, now);
        const existing = map.get(dateKey);
        if (existing) {
            existing.items.push(item);
        }
        else {
            map.set(dateKey, { groupTitle, items: [item] });
        }
    }
    return [...map.entries()]
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([dateKey, group]) => ({ dateKey, ...group }));
}
//# sourceMappingURL=formatRevisionTime.js.map