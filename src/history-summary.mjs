import { categories, menus } from "./data.mjs";

const menuById = new Map(menus.map((menu) => [menu.id, menu]));

function localDateKey(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return (
    year >= 2000 &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

export function summarizeHistory(history, now = new Date()) {
  const summary = {
    totalChoices: 0,
    uniqueMenus: 0,
    activeDays: 0,
    topCategories: [],
    recentChoices: [],
  };

  if (
    !Array.isArray(history) ||
    !(now instanceof Date) ||
    Number.isNaN(now.getTime()) ||
    now.getFullYear() < 2000 ||
    now.getFullYear() > 9999
  ) {
    return summary;
  }

  const today = localDateKey(now);
  // 로컬 달력에서 6일을 거슬러 올라가며, DST의 하루 길이에 의존하지 않습니다.
  const firstDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6,
    12,
  );
  const firstDate = localDateKey(firstDay);
  const seen = new Set();

  for (const item of history) {
    if (
      !item ||
      !menuById.has(item.menuId) ||
      !isCalendarDate(item.date) ||
      item.date < firstDate ||
      item.date > today
    ) {
      continue;
    }

    const key = `${item.date}:${item.menuId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    summary.recentChoices.push({ menuId: item.menuId, date: item.date });
  }

  // 안정 정렬이므로 같은 날짜의 항목은 전달된 history 순서를 유지합니다.
  summary.recentChoices.sort((a, b) => b.date.localeCompare(a.date));
  summary.totalChoices = summary.recentChoices.length;
  summary.uniqueMenus = new Set(
    summary.recentChoices.map((item) => item.menuId),
  ).size;
  summary.activeDays = new Set(
    summary.recentChoices.map((item) => item.date),
  ).size;

  const categoryCounts = new Map();
  let highestCount = 0;
  for (const item of summary.recentChoices) {
    const { category } = menuById.get(item.menuId);
    const count = (categoryCounts.get(category) ?? 0) + 1;
    categoryCounts.set(category, count);
    highestCount = Math.max(highestCount, count);
  }

  // 공동 1위는 데이터의 음식 종류 순서로 표시해 기록 순서에 흔들리지 않습니다.
  summary.topCategories = categories
    .filter((name) => categoryCounts.get(name) === highestCount)
    .map((name) => ({ name, count: highestCount }));

  return summary;
}

export function renderHistorySummary(container, history, now = new Date()) {
  const summary = summarizeHistory(history, now);
  const document = container.ownerDocument;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const section = element("section", "history-summary");
  section.setAttribute("aria-label", "나의 한 주 메뉴");

  const header = element("div", "history-summary-header");
  header.append(
    element("h3", "history-summary-title", "나의 한 주 메뉴"),
    element(
      "p",
      "history-summary-note",
      "이 브라우저에 저장된 최근 7일 기록 기준",
    ),
  );

  const stats = element("dl", "history-summary-stats");
  for (const [label, value, unit] of [
    ["선택 횟수", summary.totalChoices, "회"],
    ["서로 다른 메뉴", summary.uniqueMenus, "개"],
    ["기록한 날짜", summary.activeDays, "일"],
  ]) {
    const stat = element("div", "history-summary-stat");
    const count = element("dd", "history-summary-stat-value");
    count.append(
      element("span", "history-summary-number", String(value)),
      element("span", "history-summary-unit", unit),
    );
    stat.append(element("dt", "history-summary-stat-label", label), count);
    stats.append(stat);
  }

  const details = element("div", "history-summary-details");
  const categorySection = element("div", "history-summary-categories");
  categorySection.append(
    element("h4", "history-summary-subtitle", "자주 고른 종류"),
  );

  if (summary.topCategories.length > 0) {
    const categoryList = element("ul", "history-summary-category-list");
    for (const { name, count } of summary.topCategories) {
      const category = element("li", "history-summary-category");
      category.append(
        element("span", "history-summary-category-name", name),
        element("span", "history-summary-category-count", `${count}회`),
      );
      categoryList.append(category);
    }
    categorySection.append(categoryList);
    if (summary.topCategories.length > 1) {
      categorySection.append(
        element("p", "history-summary-hint", "공동 1위예요."),
      );
    }
  } else {
    categorySection.append(
      element(
        "p",
        "history-summary-empty",
        "메뉴를 고르면 자주 고른 종류를 알려드려요.",
      ),
    );
  }

  const recentSection = element("div", "history-summary-recent");
  recentSection.append(
    element("h4", "history-summary-subtitle", "최근 메뉴"),
  );

  if (summary.recentChoices.length > 0) {
    const recentList = element("ol", "history-summary-recent-list");
    for (const item of summary.recentChoices.slice(0, 7)) {
      const menu = menuById.get(item.menuId);
      const choice = element("li", "history-summary-choice");
      const emoji = element("span", "history-summary-emoji", menu.emoji);
      emoji.setAttribute("aria-hidden", "true");

      const [year, month, day] = item.date.split("-").map(Number);
      const date = element(
        "time",
        "history-summary-date",
        `${year}. ${month}. ${day}.`,
      );
      date.dateTime = item.date;
      choice.append(
        emoji,
        element("span", "history-summary-menu-name", menu.name),
        date,
      );
      recentList.append(choice);
    }
    recentSection.append(recentList);
    if (summary.recentChoices.length > 7) {
      recentSection.append(
        element("p", "history-summary-hint", "최근 7건을 보여드려요."),
      );
    }
  } else {
    recentSection.append(
      element(
        "p",
        "history-summary-empty",
        "최근 7일에 고른 메뉴가 아직 없어요. 오늘의 메뉴를 확정해 첫 기록을 남겨 보세요.",
      ),
    );
  }

  details.append(categorySection, recentSection);
  section.append(
    header,
    stats,
    details,
    element(
      "p",
      "history-summary-limit",
      "선택 기록은 최대 30건까지 보관해요. 기록이 많으면 최근 7일의 일부 기록이 요약에서 빠질 수 있어요.",
    ),
  );
  container.replaceChildren(section);
  return summary;
}
