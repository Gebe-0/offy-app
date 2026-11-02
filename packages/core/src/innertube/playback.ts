import type { AudioFormat, PlaybackStream } from "./formats.js";
import { postInnertube } from "./client.js";
import {
  extractAudioFormats,
  playabilityError,
  requiresBotCheck,
  selectBestAudioFormat,
  toPlaybackStream,
} from "./formats.js";
import { metaFromPlayerResponse, type VideoMeta } from "./meta.js";
import { PLAYBACK_PROFILES, type InnertubeProfile } from "./profiles.js";
import { resetVisitorData } from "./visitor.js";

const PROBE_OFFSET = 1_048_576 + 4096;
const PROBE_TIMEOUT_MS = 6000;
const CACHE_MAX_MS = 3 * 60 * 60 * 1000;
const COOLDOWN_MS = 5 * 60 * 1000;
const COOLDOWN_FAILURES = 3;

interface CacheEntry {
  stream: PlaybackStream;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const failures = new Map<string, number>();
const cooldownUntil = new Map<string, number>();
let lastWorkingProfile: InnertubeProfile | null = null;

export function resetPlaybackState(): void {
  cache.clear();
  failures.clear();
  cooldownUntil.clear();
  lastWorkingProfile = null;
}

async function fetchPlayer(videoId: string, profile: InnertubeProfile, signal?: AbortSignal): Promise<unknown> {
  return postInnertube(
    profile,
    "player",
    { videoId, contentCheckOk: true, racyCheckOk: true },
    { signal },
  );
}

async function reachable(url: string): Promise<boolean> {
  try {
    const probe = new URL(url);
    probe.searchParams.set("range", `${PROBE_OFFSET}-${PROBE_OFFSET}`);
    const res = await fetch(probe, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    await res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  }
}

function orderProfiles(profiles: readonly InnertubeProfile[]): readonly InnertubeProfile[] {
  if (!lastWorkingProfile) return profiles;
  return [lastWorkingProfile, ...profiles.filter((profile) => profile !== lastWorkingProfile)];
}

function isCoolingDown(profile: InnertubeProfile): boolean {
  const until = cooldownUntil.get(profile.name) ?? 0;
  return until > Date.now();
}

function noteFailure(profile: InnertubeProfile): void {
  const next = (failures.get(profile.name) ?? 0) + 1;
  failures.set(profile.name, next);
  if (next >= COOLDOWN_FAILURES) {
    cooldownUntil.set(profile.name, Date.now() + COOLDOWN_MS);
    failures.set(profile.name, 0);
  }
}

function noteSuccess(profile: InnertubeProfile): void {
  failures.set(profile.name, 0);
  cooldownUntil.delete(profile.name);
  lastWorkingProfile = profile;
}

function remember(videoId: string, stream: PlaybackStream): void {
  const expires = stream.expiresAt ? Date.parse(stream.expiresAt) : 0;
  const ttl = expires > Date.now() ? Math.max(60_000, expires - Date.now() - 150_000) : CACHE_MAX_MS;
  cache.set(videoId, { stream, expiresAt: Date.now() + Math.min(ttl, CACHE_MAX_MS) });
}

async function resolveWithProfile(
  videoId: string,
  profile: InnertubeProfile,
  signal?: AbortSignal,
): Promise<PlaybackStream> {
  let response = await fetchPlayer(videoId, profile, signal);
  if (requiresBotCheck(response)) {
    resetVisitorData();
    response = await fetchPlayer(videoId, profile, signal);
  }

  const error = playabilityError(response);
  if (error) throw new Error(`${profile.name}: ${error}`);

  const best = selectBestAudioFormat(extractAudioFormats(response));
  if (!best) throw new Error(`${profile.name}: no audio formats`);

  const stream = toPlaybackStream(best);
  if (!(await reachable(stream.url))) throw new Error(`${profile.name}: stream url dead`);
  return stream;
}

const inflight = new Map<string, Promise<PlaybackStream>>();

export async function resolveStream(videoId: string, signal?: AbortSignal): Promise<PlaybackStream> {
  const cached = cache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.stream;

  const running = inflight.get(videoId);
  if (running) return running;

  const task = (async () => {
    const problems: string[] = [];

    for (const profile of orderProfiles(PLAYBACK_PROFILES)) {
      if (isCoolingDown(profile)) {
        problems.push(`${profile.name}: cooling down`);
        continue;
      }
      try {
        const stream = await resolveWithProfile(videoId, profile, signal);
        noteSuccess(profile);
        remember(videoId, stream);
        return stream;
      } catch (error) {
        if (signal?.aborted) throw error;
        noteFailure(profile);
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(`resolve failed (${problems.join("; ")})`);
  })().finally(() => inflight.delete(videoId));

  inflight.set(videoId, task);
  return task;
}

export async function fetchVideoMeta(videoId: string, signal?: AbortSignal): Promise<VideoMeta | null> {
  const order = orderProfiles(PLAYBACK_PROFILES);
  for (const profile of order) {
    try {
      const response = await fetchPlayer(videoId, profile, signal);
      const meta = metaFromPlayerResponse(response);
      if (meta) return meta;
    } catch {
      /* tenta o próximo perfil */
    }
  }
  return null;
}
