import { AI_MODEL, SearchError, searchWithOpenAI } from "./ai-search.mjs";

function sendJSON(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

export function createSearchRoute({
  apiKey = process.env.OPENAI_API_KEY,
  port = 4173,
  appOrigin = process.env.APP_ORIGIN,
  search = searchWithOpenAI,
} = {}) {
  let active = 0;
  let requestTimes = [];
  let origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  if (appOrigin) {
    const url = new URL(appOrigin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("APP_ORIGIN에는 경로 없는 HTTP 또는 HTTPS 주소를 설정하세요.");
    }
    origins = [url.origin];
  }
  const allowedOrigins = new Map(
    origins.map((origin) => [new URL(origin).host, origin]),
  );

  return async function handleSearch(request, response) {
    const origin = request.headers.origin;
    const allowedOrigin = allowedOrigins.get(request.headers.host);
    if (
      !allowedOrigin ||
      (origin && origin !== allowedOrigin) ||
      (request.headers["sec-fetch-site"] &&
        !["same-origin", "none"].includes(request.headers["sec-fetch-site"]))
    ) {
      sendJSON(response, 403, {
        error: "같은 앱 화면에서 다시 검색해 주세요.",
      });
      return;
    }

    if (request.method === "GET") {
      sendJSON(response, 200, { available: Boolean(apiKey), model: AI_MODEL });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      sendJSON(response, 405, { error: "지원하지 않는 요청이에요." });
      return;
    }
    if (!apiKey) {
      sendJSON(response, 503, {
        error:
          "AI 검색이 아직 준비되지 않았어요. 아래 메뉴 검색을 이용해 주세요.",
      });
      return;
    }
    if (
      request.headers["content-type"]?.split(";")[0].trim() !==
      "application/json"
    ) {
      sendJSON(response, 415, { error: "검색 요청 형식을 확인해 주세요." });
      return;
    }

    const now = Date.now();
    requestTimes = requestTimes.filter((time) => time > now - 3600000);
    if (
      active >= 2 ||
      requestTimes.length >= 60 ||
      requestTimes.filter((time) => time > now - 60000).length >= 6
    ) {
      response.setHeader("Retry-After", "60");
      sendJSON(response, 429, {
        error: "잠시 쉬었다 검색해 주세요. 요청이 너무 빠르게 이어지고 있어요.",
      });
      return;
    }

    active += 1;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > 8192)
          throw new SearchError(
            413,
            "검색 문장이 너무 길어요. 500자 이내로 입력해 주세요.",
          );
        chunks.push(chunk);
      }
      let input;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new SearchError(400, "검색 요청 형식을 확인해 주세요.");
      }
      requestTimes.push(now);
      const result = await search(input, { apiKey });
      sendJSON(response, 200, result);
    } catch (error) {
      request.resume();
      // 공급자의 오류 본문이나 인증 정보를 브라우저 또는 로그에 전달하지 않습니다.
      if (!response.destroyed)
        sendJSON(response, error instanceof SearchError ? error.status : 500, {
          error:
            error instanceof SearchError
              ? error.message
              : "검색을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
        });
    } finally {
      active -= 1;
    }
  };
}
