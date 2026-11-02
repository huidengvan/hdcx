/**
 * 分类筛选项（两种搜索共用，URL 参数 c 存筛选项 id）
 * 「慧灯禅修课」合并接口的视频字幕（video）与课程法本（books）两个分类，其余筛选项与接口分类同名
 */
export const COURSE = { id: 'course', label: '慧灯禅修课', cats: ['video', 'books'] };

/** 筛选项 id → 接口分类 */
export const toApiCats = (ids) => ids.flatMap((id) => (id === COURSE.id ? COURSE.cats : [id]));

/** 旧链接中的 video / books 视为慧灯禅修课 */
export const fromUrlCats = (list) => [...new Set(list.map((c) => (COURSE.cats.includes(c) ? COURSE.id : c)))];
