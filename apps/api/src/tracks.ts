import type { ApiTrack, Cover, Track, TrackArtist } from "@offy/contracts";
import { fetchVideoMeta } from "@offy/core";
import type { Sql } from "./db.js";

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

export async function upsertTrack(sql: Sql, track: Track): Promise<void> {
  if (!track.id || !track.title) return;
  await sql`
    insert into tracks (id, title, artists, album, duration_ms, cover, explicit, payload)
    values (
      ${track.id},
      ${track.title},
      ${sql.json((track.artists ?? []) as any)},
      ${track.album ? sql.json(track.album as any) : null},
      ${Math.max(0, Math.trunc(track.durationMs ?? 0))},
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
}

export async function upsertTracks(sql: Sql, tracks: Track[]): Promise<void> {
  for (const track of tracks) {
    await upsertTrack(sql, track);
  }
}

export async function ensureTrack(sql: Sql, id: string, snapshot?: Track | null): Promise<void> {
  if (!id) return;
  if (snapshot && snapshot.id && snapshot.title) {
    if (snapshot.id !== id) snapshot.id = id;
    await upsertTrack(sql, snapshot);
    return;
  }
  const exists = await sql`select 1 from tracks where id = ${id} limit 1`;
  if (exists[0]) return;

  try {
    const meta = await fetchVideoMeta(id);
    if (meta && meta.title) {
      await upsertTrack(sql, {
        id: meta.id || id,
        title: meta.title,
        artists: [{ id: meta.artistId ?? "unknown", name: meta.artists || "Unknown Artist" }],
        durationMs: meta.durationMs || 0,
        ...(meta.coverUrl ? { cover: { url: meta.coverUrl, width: 544, height: 544 } } : {}),
      });
      return;
    }
  } catch {
    // ignore
  }

  // Fallback: stub track row so foreign keys (likes, playback_events, playlist_items) never fail
  await sql`
    insert into tracks (id, title, artists, duration_ms, refreshed_at)
    values (${id}, ${id}, ${sql.json([{ id: "unknown", name: "Unknown Artist" }])}, 0, now())
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
