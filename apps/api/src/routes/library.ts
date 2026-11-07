import type { FastifyInstance } from "fastify";
import type { Track } from "@offy/contracts";
import { sql } from "../db.js";
import { ApiError, decodeCursor, encodeCursor, int, iso, requireUserId, sendError } from "../http.js";
import { ensureTrack, rowToTrack, upsertTrack } from "../tracks.js";

const COLLECTION_TYPES = new Set(["albums", "artists", "playlists"]);

function snapshotOf(body: unknown): Track | null {
  const record = (body ?? {}) as Record<string, unknown>;
  const candidate = (record.track ?? record.trackSnapshot ?? record.snapshot) as Track | undefined;
  if (!candidate || typeof candidate !== "object") return null;
  const id = typeof (candidate as any).id === "string" ? (candidate as any).id : "";
  const title = typeof (candidate as any).title === "string" ? (candidate as any).title : "";
  if (!id || !title) return null;
  return candidate;
}

export async function registerLibraryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/me/library/tracks", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const query = request.query as Record<string, unknown>;
      const limit = Math.min(500, Math.max(1, int(query.limit, 100)));
      const cursor = decodeCursor(query.cursor);

      const rows = cursor
        ? await sql`
            select t.*, l.liked_at from likes l
            join tracks t on t.id = l.track_id
            where l.user_id = ${userId}
              and (l.liked_at, l.track_id) < (${cursor.at}::timestamptz, ${cursor.id})
            order by l.liked_at desc, l.track_id desc
            limit ${limit + 1}
          `
        : await sql`
            select t.*, l.liked_at from likes l
            join tracks t on t.id = l.track_id
            where l.user_id = ${userId}
            order by l.liked_at desc, l.track_id desc
            limit ${limit + 1}
          `;

      const page = rows.slice(0, limit);
      const last = page[page.length - 1] as any;
      return reply.send({
        items: page.map((row: any) => ({
          track: { ...rowToTrack(row), viewer: { liked: true } },
          likedAt: iso(row.liked_at),
        })),
        nextCursor: rows.length > limit && last ? encodeCursor(iso(last.liked_at), String(last.id)) : null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.put("/v1/me/library/tracks/:id", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const track = snapshotOf(request.body);
      await ensureTrack(sql, id, track);
      await sql`
        insert into likes (user_id, track_id) values (${userId}, ${id})
        on conflict (user_id, track_id) do nothing
      `;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/v1/me/library/tracks/:id", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      await sql`delete from likes where user_id = ${userId} and track_id = ${id}`;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/me/library/:type", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { type } = request.params as { type: string };
      if (!COLLECTION_TYPES.has(type)) throw new ApiError(404, "UNKNOWN_COLLECTION", "UNKNOWN_COLLECTION");
      const rows = await sql`
        select item_id, snapshot, saved_at from collections
        where user_id = ${userId} and kind = ${type}
        order by saved_at desc
      `;
      const singularKind =
        type === "albums" ? "album" : type === "artists" ? "artist" : "playlist";
      return reply.send({
        items: rows.map((row: any) => {
          const snap = (row.snapshot ?? {}) as Record<string, unknown>;
          const entity = {
            ...snap,
            id: String(row.item_id),
            name: (snap.name ?? snap.title ?? String(row.item_id)) as string,
            title: (snap.title ?? snap.name ?? String(row.item_id)) as string,
          };
          return {
            savedAt: iso(row.saved_at),
            [singularKind]: entity,
            ...entity,
          };
        }),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.put("/v1/me/library/:type/:id", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { type, id } = request.params as { type: string; id: string };
      if (!COLLECTION_TYPES.has(type)) throw new ApiError(404, "UNKNOWN_COLLECTION", "UNKNOWN_COLLECTION");
      const record = (request.body ?? {}) as Record<string, unknown>;
      const snapshot = (record.snapshot ?? record) as Record<string, unknown>;
      await sql`
        insert into collections (user_id, kind, item_id, snapshot)
        values (${userId}, ${type}, ${id}, ${sql.json(snapshot as any)})
        on conflict (user_id, kind, item_id) do update set snapshot = excluded.snapshot
      `;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/v1/me/library/:type/:id", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { type, id } = request.params as { type: string; id: string };
      if (!COLLECTION_TYPES.has(type)) throw new ApiError(404, "UNKNOWN_COLLECTION", "UNKNOWN_COLLECTION");
      await sql`delete from collections where user_id = ${userId} and kind = ${type} and item_id = ${id}`;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
