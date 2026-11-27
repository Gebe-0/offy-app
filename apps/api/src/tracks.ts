import type { ApiTrack, Cover, Track, TrackArtist } from "@offy/contracts";
import { fetchVideoMeta } from "@offy/core";
import type { Sql } from "./db.js";

export function isSafeHttpsUrl(value: unknown, maxLen = 1024): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLen) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function sanitizeCover(cover: unknown): Cover | undefined {
  if (!cover || typeof cover !== "object") return undefined;
  const candidate = cover as { url?: unknown; width?: unknown; height?: unknown };
  if (!isSafeHttpsUrl(candidate.url)) return undefined;
  return {
    url: candidate.url,
    width:
      typeof candidate.width === "number" && Number.isFinite(candidate.width)
        ? Math.max(0, Math.min(4096, Math.trunc(candidate.width)))
        : 0,
    height:
      typeof candidate.height === "number" && Number.isFinite(candidate.height)
        ? Math.max(0, Math.min(4096, Math.trunc(candidate.height)))
        : 0,
  };
}

function sanitizeTrack(track: Track): Track {
  const safeArtists: TrackArtist[] = Array.isArray(track.artists)
    ? track.artists
        .slice(0, 20)
        .map((a) => ({
          id: typeof a?.id === "string" ? a.id.slice(0, 128) : "unknown",
          name: typeof a?.name === "string" ? a.name.trim().slice(0, 200) : "Unknown Artist",
        }))
        .filter((a) => a.name.length > 0)
    : [];
  const safeAlbum =
    track.album && typeof track.album === "object"
      ? {
          id: typeof track.album.id === "string" ? track.album.id.slice(0, 128) : "",
          title: typeof track.album.title === "string" ? track.album.title.trim().slice(0, 250) : "",
        }
      : undefined;
  const safeCover = sanitizeCover(track.cover);
  return {
    id: String(track.id).trim().slice(0, 128),
    title: String(track.title).trim().slice(0, 300),
    artists: safeArtists.length > 0 ? safeArtists : [{ id: "unknown", name: "Unknown Artist" }],
    ...(safeAlbum && safeAlbum.title ? { album: safeAlbum } : {}),
    durationMs: Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.trunc(track.durationMs ?? 0))),
    ...(safeCover ? { cover: safeCover } : {}),
    ...(track.explicit ? { explicit: true } : {}),
  };
}

export function trackCover(track: Track): Cover | undefined {
  return track.cover;
}

export function rowToTrack(row: any): ApiTrack {
  const artists = Array.isArray(row.artists) ? (row.artists as TrackArtist[]) : [];
  const album = row.album as { id: string; title: string } | null;
  return {
    type: "track",
    id: String(row.id),
    title: String(row.title),
    artists: artists.length > 0 ? artists : [{ id: "unknown", name: "Unknown Artist" }],
    ...(album ? { album } : {}),
    durationMs: Number(row.duration_ms ?? 0),
    ...(row.cover ? { cover: row.cover as Cover } : {}),
    ...(row.explicit ? { explicit: true } : {}),
  };
}

export function snapshotToTrack(snapshot: Track): ApiTrack {
  return { type: "track", ...snapshot };
}

/**
 * Inserts a track into the global catalog.
 * Only server-trusted sources (allowOverwrite = true) may update an existing track row;
 * client-supplied snapshots use ON CONFLICT DO NOTHING to prevent global catalog poisoning.
 */
export async function upsertTrack(sql: Sql, rawTrack: Track, allowOverwrite = false): Promise<void> {
  if (!rawTrack.id || !rawTrack.title) return;
  const track = sanitizeTrack(rawTrack);
  if (!track.id || !track.title) return;

  if (allowOverwrite) {
    await sql`
      insert into tracks (id, title, artists, album, duration_ms, cover, explicit, payload)
      values (
        ${track.id},
        ${track.title},
        ${sql.json(track.artists as any)},
        ${track.album ? sql.json(track.album as any) : null},
        ${track.durationMs},
        ${track.cover ? sql.json(track.cover as any) : null},
        ${Boolean(track.explicit)},
        ${sql.json(track as any)}
      )
      on conflict (id) do update set
        title = excluded.title,
        artists = excluded.artists,
        album = coalesce(excluded.album, tracks.album),
        duration_ms = excluded.duration_ms,
        cover = coalesce(excluded.cover, tracks.cover),
        explicit = excluded.explicit,
        payload = excluded.payload,
        refreshed_at = now()
    `;
  } else {
    await sql`
      insert into tracks (id, title, artists, album, duration_ms, cover, explicit, payload)
      values (
        ${track.id},
        ${track.title},
        ${sql.json(track.artists as any)},
        ${track.album ? sql.json(track.album as any) : null},
        ${track.durationMs},
        ${track.cover ? sql.json(track.cover as any) : null},
        ${Boolean(track.explicit)},
        ${sql.json(track as any)}
      )
      on conflict (id) do nothing
    `;
  }
}

export async function upsertTracks(sql: Sql, tracks: Track[], allowOverwrite = false): Promise<void> {
  for (const track of tracks) {
    await upsertTrack(sql, track, allowOverwrite);
  }
}

export async function ensureTrack(sql: Sql, id: string, snapshot?: Track | null): Promise<void> {
  if (!id) return;
  const exists = await sql`select 1 from tracks where id = ${id} limit 1`;
  if (exists[0]) return;

  if (snapshot && snapshot.id && snapshot.title) {
    await upsertTrack(sql, { ...snapshot, id }, false);
    return;
  }

  try {
    const meta = await fetchVideoMeta(id);
    if (meta && meta.title) {
      await upsertTrack(
        sql,
        {
          id: meta.id || id,
          title: meta.title,
          artists: [{ id: meta.artistId ?? "unknown", name: meta.artists || "Unknown Artist" }],
          durationMs: meta.durationMs || 0,
          ...(meta.coverUrl ? { cover: { url: meta.coverUrl, width: 544, height: 544 } } : {}),
        },
        true,
      );
      return;
    }
  } catch {
    // ignore
  }

  // Fallback: stub track row so foreign keys (likes, playback_events, playlist_items) never fail
  await sql`
    insert into tracks (id, title, artists, duration_ms, refreshed_at)
    values (${id.slice(0, 128)}, ${id.slice(0, 128)}, ${sql.json([{ id: "unknown", name: "Unknown Artist" }])}, 0, now())
    on conflict (id) do nothing
  `;
}

export async function likableIds(sql: Sql, userId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await sql`
    select track_id from likes where user_id = ${userId} and track_id in ${sql(ids)}
  `;
  return new Set(rows.map((row: any) => String(row.track_id)));
}
