import type {
  ClientImportedPlaylist,
  ClientImportedTrack,
} from "../../importTypes";
import { rethrowIfAborted } from "@/shared/utils/abort";
import { log } from "@/shared/utils/logger";
import { fetchSpotifyEmbed } from "./spotifyEmbed";
import {
  fetchSpotifyPlaylistTracks,
  type PathfinderResult,
} from "./spotifyPathfinder";
import {
  parseSpotifyUrl,
  resolveSpotifyUrl,
  type SpotifyEntityType,
} from "./spotifyUrl";
import {
  fetchSpotifyTracksWithAccount,
  fetchUserSpotifyLikedTracks,
  isSpotifySignedIn,
  prefersSpotifyAccountImport,
} from "@/shared/spotify";

function defaultTitle(entityType: SpotifyEntityType): string {
  if (entityType === "album") return "Imported Spotify album";
  if (entityType === "track") return "Imported Spotify track";
  if (entityType === "collection") return "Músicas Curtidas (Spotify)";
  return "Imported Spotify playlist";
}

const EMBED_TRACK_CAP = 100;

async function tryPathfinder(
  entityId: string,
  signal?: AbortSignal,
): Promise<PathfinderResult> {
  try {
    return await fetchSpotifyPlaylistTracks(entityId, signal);
  } catch (error) {
    rethrowIfAborted(signal);
    log(
      "yellow",
      "import",
      `spotify pathfinder failed, falling back to the embed page: ${String(error)}`,
    );
    return { tracks: [], total: undefined };
  }
}

function pickPlaylistTracks(
  full: PathfinderResult,
  embed: ClientImportedTrack[],
): ClientImportedTrack[] {
  if (full.tracks.length > 0 && full.tracks.length >= embed.length) {
    if (full.total !== undefined && full.tracks.length < full.total) {
      log(
        "yellow",
        "import",
        `spotify import is partial: ${full.tracks.length} of ${full.total} tracks`,
      );
    }
    return full.tracks;
  }
  if (embed.length >= EMBED_TRACK_CAP) {
    log(
      "yellow",
      "import",
      `spotify embed lists only the first ${EMBED_TRACK_CAP} tracks of this playlist`,
    );
  }
  return embed;
}

export async function importSpotify(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<ClientImportedPlaylist> {
  const resolvedUrl = await resolveSpotifyUrl(rawUrl, signal);
  const { type: entityType, id: entityId } = parseSpotifyUrl(resolvedUrl);

  if (entityType === "collection") {
    const liked = await fetchUserSpotifyLikedTracks();
    if (liked.tracks.length > 0) {
      return {
        source: "spotify",
        sourceUrl: rawUrl,
        title: "Músicas Curtidas (Spotify)",
        description: "Músicas curtidas sincronizadas do seu Spotify",
        tracks: liked.tracks.map((t) => ({
          sourceId: t.sourceId,
          title: t.title,
          artists: t.artists,
          album: t.album,
          durationMs: t.durationMs,
          coverUrl: t.coverUrl,
        })),
      };
    }
    throw new Error("Nenhuma música curtida encontrada na sua conta do Spotify.");
  }

  // If user is logged into Spotify and account import is preferred, try fetching all tracks with their token
  if (entityType === "playlist" && isSpotifySignedIn() && prefersSpotifyAccountImport()) {
    try {
      const accountResult = await fetchSpotifyTracksWithAccount(entityId);
      if (accountResult.tracks.length > 0) {
        log(
          "green",
          "import",
          `spotify account import fetched all ${accountResult.tracks.length} tracks`,
        );
        return {
          source: "spotify",
          sourceUrl: rawUrl,
          title: accountResult.title || defaultTitle(entityType),
          ...(accountResult.description
            ? { description: accountResult.description }
            : {}),
          tracks: accountResult.tracks.map((t) => ({
            sourceId: t.sourceId,
            title: t.title,
            artists: t.artists,
            album: t.album,
            durationMs: t.durationMs,
            coverUrl: t.coverUrl,
          })),
        };
      }
    } catch (err) {
      log("yellow", "import", `account playlist fetch failed: ${String(err)}`);
    }
  }

  const embed = await fetchSpotifyEmbed(
    entityType,
    entityId,
    defaultTitle(entityType),
    signal,
  );
  const title = embed.title ?? defaultTitle(entityType);
  const base = {
    source: "spotify" as const,
    sourceUrl: rawUrl,
    title,
    ...(embed.description ? { description: embed.description } : {}),
  };

  if (entityType === "playlist") {
    const tracks = pickPlaylistTracks(
      await tryPathfinder(entityId, signal),
      embed.tracks,
    );
    if (tracks.length > 0) return { ...base, tracks };
  }
  if (embed.tracks.length > 0) return { ...base, tracks: embed.tracks };
  throw new Error("No tracks found in the Spotify playlist.");
}
