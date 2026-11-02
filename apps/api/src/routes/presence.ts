import type { FastifyInstance } from "fastify";
import { sql } from "../db.js";
import { int, iso, requireUserId, sendError, str } from "../http.js";
import { ensureTrack, rowToTrack } from "../tracks.js";

const STALE_SECONDS = 300;

export async function registerPresenceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/presence/heartbeat", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const trackId = str(body.trackId).trim();

      if (!trackId) {
        await sql`delete from presence where user_id = ${userId}`;
        return reply.status(204).send();
      }

      await ensureTrack(sql, trackId);

      await sql`
        insert into presence (user_id, track_id, position_ms, updated_at)
        values (${userId}, ${trackId}, ${Math.max(0, int(body.positionMs, 0))}, now())
        on conflict (user_id) do update set
          track_id = excluded.track_id,
          position_ms = excluded.position_ms,
          updated_at = now()
      `;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/v1/presence", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      await sql`delete from presence where user_id = ${userId}`;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/presence", async (request, reply) => {
    try {
      requireUserId(request);
      const query = request.query as Record<string, unknown>;
      const limit = Math.min(50, Math.max(1, int(query.limit, 20)));
      const rows = await sql`
        select p.user_id, p.position_ms, p.updated_at, t.*, u.username, u.display_name, u.avatar_url
        from presence p
        join tracks t on t.id = p.track_id
        join users u on u.id = p.user_id
        where p.updated_at > now() - ${`${STALE_SECONDS} seconds`}::interval
          and u.show_activity = true
        order by p.updated_at desc
        limit ${limit}
      `;
      return reply.send({
        items: rows.map((row: any) => ({
          user: {
            id: String(row.user_id),
            username: row.username ?? null,
            displayName: row.display_name ?? null,
            avatarUrl: row.avatar_url ?? null,
          },
          track: rowToTrack(row),
          positionMs: Number(row.position_ms ?? 0),
          updatedAt: iso(row.updated_at),
        })),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
