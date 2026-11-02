export interface VideoMeta {
  id: string;
  title: string;
  artists: string;
  artistId?: string;
  durationMs: number;
  coverUrl?: string;
  album?: { id: string; title: string };
}

export function metaFromPlayerResponse(response: unknown): VideoMeta | null {
  const details = (response as any)?.videoDetails;
  if (!details?.videoId) return null;
  const thumbnails: any[] = details.thumbnail?.thumbnails ?? [];
  const cover = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1]?.url : undefined;
  const author = typeof details.author === "string" ? details.author : "";
  return {
    id: String(details.videoId),
    title: String(details.title ?? "").replace(/\s*\(.*?\)\s*$/g, "").trim() || String(details.title ?? ""),
    artists: author.replace(/\s*-\s*Topic$/i, "").trim() || "Unknown Artist",
    durationMs: Math.max(0, Math.round(Number(details.lengthSeconds ?? 0) * 1000)),
    coverUrl: cover,
  };
}
