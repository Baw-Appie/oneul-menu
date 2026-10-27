const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function normalizeRecentDays(value) {
  return value === 3 || value === 7 ? value : 0;
}

function calendarDayNumber(year, month, day) {
  // UTC는 로컬 날짜의 연·월·일을 일정한 간격의 달력 번호로만 표현합니다.
  // 실제 시각을 UTC 날짜로 바꾸거나 DST가 있는 로컬 시각을 빼지 않습니다.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime() / MILLISECONDS_PER_DAY;
}

function parseCalendarDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;

  return date.getTime() / MILLISECONDS_PER_DAY;
}

export function filterRecentMeals(
  candidates,
  history,
  days,
  now = new Date(),
) {
  if (!Array.isArray(candidates)) return [];

  const recentDays = normalizeRecentDays(days);
  if (
    recentDays === 0 ||
    !Array.isArray(history) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  )
    return candidates.slice();

  const today = calendarDayNumber(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
  );
  const firstDay = today - recentDays + 1;
  const recentIds = new Set();

  for (const item of history) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof item.menuId !== "string" ||
      item.menuId.length === 0
    )
      continue;

    const day = parseCalendarDay(item.date);
    if (day !== null && day >= firstDay && day <= today)
      recentIds.add(item.menuId);
  }

  return candidates.filter((menu) => !recentIds.has(menu?.id));
}
