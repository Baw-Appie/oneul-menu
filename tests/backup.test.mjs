import { test } from "node:test";
import assert from "node:assert/strict";
import { menus } from "../src/data.mjs";
import { createState, normalizeState } from "../src/core.mjs";
import { backupFileName, createBackup, readBackup } from "../src/backup.mjs";

test("내보낸 백업을 다시 읽으면 같은 상태로 복원된다", () => {
  const state = {
    ...createState(),
    excluded: ["pho"],
    favorites: ["bibimbap"],
    history: [{ menuId: "udon", date: "2026-11-01" }],
  };
  const text = JSON.stringify(createBackup(state));
  assert.deepEqual(readBackup(text), {
    state: normalizeState(state),
    skipped: 0,
  });
});

test("손상되었거나 다른 앱·알 수 없는 버전의 백업은 거부한다", () => {
  for (const text of [
    "",
    "{",
    "null",
    "[]",
    '{"app":"other","version":1}',
    '{"app":"oneul-menu","version":2}',
  ])
    assert.ok(readBackup(text).error, text);
});

test("보관 한계를 넘거나 알 수 없는 항목은 건너뛴 개수로 알린다", () => {
  const history = menus
    .slice(0, 40)
    .map(({ id }) => ({ menuId: id, date: "2026-11-01" }));
  const { state, skipped } = readBackup(
    JSON.stringify({ version: 1, history, excluded: ["pho", "ghost"] }),
  );
  assert.equal(state.history.length, 30);
  assert.equal(skipped, 11);
});

test("백업 파일 이름은 로컬 날짜를 사용한다", () => {
  assert.equal(
    backupFileName(new Date(2026, 10, 1, 0, 30)),
    "oneul-menu-backup-2026-11-01.json",
  );
});
