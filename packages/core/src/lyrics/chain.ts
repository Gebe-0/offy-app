import {
  ProviderChain,
  createBLyricsProvider,
  createBinimumProvider,
  createLegatoProvider,
  createLRCLibPlainProvider,
  createLRCLibSyncedProvider,
  createPortatoProvider,
  createUnisonProvider,
} from "@braccato/provider-blyrics";
import type { Lyric } from "@braccato/parsers";
import type { LyricsCandidate, LyricsSyncLevel } from "@offy/contracts";

/**
 * Mesmo pipeline que o Liner usa para letras: Better Lyrics (TTML, palavra a
 * palavra), Unison (casa pelo videoId), BiniLyrics, QQ Music, Kugou e LRCLIB.
 * Roda no servidor e emite um evento por provider no SSE.
 */

export const CHAIN_PRIORITY = [
  "blyrics",
  "unison",
  "binimum",
  "portato",
  "legato",
  "lrclib-synced",
  "lrclib-plain",
] as const;

export const PROVIDER_LABELS: Record<string, string> = {
  blyrics: "Better Lyrics",
  unison: "Unison",
  binimum: "BiniLyrics",
  portato: "QQ Music",
  legato: "Kugou",
  "lrclib-synced": "LRCLIB",
  "lrclib-plain": "LRCLIB (plain)",
};

const PROVIDER_TIMEOUT_MS = 10_000;
const OVERALL_TIMEOUT_MS = 14_000;

export interface LyricsHint {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  videoId?: string;
}

let chain: ProviderChain | null = null;

function getChain(): ProviderChain {
  if (chain) return chain;
  const timeout = PROVIDER_TIMEOUT_MS;
  chain = new ProviderChain();
  chain.register({ key: "blyrics", displayName: "Better Lyrics", syncType: "word", fetch: createBLyricsProvider({ timeout }) });
  chain.register({ key: "unison", displayName: "Unison", syncType: "word", fetch: createUnisonProvider({ timeout }) });
  chain.register({ key: "binimum", displayName: "BiniLyrics", syncType: "word", fetch: createBinimumProvider({ timeout }) });
  chain.register({ key: "portato", displayName: "QQ Music", syncType: "word", fetch: createPortatoProvider({ timeout }) });
  chain.register({ key: "legato", displayName: "Kugou", syncType: "line", fetch: createLegatoProvider({ timeout }) });
  chain.register({ key: "lrclib-synced", displayName: "LRCLIB", syncType: "line", fetch: createLRCLibSyncedProvider({ timeout }) });
  chain.register({ key: "lrclib-plain", displayName: "LRCLIB (plain)", syncType: "unsynced", fetch: createLRCLibPlainProvider({ timeout }) });
  return chain;
}

function stamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  const centis = Math.floor((clamped % 1_000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function detectDepth(lines: Lyric[]): LyricsSyncLevel {
  if (lines.some((line) => line.parts?.some((part) => part.durationMs > 0))) return "word_level";
  if (lines.some((line) => line.startTimeMs > 0)) return "line_level";
  return "plain";
}

function toContent(lines: Lyric[], depth: LyricsSyncLevel): { content: string; format: "lrc" | "plain" } {
  if (depth === "plain") {
    return {
      content: lines
        .map((line) => line.words.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n"),
      format: "plain",
    };
  }

  const body = lines
    .map((line) => {
      const text = line.words.replace(/\s+/g, " ").trim();
      if (!text) return "";
      if (depth === "word_level" && line.parts?.length) {
        const words = line.parts
          .filter((part) => part.words.trim())
          .map((part) => `<${stamp(part.startTimeMs)}>${part.words.trim()}`)
          .join(" ");
        if (words) return `[${stamp(line.startTimeMs)}]${words}`;
      }
      return `[${stamp(line.startTimeMs)}]${text}`;
    })
    .filter(Boolean);

  return { content: body.join("\n"), format: "lrc" };
}

export function buildCandidate(provider: string, lines: Lyric[], hint: LyricsHint): LyricsCandidate | null {
  const depth = detectDepth(lines);
  const { content, format } = toContent(lines, depth);
  if (!content) return null;

  const sync = depth === "word_level" ? 100 : depth === "line_level" ? 70 : 0;
  const body = Math.round(Math.min(100, (content.length / 1200) * 100));
  const match = 80;
  const source = 70;

  return {
    provider,
    lyrics: { content, format },
    syncLevel: depth,
    contentKind: depth === "word_level" ? "word_synced" : depth === "line_level" ? "line_synced" : "plain",
    matchedTrack: {
      title: hint.title,
      artists: [hint.artist],
      ...(hint.durationMs ? { durationMs: hint.durationMs } : {}),
    },
    quality: {
      total: Math.round(match * 0.5 + body * 0.2 + sync * 0.2 + source * 0.1),
      match,
      content: body,
      sync,
      source,
      reasons: [provider],
    },
  };
}

export interface ChainResult {
  /** Melhor candidato por prioridade. */
  best: LyricsCandidate | null;
  /** Todos os providers que devolveram letras, na ordem de prioridade. */
  found: LyricsCandidate[];
  /** Providers que foram consultados e não devolveram nada. */
  missed: string[];
}

export async function runLyricsChain(
  hint: LyricsHint,
  options: { onFound?: (candidate: LyricsCandidate) => void; signal?: AbortSignal } = {},
): Promise<ChainResult> {
  if (!hint.title.trim() || !hint.artist.trim()) {
    return { best: null, found: [], missed: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERALL_TIMEOUT_MS);
  const relay = () => controller.abort();
  options.signal?.addEventListener("abort", relay);

  const collected = new Map<string, LyricsCandidate>();

  try {
    const providerChain = getChain();
    // O chain guarda cache por provider; limpar evita entregar letra de outra faixa.
    providerChain.clearCache();

    const result = await providerChain.fetchLyrics(
      {
        song: hint.title,
        artist: hint.artist,
        duration: hint.durationMs ? Math.round(hint.durationMs / 1000) : 0,
        album: hint.album ?? null,
        videoId: hint.videoId,
        signal: controller.signal,
      },
      {
        priority: [...CHAIN_PRIORITY],
        onProviderResult: (providerKey, value) => {
          if (!value?.lyrics?.length) return;
          const candidate = buildCandidate(providerKey, value.lyrics, hint);
          if (!candidate || collected.has(providerKey)) return;
          collected.set(providerKey, candidate);
          options.onFound?.(candidate);
        },
      },
    );

    if (result?.lyrics?.length) {
      const key = [...collected.keys()][0] ?? "blyrics";
      if (!collected.has(key)) {
        const candidate = buildCandidate(key, result.lyrics, hint);
        if (candidate) {
          collected.set(key, candidate);
          options.onFound?.(candidate);
        }
      }
    }
  } catch {
    /* chain silencioso: o que veio até aqui já foi emitido */
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", relay);
  }

  const found = [...CHAIN_PRIORITY]
    .map((key) => collected.get(key))
    .filter((candidate): candidate is LyricsCandidate => Boolean(candidate));

  // O chain para no primeiro provider que acerta; os seguintes nunca rodaram.
  const bestIndex = found[0] ? CHAIN_PRIORITY.indexOf(found[0].provider as (typeof CHAIN_PRIORITY)[number]) : -1;
  const attempted = bestIndex >= 0 ? CHAIN_PRIORITY.slice(0, bestIndex + 1) : CHAIN_PRIORITY;
  const missed = attempted.filter((key) => !collected.has(key));

  return { best: found[0] ?? null, found, missed };
}

/** test seam */
export function resetLyricsChain(): void {
  chain = null;
}
