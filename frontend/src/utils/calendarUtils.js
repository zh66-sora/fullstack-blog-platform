/**
 * 日历视图模型 — utils 层（纯函数）
 * =========================================================================
 * 迁移自 myBlog/app/utils/calendarViewModel.js
 * 职责：把「锚定月份 + 已选两端日期」换算成日历网格渲染所需的纯数据，
 *       模板里不再出现任何日期计算（原版因为 Handlebars 没有 helper，
 *       所有 selected / inRange 布尔值都必须在 JS 层预先算好，这个约定沿用下来）。
 *
 * ⚠ 与后端日期口径对齐：全部用本地时间构造 Date，日期串用 yyyy-MM-dd，
 *   与 utils/dateUtils.js 的 formatDate / parseDate 互为逆运算。
 */

/** 补零 */
function pad(n) {
  return (n < 10 ? "0" : "") + n;
}

/** 某月天数（month: 0-indexed） */
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/** 某天是星期几（0=周日） */
function getWeekday(year, month, day) {
  return new Date(year, month, day).getDay();
}

/** 拼 yyyy-MM-dd */
function toDateStr(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/**
 * 构建单个月份的日历数据
 *
 * 选中态规则（V14 单选模式 + V16 范围高亮）：
 *   两端都有值 → 高亮整段 [start, end]，两端各自标记为 isRangeStart / isRangeEnd
 *   只有一端   → 只标记那一端（编辑哪一端由调用方的 mode 决定，这里只看有没有值）
 *   未来日期   → isDisabled（不能选还没到的日子）
 *
 * @param {Date} anchorDate — 当前锚定日期，决定展示哪个月
 * @param {Date|null} rangeStart — 已选起始
 * @param {Date|null} rangeEnd — 已选结束
 * @returns {object} { title, year, month, days[], prevYear, prevMonth, nextYear, nextMonth }
 */
export function buildCalendarData(anchorDate, rangeStart, rangeEnd) {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth(); // 0-indexed
  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getWeekday(year, month, 1); // 1 号是周几

  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const startStr = rangeStart
    ? toDateStr(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate())
    : null;
  const endStr = rangeEnd
    ? toDateStr(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate())
    : null;

  const days = [];

  // 前置空白格：把 1 号顶到正确的星期列上
  for (let i = 0; i < firstWeekday; i++) {
    days.push({ day: "", blank: true, key: `blank-${i}` });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(year, month, d);
    const isToday = dateStr === todayStr;
    // 字符串比较即可：yyyy-MM-dd 定长，字典序 === 时间序
    const isDisabled = dateStr > todayStr;

    let inRange = false;
    let isRangeStart = false;
    let isRangeEnd = false;
    if (startStr && endStr) {
      isRangeStart = dateStr === startStr;
      isRangeEnd = dateStr === endStr;
      inRange = dateStr >= startStr && dateStr <= endStr;
    } else if (startStr) {
      isRangeStart = dateStr === startStr;
    } else if (endStr) {
      isRangeEnd = dateStr === endStr;
    }

    days.push({
      key: dateStr,
      day: d,
      dateStr,
      isToday,
      isDisabled,
      inRange,
      isRangeStart,
      isRangeEnd,
    });
  }

  return {
    title: `${year}年${month + 1}月`,
    year,
    month: month + 1,
    days,
    // 前后月份导航需要的坐标（跨年由这里算好，模板不参与计算）
    prevMonth: month === 0 ? 11 : month - 1,
    prevYear: month === 0 ? year - 1 : year,
    nextMonth: month === 11 ? 0 : month + 1,
    nextYear: month === 11 ? year + 1 : year,
  };
}
