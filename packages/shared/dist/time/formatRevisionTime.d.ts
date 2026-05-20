export type DayPeriod = '上午' | '下午' | '晚上' | '夜里';
export interface FormattedRevisionTime {
    /** 列表主标题，如：今天 · 周二 */
    groupTitle: string;
    /** 列表项时间，如：下午 3点20分 */
    itemTime: string;
    /** 完整展示，如：今天 · 周二 · 下午 3点20分 */
    full: string;
    /** 朗读用 */
    speech: string;
    dateKey: string;
}
/** 将 ISO 时间格式化为家人可读的中文时间 */
export declare function formatRevisionTime(iso: string, now?: Date): FormattedRevisionTime;
/** 按天分组版本列表 */
export declare function groupRevisionsByDay<T extends {
    createdAt: string;
}>(items: T[], now?: Date): Array<{
    dateKey: string;
    groupTitle: string;
    items: T[];
}>;
//# sourceMappingURL=formatRevisionTime.d.ts.map