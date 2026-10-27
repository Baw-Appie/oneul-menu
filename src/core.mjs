import { categories, menus } from "./data.mjs";
import { normalizeRecentDays, filterRecentMeals } from "./recent-meals.mjs";
import { normalizeFavorites, filterFavorites } from "./favorites.mjs";

export const STORAGE_KEY = "oneul-menu:v1";
export const defaultFilters = Object.freeze({
  category: "전체",
  budget: 0,
  spice: "all",
  search: "",
  recentDays: 0,
  onlyFavorites: false,
});
const knownIds = new Set(menus.map((menu) => menu.id));

export function createState() {
  return {
    version: 1,
    filters: { ...defaultFilters },
    excluded: [],
    favorites: [],
    history: [],
  };
}

// 기록의 하루 경계는 UTC가 아니라 사용자가 보고 있는 로컬 날짜입니다.
export function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    year >= 2000 &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

export function normalizeState(value) {
  const clean = createState();
  if (!value || typeof value !== "object" || value.version !== 1) return clean;

  const filters = value.filters ?? {};
  if (categories.includes(filters.category))
    clean.filters.category = filters.category;
  if ([0, 7000, 10000, 15000].includes(filters.budget))
    clean.filters.budget = filters.budget;
  if (["all", "0", "1", "2"].includes(filters.spice))
    clean.filters.spice = filters.spice;
  if (typeof filters.search === "string")
    clean.filters.search = filters.search.slice(0, 80);
  clean.filters.recentDays = normalizeRecentDays(filters.recentDays);
  clean.filters.onlyFavorites = filters.onlyFavorites === true;
  clean.favorites = normalizeFavorites(value.favorites);
  if (Array.isArray(value.excluded))
    clean.excluded = [
      ...new Set(value.excluded.filter((id) => knownIds.has(id))),
    ];

  if (Array.isArray(value.history)) {
    const seen = new Set();
    for (const item of value.history) {
      if (!item || !knownIds.has(item.menuId) || !isCalendarDate(item.date))
        continue;
      const key = `${item.date}:${item.menuId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.history.push({ menuId: item.menuId, date: item.date });
      if (clean.history.length === 30) break;
    }
  }
  return clean;
}

export function filterMenus(filters, excluded = []) {
  const omitted = new Set(excluded);
  const query = filters.search
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR");
  return menus.filter((menu) => {
    const searchable =
      `${menu.name} ${menu.category} ${menu.description} ${menu.tags.join(" ")}`
        .normalize("NFC")
        .toLocaleLowerCase("ko-KR");
    return (
      !omitted.has(menu.id) &&
      (filters.category === "전체" || menu.category === filters.category) &&
      (filters.budget === 0 || menu.price <= filters.budget) &&
      (filters.spice === "all" || menu.spice === Number(filters.spice)) &&
      (!query || searchable.includes(query))
    );
  });
}

// 화면·랜덤 추천·두 메뉴 비교·AI 검색이 하나의 후보 집합을 사용합니다.
export function getMenuCandidates(state, now = new Date()) {
  return filterRecentMeals(
    filterFavorites(
      filterMenus(state.filters, state.excluded),
      state.favorites,
      state.filters.onlyFavorites,
    ),
    state.history,
    state.filters.recentDays,
    now,
  );
}

export function pickMenu(candidates, previousId = null, random = Math.random) {
  if (candidates.length === 0) return null;
  const pool =
    candidates.length > 1
      ? candidates.filter((menu) => menu.id !== previousId)
      : candidates;
  return pool[Math.floor(random() * pool.length)];
}

export function addChoice(history, menuId, date = new Date()) {
  if (!knownIds.has(menuId)) return { history, added: false };
  const day = localDateKey(date);
  if (history.some((item) => item.menuId === menuId && item.date === day))
    return { history, added: false };
  return {
    history: [{ menuId, date: day }, ...history].slice(0, 30),
    added: true,
  };
}
