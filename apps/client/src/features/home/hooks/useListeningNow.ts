import { useMemo } from "react";
import { api, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";
import { freshFor, useCachedResource } from "@/shared/cache/useCachedResource";

const LISTENING_NOW_LIMIT = 10;
const LISTENING_NOW_POLICY = {
  isFresh: freshFor(5 * 60_000),
  maxAgeMs: 24 * 60 * 60_000,
};

const sessionRank = new Map<string, number>();

function rankOf(id: string): number {
  let rank = sessionRank.get(id);
  if (rank === undefined) {
    rank = Math.random();
    sessionRank.set(id, rank);
  }
  return rank;
}

export function useListeningNow() {
  const { data, isLoading } = useCachedResource(
    "home:user-most-played",
    async () => {
      const history = await api.getHistory(undefined, 100);
      const counts = new Map<string, { track: Track; count: number }>();
      for (const entry of history.items ?? []) {
        if (!entry.track?.id) continue;
        const existing = counts.get(entry.track.id);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(entry.track.id, {
            track: toClientTrack(entry.track),
            count: 1,
          });
        }
      }
      if (counts.size > 0) {
        return Array.from(counts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, LISTENING_NOW_LIMIT)
          .map((item) => item.track);
      }
      const popular = await api.getPopularTracks("all", LISTENING_NOW_LIMIT);
      return (popular.items ?? []).map((entry) => toClientTrack(entry.track));
    },
    LISTENING_NOW_POLICY,
  );

  const tracks = useMemo<Track[]>(
    () => (data ?? []).slice(0, LISTENING_NOW_LIMIT),
    [data],
  );

  return { tracks, isLoading };
}
