import { categories, menus, spiceLabels } from "./data.mjs";
import {
  STORAGE_KEY,
  createState,
  defaultFilters,
  normalizeState,
  filterMenus,
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

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    const parsed = JSON.parse(stored);
    state = normalizeState(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(state)) {
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

function cardMarkup(menu) {
  return `
  <article class="menu-card">
    <div class="card-art ${menu.color}"><span class="art-category">${menu.category}</span><span class="food-emoji" aria-hidden="true">${menu.emoji}</span><button type="button" class="exclude-button" data-exclude="${menu.id}" aria-label="${menu.name} 추천에서 제외" title="추천에서 제외">−</button></div>
    <div class="card-body"><div class="card-title-row"><h3>${menu.name}</h3><span class="spice-pill ${menu.spice > 0 ? "hot" : ""}">${spiceLabels[menu.spice]}</span></div><p class="card-description">${menu.description}</p><div class="tags">${menu.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div><div class="card-bottom"><span class="price"><small>예상</small>${menu.price.toLocaleString("ko-KR")}원</span><button type="button" class="choose-button" data-choose="${menu.id}" aria-label="${menu.name} 선택하기">이 메뉴로 <span aria-hidden="true">↗</span></button></div></div>
  </article>
`;
}

function renderMenus() {
  const candidates = filterMenus(state.filters, state.excluded);
  $("#menu-grid").innerHTML = candidates.map(cardMarkup).join("");
  $("#match-count").textContent = candidates.length;
  $("#menu-count").textContent = candidates.length;
  $("#empty-state").hidden = candidates.length !== 0;
  $("#empty-restore").hidden = state.excluded.length === 0;
  $("#recommend").disabled = candidates.length === 0;
  $("#filter-status").textContent =
    `현재 조건에 맞는 메뉴 ${candidates.length}개`;
  $("#excluded-count").textContent = state.excluded.length;

  for (const key of ["category", "budget", "spice"]) {
    document.querySelectorAll(`[data-${key}]`).forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset[key] === String(state.filters[key])),
      );
    });
  }

  $("#excluded-panel").innerHTML = state.excluded.length
    ? `${state.excluded.map((id) => `<button type="button" data-restore="${id}" aria-label="${menuById.get(id).name} 제외 해제">${menuById.get(id).emoji} ${menuById.get(id).name} <span aria-hidden="true">×</span></button>`).join("")}<button type="button" id="restore-all">모두 다시 포함</button>`
    : "<p>제외한 메뉴가 없어요. 메뉴 카드의 − 버튼으로 잠시 빼둘 수 있어요.</p>";
}

function displayDate(key) {
  if (key === localDateKey()) return "오늘";
  const [year, month, day] = key.split("-").map(Number);
  return `${year}. ${month}. ${day}.`;
}

function renderHistory() {
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

function showMenu(menu) {
  if (!menu) return;
  selectedMenu = menu;
  lastRecommendedId = menu.id;
  $("#result-title").textContent = menu.name;
  $("#result-description").textContent = menu.description;
  $("#result-art").className = `result-art ${menu.color}`;
  $("#result-art").textContent = menu.emoji;
  $("#result-art").setAttribute("aria-hidden", "true");
  $("#result-meta").textContent =
    `${menu.category} · 예상 ${menu.price.toLocaleString("ko-KR")}원 · ${spiceLabels[menu.spice]}`;
  const hasAlternative = filterMenus(state.filters, state.excluded).some(
    (candidate) => candidate.id !== menu.id,
  );
  $("#reroll").disabled = !hasAlternative;
  $("#reroll").textContent = hasAlternative
    ? "↻ 다른 메뉴 추천받기"
    : "현재 조건에서는 이 메뉴 하나예요";
  if (!dialog.open) dialog.showModal();
}

function recommend() {
  const candidates = filterMenus(state.filters, state.excluded);
  const menu = pickMenu(candidates, lastRecommendedId);
  if (menu) showMenu(menu);
  else
    notify("조건에 맞는 메뉴가 없어요. 조건이나 제외한 메뉴를 확인해 주세요.");
}

function resetFilters(event) {
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

for (const key of ["category", "budget", "spice"]) {
  $(`#${key}-options`).addEventListener("click", (event) => {
    const button = event.target.closest(`[data-${key}]`);
    if (!button) return;
    state.filters[key] =
      key === "budget" ? Number(button.dataset[key]) : button.dataset[key];
    renderMenus();
    persist();
  });
}

$("#search").value = state.filters.search;
$("#search").addEventListener("input", (event) => {
  state.filters.search = event.target.value.slice(0, 80);
  renderMenus();
  persist();
});
$("#reset-filters").addEventListener("click", resetFilters);
$("#empty-reset").addEventListener("click", resetFilters);
$("#empty-restore").addEventListener("click", () => {
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

$("#menu-grid").addEventListener("click", (event) => {
  const choose = event.target.closest("[data-choose]");
  if (choose) showMenu(menuById.get(choose.dataset.choose));
  const exclude = event.target.closest("[data-exclude]");
  if (exclude) {
    const buttons = [...document.querySelectorAll("[data-exclude]")];
    const index = buttons.indexOf(exclude);
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
  renderMenus();
  persist();
  ($("#excluded-panel button") ?? $("#toggle-excluded")).focus({
    preventScroll: true,
  });
});

$("#confirm-menu").addEventListener("click", () => {
  if (!selectedMenu) return;
  const result = addChoice(state.history, selectedMenu.id);
  state.history = result.history;
  dialog.close();
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
if (loadMessage) notify(loadMessage);
