import { spiceLabels } from "./data.mjs";

const dialogId = "menu-duel-dialog";
const menuColors = new Set(["sage", "peach", "butter", "rose", "sky"]);

function uniqueMenus(candidates) {
  const seen = new Set();
  return candidates.filter((menu) => {
    if (seen.has(menu.id)) return false;
    seen.add(menu.id);
    return true;
  });
}

function randomIndex(length, random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("random은 0 이상 1 미만의 수를 반환해야 합니다.");
  }
  return Math.floor(value * length);
}

// 첫 ID의 객체를 유지하고, 가능한 모든 순서 있는 쌍을 같은 확률로 뽑습니다.
export function pickMenuPair(candidates, random = Math.random) {
  const pool = uniqueMenus(candidates);
  if (pool.length <= 1) return pool;

  const first = randomIndex(pool.length, random);
  let second = randomIndex(pool.length - 1, random);
  if (second >= first) second += 1;
  return [pool[first], pool[second]];
}

function pickDifferentPair(candidates, previousPair) {
  if (candidates.length <= 2 || previousPair.length !== 2) {
    return pickMenuPair(candidates);
  }

  const previousIds = new Set(previousPair.map((menu) => menu.id));
  const alternatives = [];
  for (let first = 0; first < candidates.length - 1; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (
        previousIds.has(candidates[first].id) &&
        previousIds.has(candidates[second].id)
      ) {
        continue;
      }
      alternatives.push([candidates[first], candidates[second]]);
    }
  }

  return pickMenuPair(alternatives[randomIndex(alternatives.length, Math.random)]);
}

