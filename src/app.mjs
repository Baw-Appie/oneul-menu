import { categories, menus, spiceLabels } from "./data.mjs";
import { applySearchResults, setupNaturalSearch } from "./ai-search.mjs";
import { favoriteButtonMarkup, toggleFavorite } from "./favorites.mjs";
import { setupMenuDuel } from "./menu-duel.mjs";
import { renderHistorySummary } from "./history-summary.mjs";
import {
  STORAGE_KEY,
  createState,
  defaultFilters,
  normalizeState,
  getMenuCandidates,
  pickMenu,
  addChoice,
  localDateKey,
} from "./core.mjs";

const categoryIcons = ["✦", "🍚", "🥟", "🍣", "🍝", "🍢", "🍜"];
const $ = (selector) => document.querySelector(selector);
const menuById = new Map(menus.map((menu) => [menu.id, menu]));
const dialog = $("#result-dialog");
let state = createState();
let selectedMenu = null;
let lastRecommendedId = null;
let toastTimeout;
let storageProblem = false;
let loadMessage = "";
let aiSearch;
let menuDuel;
let currentDay = localDateKey();
let resultReturnTarget;
let resultReturnMenuId;

function getCandidates() {
  return applySearchResults(
    getMenuCandidates(state),
    aiSearch?.state.menuIds ?? null,
  );
}

function clearAISearch() {
  aiSearch?.reset();
}

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    const parsed = JSON.parse(stored);
    state = normalizeState(parsed);
    const previousState =
      parsed && typeof parsed === "object"
        ? {
            version: parsed.version,
            filters: { ...defaultFilters, ...parsed.filters },
            excluded: parsed.excluded,
            favorites: parsed.favorites === undefined ? [] : parsed.favorites,
            history: parsed.history,
          }
        : parsed;
    if (JSON.stringify(previousState) !== JSON.stringify(state)) {
      loadMessage = "저장된 정보 중 유효하지 않은 항목을 초기화했어요.";
    }
  }
} catch {
  loadMessage = "저장된 정보를 불러오지 못했어요. 새로 선택할 수 있어요.";
}

function notify(message) {
  clearTimeout(toastTimeout);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimeout = setTimeout(() => {
    $("#toast").hidden = true;
  }, 4500);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageProblem = false;
    return true;
  } catch {
    if (!storageProblem)
      notify("브라우저에 저장할 수 없어요. 현재 화면에서만 유지돼요.");
    storageProblem = true;
    return false;
  }
}

document.querySelector("#category-options").innerHTML = categories
  .map(
    (category, index) => `
  <button class="chip" type="button" data-category="${category}" aria-pressed="${index === 0}"><span class="chip-emoji" aria-hidden="true">${categoryIcons[index]}</span>${category}</button>
`,
  )
  .join("");

document.querySelector("#budget-options").innerHTML = [
  [0, "상관없어요"],
  [7000, "7,000원 이하"],
  [10000, "10,000원 이하"],
  [15000, "15,000원 이하"],
]
  .map(
    ([value, label]) =>
      `<button class="chip" type="button" data-budget="${value}" aria-pressed="${value === 0}">${label}</button>`,
  )
  .join("");

document.querySelector("#spice-options").innerHTML = [
  ["all", "모두 좋아요"],
  ["0", "🌿 순한맛"],
  ["1", "🌶️ 보통"],
  ["2", "🔥 매운맛"],
]
  .map(
    ([value, label]) =>
      `<button class="chip" type="button" data-spice="${value}" aria-pressed="${value === "all"}">${label}</button>`,
  )
  .join("");

$("#recentDays-options").innerHTML = [
  [0, "끄기"],
  [3, "3일 동안 먹은 메뉴 제외"],
  [7, "7일 동안 먹은 메뉴 제외"],
]
  .map(
    ([value, label]) =>
      `<button class="chip" type="button" data-recent-days="${value}" aria-pressed="${value === 0}">${label}</button>`,
  )
  .join("");

$("#onlyFavorites-options").innerHTML = `
  <button class="chip" type="button" data-only-favorites="false" aria-pressed="true">전체 메뉴</button>
  <button class="chip" type="button" data-only-favorites="true" aria-pressed="false">♡ 즐겨찾기만 <span id="favorites-count">0</span></button>
`;

