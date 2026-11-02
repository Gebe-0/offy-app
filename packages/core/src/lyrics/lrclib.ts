import type { LyricsCandidate } from "@offy/contracts";

const UA = "OFFY/0.1 (+https://github.com/offy)";

interface LrclibHit {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function quality(match: number, sync: number, content: number): LyricsCandidate["quality"] {
  return {
    total: Number((match * 0.5 + content * 0.3 + sync * 0.2).toFixed(3)),
    match: Number(match.toFixed(3)),
    content: Number(content.toFixed(3)),
    sync: Number(sync.toFixed(3)),
    source: 1,
    reasons: [],
  };
}

function similarity(a: string, b: string): number {
  const left = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const right = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftWords = new Set(left.split(" "));
  const rightWords = new Set(right.split(" "));
  let shared = 0;
  for (const word of leftWords) if (rightWords.has(word)) shared += 1;
  return shared / Math.max(leftWords.size, rightWords.size);
}

export interface LyricsHint {
  title: string;
  artist?: string;
  durationMs?: number;
  album?: string;
  signal?: AbortSignal;
}

export async function fetchLyrics(hint: LyricsHint): Promise<LyricsCandidate | null> {
  const params = new URLSearchParams({ track_name: hint.title });
  if (hint.artist) params.set("artist_name", hint.artist);
  if (hint.album) params.set("album_name", hint.album);
  if (hint.durationMs) params.set("duration", String(Math.round(hint.durationMs / 1000)));

  let hits: LrclibHit[] = [];
  try {
    const res = await fetch(`https://lrclib.net/api/search?${params}`, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: hint.signal ?? AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    hits = (await res.json()) as LrclibHit[];
  } catch {
    return null;
  }

  if (!Array.isArray(hits) || hits.length === 0) return null;

  const scored = hits
    .filter((hit) => Boolean(hit.syncedLyrics || hit.plainLyrics))
    .map((hit) => {
      const titleScore = similarity(hit.trackName, hint.title);
      const artistScore = hint.artist ? similarity(hit.artistName, hint.artist) : 0.5;
      const match = titleScore * 0.65 + artistScore * 0.35;
      const durationScore =
        hint.durationMs && hit.duration
          ? 1 - Math.min(1, Math.abs(hit.duration * 1000 - hint.durationMs) / 15_000)
          : 0.5;
      const syncScore = hit.syncedLyrics ? 1 : 0;
      const contentScore = hit.instrumental ? 0 : 1;
      return {
        hit,
        match,
        quality: quality(match, syncScore, contentScore * (0.6 + 0.4 * durationScore)),
      };
    })
    .sort((a, b) => b.quality.total - a.quality.total);

  const best = scored[0];
  if (!best || best.match < 0.45) return null;

  const synced = Boolean(best.hit.syncedLyrics);

  return {
    provider: "lrclib",
    contentKind: synced ? "line_synced" : "plain",
    syncLevel: synced ? "line_level" : "plain",
    lyrics: {
      format: synced ? "lrc" : "plain",
      content: best.hit.syncedLyrics ?? best.hit.plainLyrics ?? "",
    },
    matchedTrack: {
      title: best.hit.trackName,
      artists: [best.hit.artistName],
      ...(best.hit.duration ? { durationMs: best.hit.duration * 1000 } : {}),
    },
    quality: best.quality,
  };
}
