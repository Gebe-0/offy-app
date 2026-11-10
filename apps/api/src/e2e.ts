/**
 * E2E no contrato do cliente. Cobre auth, catálogo, biblioteca, playlists,
 * usuários, histórico, leaderboards, mixes e letras.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:8787";

let failures = 0;
let accessToken = "";
let refreshToken = "";
let playlistId = "";
let itemId = "";
const TRACK_ID = "dQw4w9WgXcQ";
const stamp = Date.now().toString(36);

function ok(name, extra = "") {
  console.log(`  ok   ${name}${extra ? "  " + extra : ""}`);
}
function fail(name, error) {
  failures += 1;
  console.log(`  FAIL ${name}:`, error instanceof Error ? error.message : error);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(method, path, body, opts = { auth: true }) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth !== false && accessToken) headers.authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(method !== "GET" && body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

async function step(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (error) {
    fail(name, error);
  }
}

console.log("— health —");
await step("GET /health", async () => {
  const r = await call("GET", "/health", undefined, { auth: false });
  assert(r.status === 200 && r.json.ok === true, `status ${r.status}`);
});

console.log("— auth —");
await step("POST /v1/auth/challenge -> 404 (PoW off)", async () => {
  const r = await call("POST", "/v1/auth/challenge", { purpose: "register", email: "x@y.z" }, { auth: false });
  assert(r.status === 404, `status ${r.status}`);
});

await step("POST /v1/auth/register", async () => {
  const r = await call(
    "POST",
    "/v1/auth/register",
    { email: `iii_${stamp}@offy.test`, password: "senha-forte-123", username: `iii_${stamp}`, displayName: "III" },
    { auth: false },
  );
  assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.json)}`);
  assert(typeof r.json.accessToken === "string", "sem accessToken");
  assert(typeof r.json.refreshToken === "string", "sem refreshToken");
  assert(typeof r.json.accessTokenExpiresAt === "string", "sem expiração");
  assert(r.json.user.username === `iii_${stamp}`, "username errado");
  accessToken = r.json.accessToken;
  refreshToken = r.json.refreshToken;
});

await step("GET /v1/me", async () => {
  const r = await call("GET", "/v1/me");
  assert(r.status === 200, `status ${r.status}`);
  assert(r.json.username === `iii_${stamp}`, "username errado");
});

await step("POST /v1/auth/refresh", async () => {
  const r = await call("POST", "/v1/auth/refresh", { refreshToken }, { auth: false });
  assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.json)}`);
  accessToken = r.json.accessToken;
  refreshToken = r.json.refreshToken;
});

await step("GET /v1/me sem token -> 401", async () => {
  const r = await call("GET", "/v1/me", undefined, { auth: false });
  assert(r.status === 401, `esperava 401, veio ${r.status}`);
});

console.log("— catálogo —");
await step("GET /v1/catalog/search", async () => {
  const r = await call("GET", "/v1/catalog/search?q=daft%20punk&type=track");
  assert(r.status === 200, `status ${r.status}`);
  assert(Array.isArray(r.json.items) && r.json.items.length > 0, "vazio");
  const first = r.json.items[0];
  assert(first.type === "track", `tipo ${first.type}`);
  assert(Array.isArray(first.artists) && first.artists.length > 0, "sem artists[]");
  assert(typeof first.artists[0].name === "string", "sem nome do artista");
});

await step("GET /v1/catalog/tracks/:id", async () => {
  const r = await call("GET", `/v1/catalog/tracks/${TRACK_ID}`);
  assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.json)}`);
  assert(r.json.id === TRACK_ID, "id errado");
  assert(Array.isArray(r.json.artists), "artists não é array");
  assert(r.json.viewer && typeof r.json.viewer.liked === "boolean", "sem viewer");
});

console.log("— biblioteca —");
await step("PUT /v1/me/library/tracks/:id", async () => {
  const meta = await call("GET", `/v1/catalog/tracks/${TRACK_ID}`);
  const r = await call("PUT", `/v1/me/library/tracks/${TRACK_ID}`, { track: meta.json, trackSnapshot: meta.json });
  assert(r.status === 204, `status ${r.status} ${JSON.stringify(r.json)}`);
});

await step("GET /v1/me/library/tracks", async () => {
  const r = await call("GET", "/v1/me/library/tracks?limit=100");
  assert(r.status === 200, `status ${r.status}`);
  assert(r.json.items.length >= 1, "curtida sumiu");
  assert(r.json.items[0].track.id === TRACK_ID, "track errada");
  assert("nextCursor" in r.json, "sem nextCursor");
});

await step("PUT/GET /v1/me/library/albums", async () => {
  const put = await call("PUT", "/v1/me/library/albums/MPREb_test", { snapshot: { title: "Album Teste" } });
  assert(put.status === 204, `put ${put.status}`);
  const r = await call("GET", "/v1/me/library/albums");
  assert(r.status === 200 && r.json.items.length >= 1, "álbum não salvou");
});

console.log("— playlists —");
await step("POST /v1/me/playlists", async () => {
  const r = await call("POST", "/v1/me/playlists", { title: "Lista III" });
  assert(r.status === 201, `status ${r.status} ${JSON.stringify(r.json)}`);
  playlistId = r.json.id;
  assert(r.json.trackCount === 0, "trackCount != 0");
});

await step("POST /v1/me/playlists/:id/tracks/:trackId", async () => {
  const r = await call("POST", `/v1/me/playlists/${playlistId}/tracks/${TRACK_ID}`, {});
  assert(r.status === 201, `status ${r.status} ${JSON.stringify(r.json)}`);
  itemId = r.json.id;
  assert(r.json.track.id === TRACK_ID, "track errada");
});

await step("GET /v1/me/playlists/:id (com ETag)", async () => {
  const r = await call("GET", `/v1/me/playlists/${playlistId}?compact=true`);
  assert(r.status === 200, `status ${r.status}`);
  assert(r.json.items.length === 1, `itens ${r.json.items.length}`);
  const etag = r.headers.get("etag");
  assert(etag, "sem ETag");
  const cached = await fetch(`${BASE}/v1/me/playlists/${playlistId}?compact=true`, {
    headers: { authorization: `Bearer ${accessToken}`, "if-none-match": etag },
  });
  assert(cached.status === 304, `esperava 304, veio ${cached.status}`);
});

await step("PATCH /v1/me/playlists/:id", async () => {
  const r = await call("PATCH", `/v1/me/playlists/${playlistId}`, { title: "Renomeada" });
  assert(r.status === 200 && r.json.title === "Renomeada", "título não mudou");
});

await step("POST .../items/:itemId/move", async () => {
  const r = await call("POST", `/v1/me/playlists/${playlistId}/items/${itemId}/move`, {
    beforeItemId: null,
    revision: 1,
  });
  assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.json)}`);
  assert(Array.isArray(r.json.items), "sem items");
});

await step("DELETE .../items/:itemId", async () => {
  const r = await call("DELETE", `/v1/me/playlists/${playlistId}/items/${itemId}`);
  assert(r.status === 204, `status ${r.status}`);
});

console.log("— histórico e social —");
await step("POST /v1/me/playback/events", async () => {
  const r = await call("POST", "/v1/me/playback/events", {
    playbackSessionId: "p1",
    listeningSessionId: "l1",
    trackId: TRACK_ID,
    playedDurationMs: 42000,
    trackDurationMs: 213000,
    completionRate: 0.2,
    completed: false,
  });
  assert(r.status === 204, `status ${r.status} ${JSON.stringify(r.json)}`);
});

await step("GET /v1/me/history", async () => {
  const r = await call("GET", "/v1/me/history?limit=10");
  assert(r.status === 200, `status ${r.status}`);
  assert(r.json.items.length >= 1, "histórico vazio");
  assert(r.json.items[0].playedDurationMs === 42000, "duração errada");
});

await step("GET /v1/explore/popular", async () => {
  const r = await call("GET", "/v1/explore/popular?window=7d&limit=5");
  assert(r.status === 200, `status ${r.status}`);
  assert(Array.isArray(r.json.items), "sem items");
});

await step("GET /v1/explore/most-saved", async () => {
  const r = await call("GET", "/v1/explore/most-saved?type=all&limit=5");
  assert(r.status === 200, `status ${r.status}`);
});

await step("GET /v1/leaderboards/global", async () => {
  const r = await call("GET", "/v1/leaderboards/global?period=weekly");
  assert(r.status === 200, `status ${r.status}`);
  assert(r.json.entries.length >= 1, "leaderboard vazio");
});

await step("GET /v1/users/me", async () => {
  const r = await call("GET", "/v1/users/me");
  assert(r.status === 200, `status ${r.status}`);
  assert(typeof r.json.followersCount === "number", "sem contadores");
});

await step("PATCH /v1/users/me", async () => {
  const r = await call("PATCH", "/v1/users/me", { displayName: "III Desk", bio: "offy" });
  assert(r.status === 200, `status ${r.status} ${JSON.stringify(r.json)}`);
  assert(r.json.displayName === "III Desk", "displayName não mudou");
});

await step("GET /v1/me/recommendations/daily-mixes", async () => {
  const r = await call("GET", "/v1/me/recommendations/daily-mixes");
  assert(r.status === 200, `status ${r.status}`);
  assert(Array.isArray(r.json.items), "sem items");
});

console.log("— letras —");
await step("GET /v1/tracks/:id/lyrics (SSE)", async () => {
  const res = await fetch(`${BASE}/v1/tracks/${TRACK_ID}/lyrics?title=Never%20Gonna%20Give%20You%20Up&artist=Rick%20Astley`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json, text/event-stream" },
  });
  assert(res.status === 200, `status ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (type.includes("event-stream")) {
    assert(body.includes('"type":"metadata"'), "sem metadata");
    assert(body.includes('"type":"done"'), "sem done");
  } else {
    const parsed = JSON.parse(body);
    assert(parsed.candidate || parsed.cached !== undefined, "payload inesperado");
  }
});

console.log("— limpeza —");
await step("DELETE /v1/me/playlists/:id", async () => {
  const r = await call("DELETE", `/v1/me/playlists/${playlistId}`);
  assert(r.status === 204, `status ${r.status}`);
});

await step("DELETE /v1/me/library/tracks/:id", async () => {
  const r = await call("DELETE", `/v1/me/library/tracks/${TRACK_ID}`);
  assert(r.status === 204, `status ${r.status}`);
});

await step("POST /v1/auth/logout", async () => {
  const r = await call("POST", "/v1/auth/logout", { refreshToken }, { auth: false });
  assert(r.status === 204, `status ${r.status}`);
});

console.log(failures === 0 ? "\nE2E OK" : `\nE2E FALHAS: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
