import type { FastifyInstance } from "fastify";
import type { LyricsCandidate, LyricsStreamEvent } from "@offy/contracts";
import { runLyricsChain } from "@offy/core";
import { sql } from "../db.js";
import { ApiError, int, requireUserId, sendError, str } from "../http.js";
import { rowToTrack } from "../tracks.js";

interface CachePayload {
  best: LyricsCandidate;
  found: LyricsCandidate[];
}

const CACHE_TTL_DAYS = 7;

async function trackHint(trackId: string): Promise<{ title: string; artist: string; durationMs?: number } | null> {
  const rows = await sql`select * from tracks where id = ${trackId} limit 1`;
  if (!rows[0]) return null;
  const track = rowToTrack(rows[0]);
  return {
    title: track.title,
    artist: track.artists[0]?.name ?? "Unknown Artist",
    durationMs: track.durationMs,
  };
}

async function readCache(trackId: string): Promise<CachePayload | null> {
  const rows = await sql`
    select payload from lyrics_cache
    where track_id = ${trackId}
      and checked_at > now() - ${`${CACHE_TTL_DAYS} days`}::interval
    limit 1
  `;
  if (!rows[0]) return null;
  const payload = rows[0].payload as CachePayload;
  return payload?.best ? payload : null;
}

async function writeCache(trackId: string, payload: CachePayload): Promise<void> {
  await sql`
    insert into lyrics_cache (track_id, provider, sync_level, payload)
    values (${trackId}, ${payload.best.provider}, ${payload.best.syncLevel}, ${sql.json(payload as any)})
    on conflict (track_id) do update set
      provider = excluded.provider,
      sync_level = excluded.sync_level,
      payload = excluded.payload,
      checked_at = now()
  `;
}

export async function registerLyricsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/me/lyrics/search", async (request, reply) => {
    try {
      requireUserId(request);
      const query = request.query as Record<string, unknown>;
      const title = str(query.title).trim();
      if (!title) throw new ApiError(400, "TITLE_REQUIRED", "TITLE_REQUIRED");

      const { best } = await runLyricsChain({
        title,
        artist: str(query.artist).trim() || "Unknown Artist",
        durationMs: query.durationMs ? int(query.durationMs, 0) : undefined,
        videoId: str(query.videoId).trim() || undefined,
      });

      if (!best) return reply.send(null);
      return reply.send({ provider: best.provider, cached: false, candidate: best });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/tracks/:id/lyrics", async (request, reply) => {
    try {
      requireUserId(request);
      const { id: trackId } = request.params as { id: string };
      const query = request.query as Record<string, unknown>;

      const hint = await trackHint(trackId);
      const title = str(query.title).trim() || hint?.title || "";
      const artist = str(query.artist).trim() || hint?.artist || "Unknown Artist";
      const durationMs = query.durationMs ? int(query.durationMs, 0) : hint?.durationMs;
      if (!title) throw new ApiError(404, "TRACK_NOT_FOUND", "TRACK_NOT_FOUND");

      const cached = await readCache(trackId);
      if (cached) {
        return reply.send({ provider: cached.best.provider, cached: true, candidate: cached.best });
      }

      const found: LyricsCandidate[] = [];

      const result = await runLyricsChain(
        { title, artist, durationMs, videoId: trackId },
        {
          signal: AbortSignal.timeout(20_000),
          onFound: (candidate) => {
            found.push(candidate);
          },
        },
      );

      const best = result.best;

      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });

      const emit = (event: LyricsStreamEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      emit({
        type: "metadata",
        track: {
          id: trackId,
          title,
          artists: [{ id: "unknown", name: artist }],
          durationMs: durationMs ?? 0,
        },
      });

      for (const candidate of found) {
        emit({
          type: "provider",
          provider: candidate.provider,
          status: "found",
          syncLevel: candidate.syncLevel,
          candidate,
        });
      }

      for (const key of result.missed) {
        if (found.some((candidate) => candidate.provider === key)) continue;
        emit({ type: "provider", provider: key, status: "not_found" });
      }

      if (best) {
        emit({
          type: "done",
          cached: false,
          best: { provider: best.provider, quality: best.quality.total, syncLevel: best.syncLevel },
        });
      } else {
        emit({ type: "done", cached: false, status: "not_found" });
      }

      reply.raw.end();

      if (best) {
        await writeCache(trackId, { best, found }).catch(() => undefined);
      }
      return reply;
    } catch (error) {
      if (reply.raw.headersSent) {
        reply.raw.end();
        return reply;
      }
      return sendError(reply, error);
    }
  });
}