function cardMarkup(menu) {
  return `
  <article class="menu-card">
    <div class="card-art ${menu.color}">
      <span class="art-category">${menu.category}</span>
      <span class="food-emoji" aria-hidden="true">${menu.emoji}</span>
      ${favoriteButtonMarkup(menu, state.favorites.includes(menu.id))}
      <button type="button" class="exclude-button" data-exclude="${menu.id}"
        aria-label="${menu.name} 추천에서 제외" title="추천에서 제외">−</button>
    </div>
    <div class="card-body">
      <div class="card-title-row">
        <h3>${menu.name}</h3>
        <span class="spice-pill ${menu.spice > 0 ? "hot" : ""}">${spiceLabels[menu.spice]}</span>
      </div>
      <p class="card-description">${menu.description}</p>
      <div class="tags">
        ${menu.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
      </div>
      <div class="card-bottom">
        <span class="price"><small>예상</small>${menu.price.toLocaleString("ko-KR")}원</span>
        <button type="button" class="choose-button" data-choose="${menu.id}"
          aria-label="${menu.name} 선택하기">이 메뉴로 <span aria-hidden="true">↗</span></button>
      </div>
    </div>
  </article>
`;
}

function renderMenus() {
  const candidates = getCandidates();
  $("#menu-grid").innerHTML = candidates.map(cardMarkup).join("");
  $("#match-count").textContent = candidates.length;
  $("#menu-count").textContent = candidates.length;
  $("#empty-state").hidden = candidates.length !== 0;
  $("#empty-restore").hidden = state.excluded.length === 0;
  $("#empty-recent").hidden = state.filters.recentDays === 0;
  $("#empty-favorites").hidden = !state.filters.onlyFavorites;
  $("#recommend").disabled = candidates.length === 0;
  $("#filter-status").textContent =
    `현재 조건에 맞는 메뉴 ${candidates.length}개`;
  $("#excluded-count").textContent = state.excluded.length;
  $("#favorites-count").textContent = state.favorites.length;

  for (const key of ["category", "budget", "spice"]) {
    document.querySelectorAll(`[data-${key}]`).forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset[key] === String(state.filters[key])),
      );
    });
  }

  document.querySelectorAll("[data-recent-days]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.recentDays) === state.filters.recentDays),
    );
  });
  document.querySelectorAll("[data-only-favorites]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(
        (button.dataset.onlyFavorites === "true") === state.filters.onlyFavorites,
      ),
    );
  });

  $("#excluded-panel").innerHTML = state.excluded.length
    ? `${state.excluded.map((id) => `<button type="button" data-restore="${id}" aria-label="${menuById.get(id).name} 제외 해제">${menuById.get(id).emoji} ${menuById.get(id).name} <span aria-hidden="true">×</span></button>`).join("")}<button type="button" id="restore-all">모두 다시 포함</button>`
    : "<p>제외한 메뉴가 없어요. 메뉴 카드의 − 버튼으로 잠시 빼둘 수 있어요.</p>";
  menuDuel?.refresh();
}

function displayDate(key) {
  if (key === localDateKey()) return "오늘";
  const [year, month, day] = key.split("-").map(Number);
  return `${year}. ${month}. ${day}.`;
}

function renderHistory() {
  renderHistorySummary($("#history-summary"), state.history);
  $("#history-count").textContent = state.history.length;
  $("#history-list").innerHTML = state.history.length
    ? state.history
        .map((item) => {
          const menu = menuById.get(item.menuId);
          return `<article class="history-item"><span class="history-emoji ${menu.color}" aria-hidden="true">${menu.emoji}</span><div class="history-info"><h3>${menu.name}</h3><p><time datetime="${item.date}">${displayDate(item.date)}</time> · ${menu.category}</p></div><button type="button" class="icon-button" data-delete="${item.date}:${item.menuId}" aria-label="${item.date} ${menu.name} 기록 삭제">×</button></article>`;
        })
        .join("")
    : '<div class="history-empty"><span aria-hidden="true">🍽️</span><div><strong>아직 비어 있는 나만의 메뉴 기록</strong><p>오늘의 메뉴를 결정하면 여기에 차곡차곡 쌓여요.</p></div></div>';
}

