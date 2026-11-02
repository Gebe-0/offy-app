/** Testa o chain de letras: conta providers, eventos SSE e formato do LRC. */
const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const stamp = Date.now().toString(36);

const reg = await fetch(`${BASE}/v1/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: `lyr_${stamp}@offy.test`,
    password: "senha-forte-123",
    username: `lyr_${stamp}`,
    displayName: "Lyrics Test",
  }),
});
const auth = await reg.json();
if (!auth.accessToken) {
  console.error("registro falhou", auth);
  process.exit(1);
}

const cases = [
  { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley" },
  { id: "kJQP7kiw5Fk", title: "Despacito", artist: "Luis Fonsi" },
  { id: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran" },
];

let failures = 0;

for (const item of cases) {
  const params = new URLSearchParams({ title: item.title, artist: item.artist });
  const started = Date.now();
  const res = await fetch(`${BASE}/v1/tracks/${item.id}/lyrics?${params}`, {
    headers: { authorization: `Bearer ${auth.accessToken}`, accept: "application/json, text/event-stream" },
  });
  const type = res.headers.get("content-type") ?? "";
  const body = await res.text();
  const ms = Date.now() - started;

  if (type.includes("event-stream")) {
    const events = body
      .split("\n\n")
      .map((chunk) => chunk.replace(/^data: /, "").trim())
      .filter(Boolean)
      .map((raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const found = events.filter((e) => e.type === "provider" && e.status === "found");
    const missed = events.filter((e) => e.type === "provider" && e.status === "not_found");
    const done = events.find((e) => e.type === "done");

    console.log(`${item.title}: ${ms}ms`);
    console.log(`  providers com letra: ${found.map((e) => e.provider).join(", ") || "nenhum"}`);
    console.log(`  sem letra: ${missed.map((e) => e.provider).join(", ") || "-"}`);
    console.log(`  best: ${done?.best ? `${done.best.provider} (${done.best.syncLevel}, q=${done.best.quality})` : "not_found"}`);

    if (found.length > 0) {
      const candidate = found[0].candidate;
      const lines = candidate.lyrics.content.split("\n");
      console.log(`  formato: ${candidate.lyrics.format}, linhas: ${lines.length}`);
      console.log(`  amostra: ${JSON.stringify(lines.slice(0, 2))}`);
      if (candidate.lyrics.format === "plain" && lines.length < 3) failures += 1;
    } else {
      failures += 1;
    }
  } else {
    console.log(`${item.title}: JSON (cache) ${ms}ms`);
    const parsed = JSON.parse(body);
    if (!parsed.candidate) failures += 1;
  }
}

console.log(failures === 0 ? "\nLYRICS OK" : `\nFALHAS: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
