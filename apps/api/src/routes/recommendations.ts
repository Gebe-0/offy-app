import type { FastifyInstance } from "fastify";
import type { DailyMixItem, DailyMixesResponse } from "@offy/contracts";
import { sql } from "../db.js";
import { requireUserId, sendError } from "../http.js";
import { rowToTrack } from "../tracks.js";

/**
 * Mixes diários: agrupa o histórico do usuário por artista principal,
 * preenche com o que ele mais ouviu e devolve 3 blocos estáveis por dia.
 */
export async function registerRecommendationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/me/recommendations/daily-mixes", async (request, reply) => {
    try {
      const userId = requireUserId(request);

      const rows = await sql`
        select t.*, count(*) as plays, max(e.created_at) as last_at
        from playback_events e join tracks t on t.id = e.track_id
        where e.user_id = ${userId}
        group by t.id
        order by count(*) desc
        limit 200
      `;

      if (rows.length === 0) {
        return reply.send({ items: [], generatedAt: new Date().toISOString() });
      }

      const byArtist = new Map<string, { tracks: any[]; plays: number }>();
      for (const row of rows as any[]) {
        const track = rowToTrack(row);
        const key = track.artists[0]?.name ?? "OFFY Mix";
        const bucket = byArtist.get(key) ?? { tracks: [], plays: 0 };
        bucket.tracks.push(track);
        bucket.plays += Number(row.plays ?? 0);
        byArtist.set(key, bucket);
      }

      const ranked = [...byArtist.entries()].sort((a, b) => b[1].plays - a[1].plays).slice(0, 3);
      const day = new Date().toISOString().slice(0, 10);

      const items: DailyMixItem[] = ranked.map(([artist, bucket], index) => ({
        id: `${day}-${index + 1}`,
        title: `Mix ${index + 1}`,
        description: `Baseado em ${artist}`,
        clusterArtists: [artist],
        trackCount: bucket.tracks.length,
        tracks: bucket.tracks.slice(0, 50),
      }));

      const payload: DailyMixesResponse = { items, generatedAt: new Date().toISOString() };
      return reply.send(payload);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