export function setupMenuDuel({ trigger, getCandidates, onChoose, notify }) {
  const doc = trigger.ownerDocument;
  if (doc.getElementById(dialogId)) {
    throw new Error("메뉴 대결은 한 번만 초기화할 수 있습니다.");
  }

  let destroyed = false;
  let pair = [];
  const originalDisabled = trigger.disabled;
  const originalAttributes = new Map(
    ["aria-haspopup", "aria-controls"].map((name) => [
      name,
      trigger.getAttribute(name),
    ]),
  );

  function createElement(tag, className, text) {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  const dialog = createElement("dialog");
  dialog.id = dialogId;
  dialog.setAttribute("aria-labelledby", "duel-title");
  dialog.setAttribute("aria-describedby", "duel-description duel-status");

  const header = createElement("div", "duel-header");
  const heading = createElement("div", "duel-heading");
  const kicker = createElement("p", "duel-kicker", "오늘의 메뉴 대결");
  const title = createElement("h2", "duel-title", "둘 중 뭐 먹을까?");
  title.id = "duel-title";
  title.tabIndex = -1;
  heading.append(kicker, title);

  const closeButton = createElement("button", "duel-close icon-button", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "메뉴 대결 닫기");
  header.append(heading, closeButton);

  const description = createElement(
    "p",
    "duel-description",
    "마음에 드는 메뉴를 고르면 결과 화면에서 한 번 더 확인할 수 있어요.",
  );
  description.id = "duel-description";
  const status = createElement("p", "duel-status");
  status.id = "duel-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const cards = createElement("div", "duel-cards");
  const actions = createElement("div", "duel-actions");
  const rerollButton = createElement(
    "button",
    "duel-reroll secondary-button",
    "↻ 다른 후보 보기",
  );
  rerollButton.type = "button";
  actions.append(rerollButton);
  const note = createElement(
    "p",
    "duel-note",
    "결과 화면에서 확정한 메뉴만 선택 기록에 남아요.",
  );
  dialog.append(header, description, status, cards, actions, note);
  doc.body.append(dialog);

  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-controls", dialogId);

  function readCandidates() {
    const candidates = uniqueMenus(getCandidates());
    trigger.disabled = candidates.length === 0;
    return candidates;
  }

  function createCard(menu, index) {
    const card = createElement("article", "duel-card");
    const art = createElement("div", "duel-art");
    if (menuColors.has(menu.color)) art.classList.add(menu.color);
    const emoji = createElement("span", "duel-emoji", menu.emoji);
    emoji.setAttribute("aria-hidden", "true");
    art.append(emoji);

    const body = createElement("div", "duel-card-body");
    const name = createElement("h3", "duel-menu-name", menu.name);
    name.id = `duel-menu-title-${index}`;
    card.setAttribute("aria-labelledby", name.id);
    const metadata = createElement(
      "p",
      "duel-meta",
      `${menu.category} · ${spiceLabels[menu.spice]}`,
    );
    const details = createElement("p", "duel-menu-description", menu.description);
    const price = createElement(
      "p",
      "duel-price",
      `예상 ${menu.price.toLocaleString("ko-KR")}원`,
    );
    const choose = createElement(
      "button",
      "duel-choose primary-button",
      "이 메뉴로 고르기",
    );
    choose.type = "button";
    choose.dataset.duelChoice = menu.id;
    choose.setAttribute("aria-label", `${menu.name} 고르기`);
    body.append(name, metadata, details, price, choose);
    card.append(art, body);
    return card;
  }

  function render(candidates, redraw = false) {
    const focused = doc.activeElement;
    const focusedId = cards.contains(focused)
      ? focused.dataset.duelChoice
      : null;
    const candidateById = new Map(candidates.map((menu) => [menu.id, menu]));
    const retained = pair
      .map((menu) => candidateById.get(menu.id))
      .filter(Boolean);

    if (redraw) pair = pickDifferentPair(candidates, retained);
    else if (retained.length === Math.min(2, candidates.length)) pair = retained;
    else pair = pickMenuPair(candidates);

    status.textContent =
      candidates.length === 0
        ? "조건에 맞는 메뉴가 없어요. 대결을 닫고 조건이나 제외한 메뉴를 확인해 주세요."
        : candidates.length === 1
          ? "현재 조건에 맞는 메뉴는 하나예요. 이 메뉴를 고르거나 조건을 넓혀 보세요."
          : candidates.length === 2
            ? "현재 조건에 맞는 두 메뉴가 모두 나왔어요. 마음에 드는 쪽을 골라 주세요."
            : `현재 후보 ${candidates.length}개 중 ${pair[0].name}, ${pair[1].name}을 골랐어요. 다른 후보도 비교할 수 있어요.`;
    cards.classList.toggle("duel-single", pair.length === 1);
    cards.hidden = pair.length === 0;
    cards.replaceChildren(...pair.map(createCard));
    rerollButton.disabled = candidates.length <= 2;

    if (focusedId) {
      const buttons = [...cards.querySelectorAll("[data-duel-choice]")];
      const nextFocus =
        buttons.find((button) => button.dataset.duelChoice === focusedId) ??
        buttons[0] ??
        closeButton;
      nextFocus.focus({ preventScroll: true });
    } else if (focused === rerollButton && rerollButton.disabled) {
      closeButton.focus({ preventScroll: true });
    }
  }

  function refresh() {
    if (destroyed) return;
    const candidates = readCandidates();
    if (dialog.open) render(candidates);
  }

  function openDuel() {
    if (destroyed) return;
    const candidates = readCandidates();
    if (candidates.length === 0) {
      notify("조건에 맞는 메뉴가 없어요. 조건이나 제외한 메뉴를 확인해 주세요.");
      return;
    }
    if (dialog.open) {
      render(candidates);
      return;
    }
    pair = [];
    render(candidates);
    dialog.showModal();
    title.focus({ preventScroll: true });
  }

  function reroll() {
    if (destroyed || !dialog.open) return;
    render(readCandidates(), true);
  }

  function chooseMenu(event) {
    if (destroyed || !dialog.open) return;
    const button = event.target.closest("[data-duel-choice]");
    if (!button || !cards.contains(button)) return;

    const candidates = readCandidates();
    const menu = candidates.find(
      (candidate) => candidate.id === button.dataset.duelChoice,
    );
    if (!menu || !pair.some((candidate) => candidate.id === menu.id)) {
      render(candidates);
      notify("조건이 바뀌어 후보를 갱신했어요. 다시 골라 주세요.");
      return;
    }

    dialog.close();
    onChoose(menu);
  }

  function closeDuel() {
    dialog.close();
  }

  function restoreFocus() {
    if (
      !destroyed &&
      !dialog.open &&
      trigger.isConnected &&
      !trigger.disabled &&
      !doc.querySelector("dialog[open]")
    ) {
      trigger.focus({ preventScroll: true });
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    trigger.removeEventListener("click", openDuel);
    closeButton.removeEventListener("click", closeDuel);
    rerollButton.removeEventListener("click", reroll);
    dialog.removeEventListener("click", chooseMenu);
    dialog.removeEventListener("close", restoreFocus);
    if (dialog.open) dialog.close();
    dialog.remove();
    pair = [];
    trigger.disabled = originalDisabled;
    for (const [name, value] of originalAttributes) {
      if (value === null) trigger.removeAttribute(name);
      else trigger.setAttribute(name, value);
    }
  }

  trigger.addEventListener("click", openDuel);
  closeButton.addEventListener("click", closeDuel);
  rerollButton.addEventListener("click", reroll);
  dialog.addEventListener("click", chooseMenu);
  dialog.addEventListener("close", restoreFocus);
  refresh();
  return { refresh, destroy };
}
