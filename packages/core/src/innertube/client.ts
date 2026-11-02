import type { InnertubeProfile } from "./profiles.js";
import { getVisitorData } from "./visitor.js";

export type InnertubeEndpoint = "search" | "browse" | "next" | "player" | "guide";

export class InnertubeError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "InnertubeError";
  }
}

export interface InnertubeOptions {
  signal?: AbortSignal;
  visitorData?: string;
}

export async function postInnertube(
  profile: InnertubeProfile,
  endpoint: InnertubeEndpoint,
  body: Record<string, unknown>,
  options: InnertubeOptions = {},
): Promise<unknown> {
  const visitorData = options.visitorData ?? (await getVisitorData(options.signal).catch(() => ""));
  const url = `${profile.origin}/youtubei/v1/${endpoint}?prettyPrint=false`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "x-youtube-client-name": profile.clientId,
    "x-youtube-client-version": profile.clientVersion,
    "x-origin": profile.origin,
  };
  if (visitorData) headers["x-goog-visitor-id"] = visitorData;
  if (profile.userAgent) headers["user-agent"] = profile.userAgent;

  const payload = {
    ...body,
    context: {
      client: {
        clientName: profile.clientName,
        clientVersion: profile.clientVersion,
        hl: "en",
        gl: "US",
        ...(visitorData ? { visitorData } : {}),
        ...profile.context,
      },
      user: { lockedSafetyMode: false },
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new InnertubeError(`${profile.name} unreachable`, 0);
  }

  if (!response.ok) {
    throw new InnertubeError(`${profile.name} ${endpoint} HTTP ${response.status}`, response.status);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new InnertubeError(`${profile.name} ${endpoint} invalid JSON`, 502);
  }
}
