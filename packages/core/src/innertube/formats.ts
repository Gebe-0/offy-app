export interface PlaybackStream {
  url: string;
  mimeType: string;
  codec: "opus" | "aac";
  bitrate: number;
  itag: number;
  expiresAt: string | null;
  contentLength?: number;
}
import { asArray, asRecord, num, str } from "../json.js";

export interface AudioFormat {
  itag: number;
  url: string;
  mimeType: string;
  bitrate: number;
  contentLength?: number;
}

const PREFERRED_ITAGS = [251, 140, 250, 249, 139];

export function extractAudioFormats(playerResponse: unknown): AudioFormat[] {
  const streaming = asRecord(asRecord(playerResponse)?.streamingData);
  return asArray(streaming?.adaptiveFormats)
    .map((raw) => {
      const format = asRecord(raw);
      if (!format) return null;
      const itag = num(format.itag);
      const url = str(format.url);
      const mimeType = str(format.mimeType);
      if (itag === undefined || !url || !mimeType || !mimeType.startsWith("audio/")) return null;
      const contentLength = num(format.contentLength);
      return {
        itag,
        url,
        mimeType,
        bitrate: num(format.bitrate) ?? num(format.averageBitrate) ?? 0,
        ...(contentLength && contentLength > 0 ? { contentLength } : {}),
      };
    })
    .filter((format): format is AudioFormat => Boolean(format));
}

export function selectBestAudioFormat(formats: AudioFormat[]): AudioFormat | null {
  for (const itag of PREFERRED_ITAGS) {
    const match = formats.find((format) => format.itag === itag);
    if (match) return match;
  }
  return [...formats].sort((a, b) => b.bitrate - a.bitrate)[0] ?? null;
}

function expiryFromUrl(url: string): string | null {
  try {
    const expire = Number(new URL(url).searchParams.get("expire"));
    return Number.isFinite(expire) && expire > 0 ? new Date(expire * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

export function toPlaybackStream(format: AudioFormat): PlaybackStream {
  const isOpus = format.mimeType.includes("opus") || format.mimeType.includes("webm");
  return {
    url: format.url,
    mimeType: format.mimeType.split(";")[0]?.trim() || "audio/webm",
    codec: isOpus ? "opus" : "aac",
    bitrate: format.bitrate || 160_000,
    itag: format.itag,
    expiresAt: expiryFromUrl(format.url),
    ...(format.contentLength ? { contentLength: format.contentLength } : {}),
  };
}

export function requiresBotCheck(playerResponse: unknown): boolean {
  return asRecord(asRecord(playerResponse)?.playabilityStatus)?.status === "LOGIN_REQUIRED";
}

export function playabilityError(playerResponse: unknown): string | null {
  const status = asRecord(asRecord(playerResponse)?.playabilityStatus);
  if (!status || status.status === "OK") return null;
  return str(status.reason) ?? `playability ${String(status.status)}`;
}
