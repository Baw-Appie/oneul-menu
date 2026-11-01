import { localDateKey, normalizeState } from "./core.mjs";

const APP_ID = "oneul-menu";
const MAX_FILE_BYTES = 256 * 1024;
const listLength = (value) => (Array.isArray(value) ? value.length : 0);

// 내보낸 파일에도 저장값과 같은 검증을 통과한 내용만 담습니다.
export function createBackup(state, now = new Date()) {
  const { filters, excluded, favorites, history } = normalizeState(state);
  return {
    app: APP_ID,
    version: 1,
    exportedAt: now.toISOString(),
    filters,
    excluded,
    favorites,
    history,
  };
}

export function backupFileName(now = new Date()) {
  return `oneul-menu-backup-${localDateKey(now)}.json`;
}

export function describeBackup({ history, favorites, excluded }) {
  return `선택 기록 ${history.length}건 · 즐겨찾기 ${favorites.length}개 · 제외한 메뉴 ${excluded.length}개`;
}

// 파일은 저장값보다 더 신뢰할 수 없으므로 버전을 확인한 뒤에만 정규화합니다.
// 알 수 없는 버전을 정규화하면 빈 상태가 되어 기존 기록을 덮어쓰게 됩니다.
export function readBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      error:
        "백업 파일을 읽지 못했어요. 내보내기로 만든 JSON 파일인지 확인해 주세요.",
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return { error: "백업 파일의 형식이 올바르지 않아요." };
  if (parsed.app !== undefined && parsed.app !== APP_ID)
    return {
      error:
        "다른 앱에서 만든 파일 같아요. ‘오늘 뭐 먹지’에서 내보낸 파일을 선택해 주세요.",
    };
  if (parsed.version !== 1)
    return {
      error:
        "이 버전에서 읽을 수 없는 백업이에요. 같은 버전에서 내보낸 파일을 사용해 주세요.",
    };

  const state = normalizeState(parsed);
  const skipped =
    listLength(parsed.history) -
    state.history.length +
    listLength(parsed.excluded) -
    state.excluded.length +
    listLength(parsed.favorites) -
    state.favorites.length;
  return { state, skipped: Math.max(skipped, 0) };
}

export function setupBackup({ getState, onImport, notify }) {
  const $ = (selector) => document.querySelector(selector);
  const fileInput = $("#backup-file");
  const dialog = $("#import-dialog");
  let pending = null;

  $("#backup-export").addEventListener("click", () => {
    const backup = createBackup(getState());
    const name = backupFileName();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      }),
    );
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: name,
    });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url));
    notify(`${describeBackup(backup)}를 ${name} 파일로 내보냈어요.`);
  });

  $("#backup-import").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files;
    fileInput.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      notify(
        "백업 파일이 너무 커요. 내보내기로 만든 파일을 선택해 주세요.",
      );
      return;
    }

    const result = readBackup(await file.text().catch(() => ""));
    if (result.error) {
      notify(result.error);
      return;
    }

    pending = result;
    $("#import-next").textContent = describeBackup(result.state);
    $("#import-current").textContent = describeBackup(getState());
    $("#import-skipped").textContent =
      `파일에서 불러오지 않은 항목이 ${result.skipped}개 있어요. 보관 한계를 넘었거나 이 앱에 없는 메뉴예요.`;
    $("#import-skipped").hidden = result.skipped === 0;
    dialog.showModal();
    $("#import-title").focus({ preventScroll: true });
  });

  $("#import-confirm").addEventListener("click", () => {
    const result = pending;
    dialog.close();
    if (result) onImport(result.state, result.skipped);
  });
  $("#import-cancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    pending = null;
    $("#backup-import").focus({ preventScroll: true });
  });
}
