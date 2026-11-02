import type { FastifyInstance } from "fastify";
import type { ApiTrackDetails, SearchType } from "@offy/contracts";
import { browseAlbum, browseArtist, browsePlaylist, fetchVideoMeta, search } from "@offy/core";
import { sql } from "../db.js";
import { ApiError, int, requireUserId, sendError, str } from "../http.js";
import { rowToTrack, upsertTrack } from "../tracks.js";

const SEARCH_TYPES: SearchType[] = ["all", "track", "artist", "album", "playlist"];

function asSearchType(value: unknown): SearchType {
  const candidate = str(value, "all") as SearchType;
  return SEARCH_TYPES.includes(candidate) ? candidate : "all";
}

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/catalog/search", async (request, reply) => {
    try {
      requireUserId(request);
      const query = request.query as Record<string, unknown>;
      const term = str(query.q).trim();
      if (!term) throw new ApiError(400, "QUERY_REQUIRED", "QUERY_REQUIRED");
      const type = asSearchType(query.type);
      const limit = Math.min(100, Math.max(1, int(query.limit, 30)));
      const items = await search(term, type);
      return reply.send({ items: items.slice(0, limit) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/catalog/tracks/:id", async (request, reply) => {
    try {
      requireUserId(request);
      const { id } = request.params as { id: string };

      const rows = await sql`select * from tracks where id = ${id} limit 1`;
      if (rows[0]) {
        const track = rowToTrack(rows[0]);
        return reply.send({ ...track, viewer: { liked: await isLiked(request, id) } } satisfies ApiTrackDetails);
      }

      const meta = await fetchVideoMeta(id);
      if (!meta) throw new ApiError(404, "TRACK_NOT_FOUND", "TRACK_NOT_FOUND");

      const track = {
        id: meta.id,
        title: meta.title,
        artists: [{ id: meta.artistId ?? "unknown", name: meta.artists }],
        durationMs: meta.durationMs,
        ...(meta.coverUrl ? { cover: { url: meta.coverUrl, width: 544, height: 544 } } : {}),
      };
      await upsertTrack(sql, track);
      return reply.send({ ...track, viewer: { liked: false } } satisfies ApiTrackDetails);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/catalog/albums/:id", async (request, reply) => {
    try {
      requireUserId(request);
      const { id } = request.params as { id: string };
      const album = await browseAlbum(id);
      if (!album) throw new ApiError(404, "ALBUM_NOT_FOUND", "ALBUM_NOT_FOUND");
      return reply.send(album);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/catalog/artists/:id", async (request, reply) => {
    try {
      requireUserId(request);
      const { id } = request.params as { id: string };
      const artist = await browseArtist(id);
      if (!artist) throw new ApiError(404, "ARTIST_NOT_FOUND", "ARTIST_NOT_FOUND");
      return reply.send(artist);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/catalog/playlists/:id", async (request, reply) => {
    try {
      requireUserId(request);
      const { id } = request.params as { id: string };
      const playlist = await browsePlaylist(id);
      if (!playlist) throw new ApiError(404, "PLAYLIST_NOT_FOUND", "PLAYLIST_NOT_FOUND");
      return reply.send(playlist);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}

async function isLiked(request: { headers: Record<string, unknown> }, trackId: string): Promise<boolean> {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  try {
    const userId = requireUserId(request as any);
    const rows = await sql`select 1 from likes where user_id = ${userId} and track_id = ${trackId} limit 1`;
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}
