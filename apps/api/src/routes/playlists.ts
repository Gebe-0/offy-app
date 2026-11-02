import type { FastifyInstance } from "fastify";
import type { ApiTrack, Track, UserPlaylist, UserPlaylistItem } from "@offy/contracts";
import { sql } from "../db.js";
import { ApiError, encodeCursor, int, iso, requireUserId, sendError } from "../http.js";
import { ensureTrack, rowToTrack, upsertTrack } from "../tracks.js";

function playlistJson(row: any): UserPlaylist {
  const covers = Array.isArray(row.cover_urls) ? (row.cover_urls as string[]).filter(Boolean) : [];
  const owner = row.owner_id
    ? {
        id: String(row.owner_id),
        username: row.owner_username ?? null,
        displayName: row.owner_display_name ?? null,
        avatarUrl: row.owner_avatar_url ?? null,
      }
    : undefined;
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description ?? "",
    isPublic: Boolean(row.is_public),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    revision: Number(row.revision ?? 1),
    trackCount: Number(row.track_count ?? 0),
    ...(covers.length > 0 ? { coverUrls: covers } : {}),
    ...(row.owner_id ? { ownerId: String(row.owner_id) } : {}),
    ...(owner ? { owner } : {}),
  };
}

function itemJson(row: any): UserPlaylistItem {
  const track: ApiTrack = { ...rowToTrack(row), viewer: { liked: Boolean(row.liked) } };
  return {
    id: String(row.item_id),
    track,
    position: Number(row.position ?? 0),
    addedAt: iso(row.added_at),
  };
}

async function loadOwned(id: string, userId: string): Promise<any> {
  const rows = await sql`
    select p.*, u.username as owner_username, u.display_name as owner_display_name, u.avatar_url as owner_avatar_url,
           (select count(*) from playlist_items i where i.playlist_id = p.id) as track_count,
           (select coalesce(jsonb_agg(t.cover->>'url'), '[]'::jsonb)
              from (select t2.cover from playlist_items i2
                    join tracks t2 on t2.id = i2.track_id
                    where i2.playlist_id = p.id and t2.cover is not null
                    order by i2.position limit 4) t) as cover_urls
    from playlists p join users u on u.id = p.owner_id
    where p.id = ${id} and p.owner_id = ${userId}
    limit 1
  `;
  if (!rows[0]) throw new ApiError(404, "PLAYLIST_NOT_FOUND", "PLAYLIST_NOT_FOUND");
  return rows[0];
}

async function loadItems(playlistId: string, userId: string, limit?: number): Promise<UserPlaylistItem[]> {
  const limiter = limit && limit > 0 ? limit : 5000;
  const rows = await sql`
    select i.id as item_id, i.position, i.added_at, t.*,
      exists(select 1 from likes l where l.user_id = ${userId} and l.track_id = t.id) as liked
    from playlist_items i join tracks t on t.id = i.track_id
    where i.playlist_id = ${playlistId}
    order by i.position asc
    limit ${limiter}
  `;
  return rows.map(itemJson);
}

function trackFrom(body: unknown): Track | null {
  const record = (body ?? {}) as Record<string, unknown>;
  const candidate = (record.track ?? record.trackSnapshot ?? record.snapshot) as Track | undefined;
  if (!candidate || typeof (candidate as any).id !== "string" || typeof (candidate as any).title !== "string") {
    return null;
  }
  return candidate;
}

