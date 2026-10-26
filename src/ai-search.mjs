export function createSearchSession({ request, onChange = () => {} }) {
  let generation = 0;
  let controller;
  const state = { status: "idle", menuIds: null, summary: "", error: "" };

  function reset() {
    generation += 1;
    controller?.abort();
    controller = undefined;
    Object.assign(state, {
      status: "idle",
      menuIds: null,
      summary: "",
      error: "",
    });
    onChange(state);
  }

  async function run(query, candidates) {
    reset();
    const current = generation;
    if (!query.trim() || query.length > 500) {
      state.error = "원하는 메뉴를 500자 이내로 적어 주세요.";
      state.status = "error";
      onChange(state);
      return;
    }
    if (!candidates.length) {
      state.error =
        "현재 조건에 맞는 메뉴가 없어요. 먼저 조건을 조정해 주세요.";
      state.status = "error";
      onChange(state);
      return;
    }

    controller = new AbortController();
    const signal = controller.signal;
    state.status = "loading";
    onChange(state);
    try {
      const result = await request(
        {
          query: query.trim(),
          candidateIds: candidates.map((menu) => menu.id),
        },
        signal,
      );
      if (current !== generation) return;
      const allowed = new Set(candidates.map((menu) => menu.id));
      if (
        !result ||
        !Array.isArray(result.menuIds) ||
        result.menuIds.length > candidates.length ||
        result.menuIds.some((id) => !allowed.has(id)) ||
        new Set(result.menuIds).size !== result.menuIds.length ||
        typeof result.summary !== "string" ||
        result.summary.length > 220
      ) {
        throw new Error("검색 결과를 확인하지 못했어요. 다시 검색해 주세요.");
      }
      state.menuIds = result.menuIds;
      state.summary = result.summary;
      state.status = "complete";
    } catch (error) {
      if (current !== generation) return;
      state.status = "error";
      state.error = error.message || "검색에 실패했어요. 다시 시도해 주세요.";
    } finally {
      if (current === generation) {
        controller = undefined;
        onChange(state);
      }
    }
  }

  return { state, reset, run };
}

export function applySearchResults(candidates, menuIds) {
  if (menuIds === null) return candidates;
  const byId = new Map(candidates.map((menu) => [menu.id, menu]));
  return menuIds.map((id) => byId.get(id)).filter(Boolean);
}

export function setupNaturalSearch({ getCandidates, onResultsChange }) {
  const form = document.querySelector("#ai-search-form");
  const input = document.querySelector("#ai-query");
  const button = document.querySelector("#ai-submit");
  const cancelButton = document.querySelector("#ai-cancel");
  const clearButton = document.querySelector("#ai-clear");
  const status = document.querySelector("#ai-status");
  let available = false;
  let availabilityMessage = "AI 검색 연결을 확인하고 있어요.";
  const endpoint = new URL(
    "./api/search",
    window.location.href.split("#")[0].split("?")[0],
  );

  const session = createSearchSession({
    request: async (body, signal) => {
      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error(
          error.name === "TimeoutError"
            ? "검색 시간이 길어지고 있어요. 다시 시도해 주세요."
            : "AI 검색에 연결하지 못했어요. 아래 메뉴 검색은 계속 사용할 수 있어요.",
        );
      }
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(
          "AI 검색 응답을 받지 못했어요. 아래 메뉴 검색을 이용해 주세요.",
        );
      }
      if (!response.ok)
        throw new Error(
          typeof result.error === "string"
            ? result.error.slice(0, 220)
            : "검색을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      return result;
    },
    onChange: (state) => {
      const loading = state.status === "loading";
      button.disabled = !available || loading;
      button.textContent = loading ? "메뉴를 찾고 있어요…" : "AI로 메뉴 찾기 ↗";
      cancelButton.hidden = !loading;
      clearButton.hidden = state.menuIds === null;
      form.setAttribute("aria-busy", String(loading));
      status.classList.toggle("is-error", state.status === "error");
      if (!available) status.textContent = availabilityMessage;
      else if (loading)
        status.textContent =
          "지금 고른 조건 안에서 문장에 어울리는 메뉴를 찾고 있어요.";
      else if (state.status === "error") status.textContent = state.error;
      else if (state.menuIds !== null)
        status.textContent = `AI 검색 결과 ${state.menuIds.length}개 · ${state.summary}`;
      else
        status.textContent =
          "선택한 종류·예산·매운맛과 제외 메뉴도 함께 반영해요.";
      onResultsChange();
    },
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (available && session.state.status !== "loading")
      session.run(input.value, getCandidates());
  });
  input.addEventListener("input", () => session.reset());
  cancelButton.addEventListener("click", () => {
    session.reset();
    input.focus();
  });
  clearButton.addEventListener("click", () => {
    session.reset();
    input.value = "";
    input.focus();
  });
  document.querySelectorAll("[data-ai-example]").forEach((example) => {
    example.addEventListener("click", () => {
      session.reset();
      input.value = example.dataset.aiExample;
      input.focus();
    });
  });

  async function checkConnection() {
    // 현재 공개 정적 호스팅에는 API 서버가 없으므로 불필요한 404 요청을 보내지 않습니다.
    if (window.location.hostname.endsWith(".github.io")) {
      availabilityMessage =
        "이 공개 데모의 AI 검색은 아직 준비 중이에요. 아래 조건으로 메뉴를 골라보세요.";
      session.reset();
      return;
    }
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      const config = response.ok ? await response.json() : null;
      available = config?.available === true && config.model === "gpt-6-luna";
      availabilityMessage =
        "AI 검색이 아직 준비되지 않았어요. 아래 메뉴 검색은 바로 사용할 수 있어요.";
    } catch {
      availabilityMessage =
        "AI 검색에 연결하지 못했어요. 아래 메뉴 검색은 바로 사용할 수 있어요.";
    }
    session.reset();
  }

  checkConnection();
  return session;
}
