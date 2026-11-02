import type { FastifyInstance } from "fastify";
import type {
  LeaderboardPeriod,
  PopularTimeWindow,
  PlaybackHistoryItem,
  RecordPlaybackEventRequest,
} from "@offy/contracts";
import { search } from "@offy/core";
import { sql } from "../db.js";
import { ApiError, decodeCursor, encodeCursor, int, iso, requireUserId, sendError, str } from "../http.js";
import { ensureTrack, rowToTrack, upsertTrack } from "../tracks.js";

const WINDOWS: Record<PopularTimeWindow, string> = {
  "12h": "12 hours",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  all: "100 years",
};

function asWindow(value: unknown): PopularTimeWindow {
  const candidate = str(value, "7d") as PopularTimeWindow;
  return candidate in WINDOWS ? candidate : "7d";
}

function asPeriod(value: unknown): LeaderboardPeriod {
  const candidate = str(value, "weekly") as LeaderboardPeriod;
  return ["weekly", "monthly", "all_time"].includes(candidate) ? candidate : "weekly";
}

function periodInterval(period: LeaderboardPeriod): string {
  return period === "weekly" ? "7 days" : period === "monthly" ? "30 days" : "100 years";
}

export async function registerHistoryRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/me/playback/events", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = (request.body ?? {}) as Partial<RecordPlaybackEventRequest>;
      const trackId = typeof body.trackId === "string" ? body.trackId : "";
      if (!trackId) throw new ApiError(400, "TRACK_REQUIRED", "TRACK_REQUIRED");

      await ensureTrack(sql, trackId, body.trackSnapshot);

      await sql`
        insert into playback_events (
          user_id, track_id, playback_session_id, listening_session_id,
          played_duration_ms, track_duration_ms, completion_rate,
          completed, skipped, loop_count, has_seek_backward, context
        ) values (
          ${userId}, ${trackId},
          ${str(body.playbackSessionId)}, ${str(body.listeningSessionId)},
          ${Math.max(0, int(body.playedDurationMs, 0))},
          ${Math.max(0, int(body.trackDurationMs, 0))},
          ${Number.isFinite(Number(body.completionRate)) ? Number(body.completionRate) : 0},
          ${Boolean(body.completed)}, ${Boolean(body.skipped)},
          ${Math.max(0, int(body.loopCount, 0))}, ${Boolean(body.hasSeekBackward)},
          ${body.context ? sql.json(body.context as any) : null}
        )
      `;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/me/history", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const query = request.query as Record<string, unknown>;
      const limit = Math.min(200, Math.max(1, int(query.limit, 30)));
      const cursor = decodeCursor(query.cursor);

      const rows = cursor
        ? await sql`
            select e.*, t.*, e.id as event_id, e.created_at as event_at
            from playback_events e join tracks t on t.id = e.track_id
            where e.user_id = ${userId} and (e.created_at, e.id) < (${cursor.at}::timestamptz, ${cursor.id}::bigint)
            order by e.created_at desc, e.id desc limit ${limit + 1}
          `
        : await sql`
            select e.*, t.*, e.id as event_id, e.created_at as event_at
            from playback_events e join tracks t on t.id = e.track_id
            where e.user_id = ${userId}
            order by e.created_at desc, e.id desc limit ${limit + 1}
          `;

      const page = rows.slice(0, limit);
      const last = page[page.length - 1] as any;

      const items: PlaybackHistoryItem[] = page.map((row: any) => ({
        id: String(row.event_id),
        playbackSessionId: row.playback_session_id ?? "",
        listeningSessionId: row.listening_session_id ?? "",
        track: rowToTrack(row),
        playedDurationMs: Number(row.played_duration_ms ?? 0),
        completionRate: Number(row.completion_rate ?? 0),
        completed: Boolean(row.completed),
        skipped: Boolean(row.skipped),
        loopCount: Number(row.loop_count ?? 0),
        hasSeekBackward: Boolean(row.has_seek_backward),
        ...(row.context ? { context: row.context } : {}),
        listenedAt: iso(row.event_at),
      }));

      return reply.send({
        items,
        nextCursor: rows.length > limit && last ? encodeCursor(iso(last.event_at), String(last.event_id)) : null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/users/:id/history", async (request, reply) => {
    try {
      requireUserId(request);
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, unknown>;
      const limit = Math.min(100, Math.max(1, int(query.limit, 30)));
      const rows = await sql`
        select e.*, t.*, e.id as event_id, e.created_at as event_at
        from playback_events e
        join tracks t on t.id = e.track_id
        join users u on u.id = e.user_id
        where (u.id::text = ${id} or lower(u.username) = ${id.toLowerCase()}) and u.show_history = true
        order by e.created_at desc limit ${limit}
      `;
      return reply.send({
        items: rows.map((row: any) => ({
          id: String(row.event_id),
          playbackSessionId: row.playback_session_id ?? "",
          listeningSessionId: row.listening_session_id ?? "",
          track: rowToTrack(row),
          playedDurationMs: Number(row.played_duration_ms ?? 0),
          completionRate: Number(row.completion_rate ?? 0),
          completed: Boolean(row.completed),
          skipped: Boolean(row.skipped),
          loopCount: Number(row.loop_count ?? 0),
          hasSeekBackward: Boolean(row.has_seek_backward),
          listenedAt: iso(row.event_at),
        })),
        nextCursor: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/explore/popular", async (request, reply) => {
    try {
      const query = request.query as Record<string, unknown>;
      const window = asWindow(query.window);
      const limit = Math.min(100, Math.max(1, int(query.limit, 50)));

      let rows = await sql`
        select t.*, count(*) as play_count, count(distinct e.user_id) as unique_listeners
        from playback_events e join tracks t on t.id = e.track_id
        where e.created_at > now() - ${WINDOWS[window]}::interval
        group by t.id
        having count(distinct e.user_id) >= 2
        order by count(*) desc
        limit ${limit}
      `;

      if (rows.length < 5) {
        rows = await sql`
          select t.*, count(*) as play_count, count(distinct e.user_id) as unique_listeners
          from playback_events e join tracks t on t.id = e.track_id
          group by t.id
          having count(distinct e.user_id) >= 2
          order by count(*) desc
          limit ${limit}
        `;
      }

      if (rows.length < 5) {
        try {
          const hits = await search("top brasil", "track");
          for (const hit of hits) {
            if (hit.type === "track") {
              await upsertTrack(sql, hit as any);
            }
          }
          const hitIds = hits.filter((h) => h.type === "track").map((h) => h.id);
          if (hitIds.length > 0) {
            rows = await sql`
              select t.*, 1 as play_count, 1 as unique_listeners
              from tracks t
              where t.id in ${sql(hitIds)}
              limit ${limit}
            `;
          }
        } catch {
          // ignore
        }
      }

      return reply.send({
        window,
        generatedAt: new Date().toISOString(),
        items: rows.map((row: any, index: number) => ({
          rank: index + 1,
          track: rowToTrack(row),
          playCount: Number(row.play_count ?? 1),
          uniqueListeners: Number(row.unique_listeners ?? 1),
          score: Number(row.play_count ?? 1),
        })),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/explore/popular/albums", async (request, reply) => {
    try {
      const query = request.query as Record<string, unknown>;
      const window = asWindow(query.window);
      const limit = Math.min(50, Math.max(1, int(query.limit, 20)));

      let rows = await sql`
        select t.album,
               coalesce(t.album->>'artist', (t.artists->0->>'name'), '') as artist,
               coalesce(t.album->>'coverUrl', t.cover->>'url', null) as cover_url,
               count(*) as play_count, count(distinct e.user_id) as unique_listeners
        from playback_events e join tracks t on t.id = e.track_id
        where e.created_at > now() - ${WINDOWS[window]}::interval and t.album is not null
        group by t.album, t.artists, t.cover
        having count(distinct e.user_id) >= 2
        order by count(*) desc
        limit ${limit}
      `;

      if (rows.length < 3) {
        rows = await sql`
          select t.album,
                 coalesce(t.album->>'artist', (t.artists->0->>'name'), '') as artist,
                 coalesce(t.album->>'coverUrl', t.cover->>'url', null) as cover_url,
                 count(*) as play_count, count(distinct e.user_id) as unique_listeners
          from playback_events e join tracks t on t.id = e.track_id
          where t.album is not null
          group by t.album, t.artists, t.cover
          having count(distinct e.user_id) >= 2
          order by count(*) desc
          limit ${limit}
        `;
      }

      if (rows.length < 3) {
        try {
          const hits = await search("top brasil", "album");
          return reply.send({
            window,
            items: hits.slice(0, limit).map((hit: any) => ({
              id: String(hit.id ?? ""),
              title: String(hit.title ?? ""),
              artist: Array.isArray(hit.artists) ? hit.artists.map((a: any) => a.name).join(", ") : "",
              coverUrl: hit.cover?.url ?? null,
              playCount: 1,
              uniqueListeners: 1,
              trackCount: 10,
              score: 1,
            })),
          });
        } catch {
          // ignore
        }
      }

      return reply.send({
        window,
        items: rows.map((row: any) => {
          const album = row.album ?? {};
          return {
            id: String(album.id ?? ""),
            title: String(album.title ?? ""),
            artist: String(row.artist || ""),
            coverUrl: typeof row.cover_url === "string" ? row.cover_url : null,
            playCount: Number(row.play_count ?? 1),
            uniqueListeners: Number(row.unique_listeners ?? 1),
            trackCount: 10,
            score: Number(row.play_count ?? 1),
          };
        }),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/explore/most-saved", async (request, reply) => {
    try {
      const query = request.query as Record<string, unknown>;
      const type = str(query.type, "all");
      const limit = Math.min(50, Math.max(1, int(query.limit, 20)));
      const rows = await sql`
        select kind, item_id, snapshot, count(*) as saves
        from collections
        where (${type} = 'all' or kind = ${type === "album" ? "albums" : type === "playlist" ? "playlists" : type})
        group by kind, item_id, snapshot
        having count(distinct user_id) >= 2
        order by count(*) desc
        limit ${limit}
      `;
      return reply.send({
        type: type === "album" || type === "playlist" ? type : "all",
        items: rows.map((row: any) => {
          const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
          const kind = String(row.kind);
          return {
            type: kind === "albums" ? "album" : "playlist",
            id: String(row.item_id),
            title: String(snapshot.title ?? snapshot.name ?? ""),
            subtitle: String(snapshot.author ?? snapshot.subtitle ?? ""),
            coverUrl: typeof snapshot.coverUrl === "string" ? snapshot.coverUrl : null,
            saves: Number(row.saves ?? 0),
          };
        }),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/leaderboards/global", async (request, reply) => {
    try {
      const query = request.query as Record<string, unknown>;
      const period = asPeriod(query.period);
      const limit = Math.min(100, Math.max(1, int(query.limit, 50)));
      const rows = await sql`
        select u.id, u.username, u.display_name, u.avatar_url,
               sum(e.played_duration_ms) as played, count(*) as plays
        from playback_events e join users u on u.id = e.user_id
        where e.created_at > now() - ${periodInterval(period)}::interval
          and u.participate_leaderboards = true
        group by u.id
        order by sum(e.played_duration_ms) desc
        limit ${limit}
      `;
      return reply.send({
        type: "global",
        targetId: "global",
        period,
        entries: rows.map((row: any, index: number) => ({
          rank: index + 1,
          user: {
            id: String(row.id),
            username: row.username ?? null,
            displayName: row.display_name ?? null,
            avatarUrl: row.avatar_url ?? null,
          },
          playedDurationMs: Number(row.played ?? 0),
          playCount: Number(row.plays ?? 0),
        })),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/leaderboards/artist/:id", async (request, reply) => {
    try {
      requireUserId(request);
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, unknown>;
      const period = asPeriod(query.period);
      const limit = Math.min(100, Math.max(1, int(query.limit, 50)));
      const rows = await sql`
        select u.id, u.username, u.display_name, u.avatar_url,
               sum(e.played_duration_ms) as played, count(*) as plays
        from playback_events e
        join users u on u.id = e.user_id
        join tracks t on t.id = e.track_id
        where e.created_at > now() - ${periodInterval(period)}::interval
          and u.participate_leaderboards = true
          and exists (
            select 1 from jsonb_array_elements(t.artists) artist
            where artist->>'id' = ${id}
          )
        group by u.id
        order by sum(e.played_duration_ms) desc
        limit ${limit}
      `;
      return reply.send({
        type: "artist",
        targetId: id,
        period,
        entries: rows.map((row: any, index: number) => ({
          rank: index + 1,
          user: {
            id: String(row.id),
            username: row.username ?? null,
            displayName: row.display_name ?? null,
            avatarUrl: row.avatar_url ?? null,
          },
          playedDurationMs: Number(row.played ?? 0),
          playCount: Number(row.plays ?? 0),
        })),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
