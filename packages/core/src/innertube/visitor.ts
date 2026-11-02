import { asArray } from "../json.js";

/**
 * `visitorData` identifica o cliente para o YouTube. Buscar direto de
 * `sw.js_data` faz o valor nascer do IP de quem usa o app, não do servidor.
 */
const VISITOR_DATA_PATTERN = /Cg[s-v][A-Za-z0-9_-]{20,}(?:%3D|=){0,2}/;
const TTL_MS = 5.5 * 60 * 60 * 1000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let cached: { value: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;

function fromJson(text: string): string | null {
  try {
    const body = text.startsWith(")]}'") ? text.slice(text.indexOf("\n") + 1) : text;
    const value = asArray(asArray(asArray(asArray(asArray(JSON.parse(body) as unknown)[0])[2])[0])[0])[13];
    return typeof value === "string" && VISITOR_DATA_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function parseVisitorData(swJsData: string): string | null {
  return fromJson(swJsData) ?? swJsData.match(VISITOR_DATA_PATTERN)?.[0] ?? null;
}

export function resetVisitorData(): void {
  cached = null;
}

export async function getVisitorData(signal?: AbortSignal): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (pending) return pending;

  pending = (async () => {
    try {
      const res = await fetch("https://www.youtube.com/sw.js_data", {
        headers: { "user-agent": UA, accept: "*/*" },
        signal,
      });
      if (!res.ok) throw new Error(`sw.js_data ${res.status}`);
      const parsed = parseVisitorData(await res.text());
      if (!parsed) throw new Error("visitorData not found");
      cached = { value: parsed, expiresAt: Date.now() + TTL_MS };
      return parsed;
    } catch {
      if (cached) return cached.value;
      return "";
    } finally {
      pending = null;
    }
  })();

  return pending;
}
