import { menus } from "./data.mjs";

const menuById = new Map(menus.map((menu) => [menu.id, menu]));

export function normalizeFavorites(value) {
  if (!Array.isArray(value)) return [];

  const favorites = new Set();
  for (const id of value) {
    if (!menuById.has(id)) continue;
    favorites.add(id);
    if (favorites.size === menuById.size) break;
  }
  return [...favorites];
}

export function toggleFavorite(favorites, menuId) {
  const normalized = normalizeFavorites(favorites);
  if (!menuById.has(menuId)) return normalized;
  if (normalized.includes(menuId)) {
    return normalized.filter((id) => id !== menuId);
  }
  return [...normalized, menuId];
}

export function filterFavorites(candidates, favorites, onlyFavorites) {
  if (onlyFavorites !== true) return candidates;
  const saved = new Set(normalizeFavorites(favorites));
  return candidates.filter((menu) => saved.has(menu.id));
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}

export function favoriteButtonMarkup(menu, isFavorite) {
  const knownMenu = menuById.get(menu?.id);
  if (!knownMenu) return "";

  const selected = isFavorite === true;
  const action = selected ? "해제" : "추가";
  const label = escapeAttribute(`${knownMenu.name} 즐겨찾기 ${action}`);
  return `
    <button
      type="button"
      class="favorite-button${selected ? " is-favorite" : ""}"
      data-favorite="${escapeAttribute(knownMenu.id)}"
      aria-pressed="${selected}"
      aria-label="${label}"
      title="${label}"
    >
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="${selected ? "currentColor" : "none"}"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
    </button>
  `;
}