export async function registerPlaylistRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/me/playlists", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const rows = await sql`
        select p.*, u.username as owner_username, u.display_name as owner_display_name, u.avatar_url as owner_avatar_url,
               (select count(*) from playlist_items i where i.playlist_id = p.id) as track_count,
               (select coalesce(jsonb_agg(t.cover->>'url'), '[]'::jsonb)
                  from (select t2.cover from playlist_items i2
                        join tracks t2 on t2.id = i2.track_id
                        where i2.playlist_id = p.id and t2.cover is not null
                        order by i2.position limit 4) t) as cover_urls
        from playlists p join users u on u.id = p.owner_id
        where p.owner_id = ${userId}
        order by p.created_at desc
      `;
      return reply.send({ items: rows.map(playlistJson) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/me/playlists", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = (request.body ?? {}) as { title?: unknown; description?: unknown; isPublic?: unknown };
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) throw new ApiError(400, "TITLE_REQUIRED", "TITLE_REQUIRED");
      const rows = await sql`
        insert into playlists (owner_id, title, description, is_public)
        values (${userId}, ${title.slice(0, 200)}, ${typeof body.description === "string" ? body.description : ""}, ${Boolean(body.isPublic)})
        returning *
      `;
      return reply.status(201).send(playlistJson({ ...rows[0], track_count: 0 }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/me/playlists/:id", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, unknown>;
      const playlist = await loadOwned(id, userId);
      const etag = `"${playlist.id}-${playlist.revision}"`;

      if (request.headers["if-none-match"] === etag) {
        return reply.status(304).send();
      }

      const limit = query.compact === "true" ? int(query.limit, 100) : undefined;
      const items = await loadItems(id, userId, limit);
      const durationMs = items.reduce((total, item) => total + (item.track.durationMs ?? 0), 0);

      reply.header("etag", etag);
      return reply.send({
        playlist: playlistJson(playlist),
        items,
        trackCount: Number(playlist.track_count ?? items.length),
        durationMs,
        partial: Boolean(limit && Number(playlist.track_count ?? 0) > items.length),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/v1/me/playlists/:id", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { title?: unknown; description?: unknown; isPublic?: unknown };
      await loadOwned(id, userId);
      const rows = await sql`
        update playlists set
          title = coalesce(${typeof body.title === "string" ? body.title.trim().slice(0, 200) : null}, title),
          description = coalesce(${typeof body.description === "string" ? body.description : null}, description),
          is_public = coalesce(${typeof body.isPublic === "boolean" ? body.isPublic : null}, is_public),
          revision = revision + 1,
          updated_at = now()
        where id = ${id}
        returning *
      `;
      const count = await sql`select count(*) as track_count from playlist_items where playlist_id = ${id}`;
      return reply.send(playlistJson({ ...rows[0], track_count: count[0].track_count }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/v1/me/playlists/:id", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      await loadOwned(id, userId);
      await sql`delete from playlists where id = ${id}`;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/me/playlists/:id/tracks/:trackId", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id, trackId } = request.params as { id: string; trackId: string };
      await loadOwned(id, userId);

      const track = trackFrom(request.body);
      await ensureTrack(sql, trackId, track);

      const next = await sql`
        select coalesce(max(position) + 1, 0) as position from playlist_items where playlist_id = ${id}
      `;
      const inserted = await sql`
        insert into playlist_items (playlist_id, track_id, position)
        values (${id}, ${trackId}, ${next[0].position})
        returning id, position, added_at
      `;
      await sql`update playlists set revision = revision + 1, updated_at = now() where id = ${id}`;

      const rows = await sql`select * from tracks where id = ${trackId} limit 1`;
      return reply.status(201).send(
        itemJson({
          ...rows[0],
          item_id: inserted[0].id,
          position: inserted[0].position,
          added_at: inserted[0].added_at,
        }),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/me/playlists/:id/tracks", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      await loadOwned(id, userId);

      const body = (request.body ?? {}) as { tracks?: unknown };
      const incoming = Array.isArray(body.tracks) ? (body.tracks as Track[]) : [];
      if (incoming.length === 0) throw new ApiError(400, "NO_TRACKS", "NO_TRACKS");

      const state = await sql`
        select coalesce(max(position) + 1, 0) as position from playlist_items where playlist_id = ${id}
      `;
      let position = Number(state[0].position);
      let added = 0;
      let rejected = 0;
      const createdIds: string[] = [];

      for (const track of incoming.slice(0, 2000)) {
        if (!track || typeof track.id !== "string" || typeof track.title !== "string") {
          rejected += 1;
          continue;
        }
        await upsertTrack(sql, track);
        const inserted = await sql`
          insert into playlist_items (playlist_id, track_id, position)
          values (${id}, ${track.id}, ${position})
          returning id
        `;
        createdIds.push(String(inserted[0].id));
        position += 1;
        added += 1;
      }

      await sql`update playlists set revision = revision + 1, updated_at = now() where id = ${id}`;

      const items = createdIds.length > 0 ? await loadItems(id, userId) : [];
      return reply.send({
        items: items.filter((item) => createdIds.includes(item.id)),
        added,
        rejected,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/v1/me/playlists/:id/items/:itemId", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id, itemId } = request.params as { id: string; itemId: string };
      await loadOwned(id, userId);
      await sql`delete from playlist_items where id = ${itemId} and playlist_id = ${id}`;
      await sql`update playlists set revision = revision + 1, updated_at = now() where id = ${id}`;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/me/playlists/:id/items/:itemId/move", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id, itemId } = request.params as { id: string; itemId: string };
      await loadOwned(id, userId);

      const body = (request.body ?? {}) as { beforeItemId?: unknown };
      const beforeItemId = typeof body.beforeItemId === "string" ? body.beforeItemId : null;

      const rows = await sql`
        select id, position from playlist_items where playlist_id = ${id} order by position asc
      `;
      const order = rows.map((row: any) => String(row.id));
      const from = order.indexOf(itemId);
      if (from === -1) throw new ApiError(404, "ITEM_NOT_FOUND", "ITEM_NOT_FOUND");

      order.splice(from, 1);
      const target = beforeItemId ? order.indexOf(beforeItemId) : order.length;
      order.splice(target === -1 ? order.length : target, 0, itemId);

      for (let index = 0; index < order.length; index += 1) {
        await sql`update playlist_items set position = ${index} where id = ${order[index]} and playlist_id = ${id}`;
      }
      await sql`update playlists set revision = revision + 1, updated_at = now() where id = ${id}`;

      const playlist = await loadOwned(id, userId);
      const items = await loadItems(id, userId);
      return reply.send({ playlist: playlistJson(playlist), items });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