function showMenu(menu, origin) {
  if (!menu || !getCandidates().some((candidate) => candidate.id === menu.id)) {
    notify("현재 조건에 맞는 메뉴를 다시 골라 주세요.");
    return;
  }
  selectedMenu = menu;
  lastRecommendedId = menu.id;
  $("#result-title").textContent = menu.name;
  $("#result-description").textContent = menu.description;
  $("#result-art").className = `result-art ${menu.color}`;
  $("#result-art").textContent = menu.emoji;
  $("#result-art").setAttribute("aria-hidden", "true");
  $("#result-meta").textContent =
    `${menu.category} · 예상 ${menu.price.toLocaleString("ko-KR")}원 · ${spiceLabels[menu.spice]}`;
  const hasAlternative = getCandidates().some(
    (candidate) => candidate.id !== menu.id,
  );
  $("#reroll").disabled = !hasAlternative;
  $("#reroll").textContent = hasAlternative
    ? "↻ 다른 메뉴 추천받기"
    : "현재 조건에서는 이 메뉴 하나예요";
  if (!dialog.open) {
    resultReturnTarget = origin ?? document.activeElement;
    resultReturnMenuId = resultReturnTarget?.dataset.choose;
    dialog.showModal();
  }
}

function recommend() {
  refreshDay();
  const candidates = getCandidates();
  const menu = pickMenu(candidates, lastRecommendedId);
  if (menu) showMenu(menu, $("#recommend"));
  else
    notify("조건에 맞는 메뉴가 없어요. 조건이나 제외한 메뉴를 확인해 주세요.");
}

function resetFilters(event) {
  clearAISearch();
  state.filters = { ...defaultFilters };
  $("#search").value = "";
  renderMenus();
  persist();
  if (event?.currentTarget === $("#empty-reset")) {
    ($("#recommend").disabled ? $("#toggle-excluded") : $("#recommend")).focus({
      preventScroll: true,
    });
  }
}

for (const key of ["category", "budget", "spice", "recentDays", "onlyFavorites"]) {
  $(`#${key}-options`).addEventListener("click", (event) => {
    const attribute = key.replace(
      /[A-Z]/g,
      (letter) => `-${letter.toLowerCase()}`,
    );
    const button = event.target.closest(`[data-${attribute}]`);
    if (!button) return;
    clearAISearch();
    state.filters[key] =
      key === "budget" || key === "recentDays"
        ? Number(button.dataset[key])
        : key === "onlyFavorites"
          ? button.dataset[key] === "true"
          : button.dataset[key];
    renderMenus();
    persist();
  });
}

$("#search").value = state.filters.search;
$("#search").addEventListener("input", (event) => {
  clearAISearch();
  state.filters.search = event.target.value.slice(0, 80);
  renderMenus();
  persist();
});
$("#reset-filters").addEventListener("click", resetFilters);
$("#empty-reset").addEventListener("click", resetFilters);
$("#empty-recent").addEventListener("click", () => {
  clearAISearch();
  state.filters.recentDays = 0;
  renderMenus();
  persist();
  $("#recentDays-options button").focus({ preventScroll: true });
});
$("#empty-favorites").addEventListener("click", () => {
  clearAISearch();
  state.filters.onlyFavorites = false;
  renderMenus();
  persist();
  $("#onlyFavorites-options button").focus({ preventScroll: true });
});
$("#empty-restore").addEventListener("click", () => {
  clearAISearch();
  state.excluded = [];
  renderMenus();
  persist();
  ($("#recommend").disabled ? $("#empty-reset") : $("#recommend")).focus({
    preventScroll: true,
  });
});
$("#recommend").addEventListener("click", recommend);
$("#reroll").addEventListener("click", recommend);
$("#close-dialog").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  const cardButton = resultReturnMenuId
    ? document.querySelector(`[data-choose="${resultReturnMenuId}"]`)
    : null;
  const target =
    resultReturnTarget?.isConnected && !resultReturnTarget.disabled
      ? resultReturnTarget
      : cardButton ??
        ($("#recommend").disabled ? $("#reset-filters") : $("#recommend"));
  target?.focus({ preventScroll: true });
});

