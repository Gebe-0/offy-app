import { api, ApiError } from "@/shared/api";
import type { Track } from "@/shared/contracts";

const FALLBACK_CONCURRENCY = 4;

export interface FinalizedPlaylist {
  playlistId: string;
  saved: number;
}

function uniqueTracks(tracks: Track[]): Track[] {
  return [
    ...new Map(
      tracks
        .filter((track) => Boolean(track?.id))
        .map((track) => [track.id, track] as const),
    ).values(),
  ];
}

async function addOneByOne(
  playlistId: string,
  tracks: Track[],
): Promise<number> {
  let saved = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < tracks.length) {
      const track = tracks[cursor++];
      try {
        await api.addPlaylistTrack(playlistId, track.id, track);
        saved += 1;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) saved += 1;
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(FALLBACK_CONCURRENCY, tracks.length) },
      worker,
    ),
  );
  return saved;
}

async function addTracks(playlistId: string, tracks: Track[]): Promise<number> {
  try {
    const result = await api.addPlaylistTrackSnapshots(playlistId, tracks);
    return result.added;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 405)
    ) {
      return addOneByOne(playlistId, tracks);
    }
    throw error;
  }
}

export async function finalizeImportedPlaylist(
  title: string,
  description: string | undefined,
  tracks: Track[],
): Promise<FinalizedPlaylist> {
  const cleanTitle = title.trim().slice(0, 200) || "Imported playlist";
  let playlistId: string;
  const existingTrackIds = new Set<string>();
  const existingFingerprints = new Set<string>();

  try {
    const existingList = await api.listPlaylists();
    const existing = existingList.items?.find(
      (p) => p.title.trim().toLowerCase() === cleanTitle.toLowerCase(),
    );

    if (existing) {
      playlistId = existing.id;
      try {
        const detail = await api.getUserPlaylist(existing.id);
        if (Array.isArray(detail?.items)) {
          for (const item of detail.items) {
            if (item.track?.id) existingTrackIds.add(item.track.id);
            const artistNames = (item.track?.artists || [])
              .map((a: any) => a.name)
              .join(", ");
            const fp = `${item.track?.title || ""} - ${artistNames}`.toLowerCase().trim();
            if (fp) existingFingerprints.add(fp);
          }
        }
      } catch {
        // ignore detail read error
      }
    } else {
      const created = await api.createPlaylist({
        title: cleanTitle,
        ...(description?.trim()
          ? { description: description.trim().slice(0, 2000) }
          : {}),
      });
      playlistId = created.id;
    }
  } catch {
    const created = await api.createPlaylist({
      title: cleanTitle,
      ...(description?.trim()
        ? { description: description.trim().slice(0, 2000) }
        : {}),
    });
    playlistId = created.id;
  }

  // Deduplicate against existing tracks in the playlist
  const unique = uniqueTracks(tracks).filter((t) => {
    if (existingTrackIds.has(t.id)) return false;
    const artistNames = (t.artists || []).map((a) => a.name).join(", ");
    const fp = `${t.title || ""} - ${artistNames}`.toLowerCase().trim();
    if (fp && existingFingerprints.has(fp)) return false;
    return true;
  });

  const saved = unique.length > 0 ? await addTracks(playlistId, unique) : 0;
  return { playlistId, saved };
}
