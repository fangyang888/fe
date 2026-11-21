export const ZODIACS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const;
export type Zodiac = (typeof ZODIACS)[number];

const zodiacSet = new Set<string>(ZODIACS);
export const isZodiac = (value: unknown): value is Zodiac => typeof value === 'string' && zodiacSet.has(value);