$("#menu-grid").addEventListener("click", (event) => {
  const favorite = event.target.closest("[data-favorite]");
  if (favorite) {
    const menuId = favorite.dataset.favorite;
    const buttons = [...document.querySelectorAll("[data-favorite]")];
    const index = buttons.indexOf(favorite);
    clearAISearch();
    state.favorites = toggleFavorite(state.favorites, menuId);
    renderMenus();
    const nextButtons = [...document.querySelectorAll("[data-favorite]")];
    const next =
      nextButtons.find((button) => button.dataset.favorite === menuId) ??
      nextButtons[Math.min(index, nextButtons.length - 1)] ??
      $("#onlyFavorites-options button");
    next.focus({ preventScroll: true });
    const saved = persist();
    const added = state.favorites.includes(menuId);
    notify(
      saved
        ? `${menuById.get(menuId).name}을(를) 즐겨찾기${added ? "에 추가했어요." : "에서 해제했어요."}`
        : "즐겨찾기를 변경했지만 저장하지 못했어요. 현재 화면에서만 유지돼요.",
    );
    return;
  }
  const choose = event.target.closest("[data-choose]");
  if (choose) showMenu(menuById.get(choose.dataset.choose), choose);
  const exclude = event.target.closest("[data-exclude]");
  if (exclude) {
    const buttons = [...document.querySelectorAll("[data-exclude]")];
    const index = buttons.indexOf(exclude);
    clearAISearch();
    state.excluded = [...new Set([...state.excluded, exclude.dataset.exclude])];
    renderMenus();
    const nextButtons = document.querySelectorAll("[data-exclude]");
    (
      nextButtons[Math.min(index, nextButtons.length - 1)] ??
      $("#toggle-excluded")
    ).focus({ preventScroll: true });
    const saved = persist();
    notify(
      saved
        ? `${menuById.get(exclude.dataset.exclude).name}을(를) 추천에서 뺐어요. ‘제외한 메뉴’에서 되돌릴 수 있어요.`
        : "메뉴를 제외했지만 저장하지 못했어요. 현재 화면에서만 유지돼요.",
    );
  }
});

$("#toggle-excluded").addEventListener("click", () => {
  const isExpanded =
    $("#toggle-excluded").getAttribute("aria-expanded") === "true";
  $("#toggle-excluded").setAttribute("aria-expanded", String(!isExpanded));
  $("#excluded-panel").hidden = isExpanded;
});

$("#excluded-panel").addEventListener("click", (event) => {
  const restore = event.target.closest("[data-restore]");
  if (restore)
    state.excluded = state.excluded.filter(
      (id) => id !== restore.dataset.restore,
    );
  else if (event.target.closest("#restore-all")) state.excluded = [];
  else return;
  clearAISearch();
  renderMenus();
  persist();
  ($("#excluded-panel button") ?? $("#toggle-excluded")).focus({
    preventScroll: true,
  });
});

$("#confirm-menu").addEventListener("click", () => {
  if (!selectedMenu) return;
  refreshDay();
  if (!getCandidates().some((candidate) => candidate.id === selectedMenu.id)) {
    dialog.close();
    notify("조건이 바뀌었어요. 현재 후보에서 메뉴를 다시 골라 주세요.");
    return;
  }
  const result = addChoice(state.history, selectedMenu.id);
  state.history = result.history;
  dialog.close();
  if (result.added) clearAISearch();
  renderMenus();
  renderHistory();
  const saved = persist();
  notify(
    !saved
      ? "선택했지만 브라우저에 저장하지 못했어요. 현재 화면에서만 유지돼요."
      : result.added
        ? `오늘은 ${selectedMenu.name}! 맛있는 한 끼 되세요. 기록에 남겨뒀어요.`
        : "오늘 이미 선택한 메뉴예요. 기록은 한 번만 남겨둘게요.",
  );
});

$("#history-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  state.history = state.history.filter(
    (item) => `${item.date}:${item.menuId}` !== button.dataset.delete,
  );
  clearAISearch();
  renderMenus();
  renderHistory();
  const saved = persist();
  const focusTarget = $("#history-list button") ?? $("#history-title");
  if (focusTarget === $("#history-title"))
    focusTarget.setAttribute("tabindex", "-1");
  focusTarget.focus({ preventScroll: true });
  notify(
    saved
      ? "선택 기록을 삭제했어요."
      : "현재 화면에서 삭제했지만 저장하지 못했어요. 새로고침하면 기록이 다시 보일 수 있어요.",
  );
});

renderMenus();
renderHistory();
menuDuel = setupMenuDuel({
  trigger: $("#compare-menus"),
  getCandidates,
  onChoose: (menu) => showMenu(menu, $("#compare-menus")),
  notify,
});
menuDuel.refresh();
aiSearch = setupNaturalSearch({
  getCandidates: () => getMenuCandidates(state),
  onResultsChange: renderMenus,
});

function refreshDay() {
  const today = localDateKey();
  if (today === currentDay) return;
  currentDay = today;
  clearAISearch();
  renderMenus();
  renderHistory();
  if (dialog.open) {
    if (getCandidates().some((menu) => menu.id === selectedMenu?.id)) {
      showMenu(selectedMenu);
    } else {
      dialog.close();
      notify("날짜가 바뀌었어요. 현재 후보에서 메뉴를 다시 골라 주세요.");
    }
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshDay();
});
window.addEventListener("focus", refreshDay);
setInterval(refreshDay, 30000);
if (loadMessage) notify(loadMessage);
