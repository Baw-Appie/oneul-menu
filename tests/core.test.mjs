import { test } from "node:test";
import assert from "node:assert/strict";
import { categories, menus } from "../src/data.mjs";
import {
  addChoice,
  createState,
  defaultFilters,
  filterMenus,
  normalizeState,
  pickMenu,
} from "../src/core.mjs";
import { filterRecentMeals } from "../src/recent-meals.mjs";
import { toggleFavorite } from "../src/favorites.mjs";

const byId = (id) => menus.find((menu) => menu.id === id);
const withFilters = (overrides) => ({ ...defaultFilters, ...overrides });

test("메뉴 ID는 고유하고 가격·매운맛·종류가 유효하다", () => {
  assert.equal(new Set(menus.map(({ id }) => id)).size, menus.length);
  for (const { id, price, spice, category } of menus) {
    assert.ok(Number.isInteger(price) && price > 0, id);
    assert.ok([0, 1, 2].includes(spice), id);
    assert.ok(categories.slice(1).includes(category), id);
  }
});

test("필터는 AND로 결합하고 예산과 같은 가격을 포함한다", () => {
  const result = filterMenus(
    withFilters({ category: "한식", budget: 10000, spice: "0" }),
  );
  assert.ok(
    result.every(
      (menu) =>
        menu.category === "한식" && menu.price <= 10000 && menu.spice === 0,
    ),
  );
  assert.ok(result.includes(byId("bulgogi")));
  assert.ok(!result.includes(byId("kimchi-stew")));
});

test("검색어는 공백·한글 분해 문자를 정규화하고 제외한 메뉴는 뺀다", () => {
  const search = ` ${"불고기".normalize("NFD")} `;
  assert.ok(filterMenus(withFilters({ search })).includes(byId("bulgogi")));
  assert.ok(
    !filterMenus(withFilters({ search }), ["bulgogi"]).includes(byId("bulgogi")),
  );
});

test("추천은 후보 0/1/다수를 구분하고 직전 추천을 피한다", () => {
  const [a, b, c] = menus;
  assert.equal(pickMenu([]), null);
  assert.equal(pickMenu([a], a.id), a);
  assert.deepEqual(
    [0, 0.5, 0.99].map((value) => pickMenu([a, b, c], a.id, () => value)),
    [b, c, c],
  );
});

test("같은 로컬 날짜의 같은 메뉴는 한 번만 기록하고 최신 30개를 유지한다", () => {
  const today = new Date(2026, 10, 2, 0, 30);
  const first = addChoice([], "bibimbap", today);
  assert.deepEqual(first, {
    history: [{ menuId: "bibimbap", date: "2026-11-02" }],
    added: true,
  });
  assert.equal(addChoice(first.history, "bibimbap", today).added, false);
  assert.equal(
    addChoice(first.history, "bibimbap", new Date(2026, 10, 3)).added,
    true,
  );
  assert.equal(addChoice([], "unknown-menu", today).added, false);

  const full = menus
    .slice(0, 30)
    .map(({ id }) => ({ menuId: id, date: "2026-11-01" }));
  const { history } = addChoice(full, menus[30].id, today);
  assert.equal(history.length, 30);
  assert.equal(history[0].menuId, menus[30].id);
});

test("저장값의 잘못된 항목은 버리고 알 수 없는 버전은 초기화한다", () => {
  const state = normalizeState({
    version: 1,
    filters: {
      category: "피자",
      budget: 12345,
      spice: 3,
      search: 42,
      recentDays: 5,
      onlyFavorites: "yes",
    },
    excluded: ["bibimbap", "bibimbap", "ghost"],
    favorites: ["pho", "ghost"],
    history: [
      { menuId: "pho", date: "2026-11-01" },
      { menuId: "pho", date: "2026-11-01" },
      { menuId: "pho", date: "2026-02-30" },
      { menuId: "ghost", date: "2026-11-01" },
    ],
  });
  assert.deepEqual(state, {
    ...createState(),
    excluded: ["bibimbap"],
    favorites: ["pho"],
    history: [{ menuId: "pho", date: "2026-11-01" }],
  });
  assert.deepEqual(
    normalizeState({ version: 2, excluded: ["pho"] }),
    createState(),
  );
});

test("최근 먹은 메뉴 제외는 오늘을 포함한 로컬 날짜로 계산한다", () => {
  const history = [
    { menuId: "pho", date: "2026-11-02" },
    { menuId: "udon", date: "2026-10-31" },
    { menuId: "gimbap", date: "2026-10-30" },
  ];
  const removed = (days) => {
    const left = new Set(
      filterRecentMeals(menus, history, days, new Date(2026, 10, 2, 23, 59)),
    );
    return history.map(({ menuId }) => menuId).filter((id) => !left.has(byId(id)));
  };
  assert.deepEqual(removed(0), []);
  assert.deepEqual(removed(3), ["pho", "udon"]);
  assert.deepEqual(removed(7), ["pho", "udon", "gimbap"]);
});

test("즐겨찾기는 알려진 메뉴만 추가·해제한다", () => {
  assert.deepEqual(toggleFavorite([], "pho"), ["pho"]);
  assert.deepEqual(toggleFavorite(["pho"], "pho"), []);
  assert.deepEqual(toggleFavorite(["pho"], "ghost"), ["pho"]);
});
