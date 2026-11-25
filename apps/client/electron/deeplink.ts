// liner:// deeplink parsing, shared by main process (no electron imports here
// so vitest can cover it). same strict allowlist as the link server: fixed
// entity types, opaque catalog tokens only.
export const DEEP_LINK_SCHEME = "offy";
export const DEEP_LINK_SCHEMES = new Set(["offy", "liner"]);

const DEEP_LINK_IDS: Record<string, RegExp> = {
  // Artist navigation also supports display-name fallbacks when a track has no
  // channel id. Keep those bounded and free of control characters; the value
  // is always re-encoded before it is placed in the renderer route.
  artist:
    /^(?:UC[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{1,22}|(?=.*[^A-Za-z0-9_-])[^\p{Cc}/\\]{1,160})(?![\s\S])/u,
  // innertube album browse ids (MPRE...) or SoundCloud catalog ids (sc:.../sc_...)
  album: /^(?:MPRE[A-Za-z0-9_-]{4,64}|sc[:_][A-Za-z0-9:_-]{1,64})$/i,
  // catalog playlists (VLPL…/PL…), user playlists (uuid / pl-…), SoundCloud (sc:.../sc_...), or Spotify (spotify:...)
  playlist: /^(?:[A-Za-z0-9_-]{8,64}|(?:sc[:_]|spotify:)[A-Za-z0-9:_-]{1,64})$/i,
  // youtube video ids (11 base64url chars) or SoundCloud catalog ids (sc:.../sc_...)
  track: /^(?:[A-Za-z0-9_-]{11}|sc[:_][A-Za-z0-9:_-]{1,64})$/i,
  // jam session 6-char code
  jam: /^[A-Za-z0-9]{6}$/,
};

export interface DeeplinkTarget {
  type: "artist" | "album" | "playlist" | "track" | "jam";
  id: string;
}

export function parseDeeplink(raw: string): DeeplinkTarget | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!DEEP_LINK_SCHEMES.has(url.protocol.replace(/:$/, ""))) return null;
  const type = url.hostname.toLowerCase();
  const pattern = DEEP_LINK_IDS[type];
  if (!pattern) return null;

  let id = "";
  const ids = url.searchParams.getAll("id");
  if (ids.length === 1 && ids[0]) {
    id = ids[0];
  } else if (url.pathname && url.pathname.length > 1) {
    id = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  }

  if (!id || !pattern.test(id)) return null;
  return {
    type: type as DeeplinkTarget["type"],
    id: type === "jam" ? id.toUpperCase() : id,
  };
}

export function findDeeplinkArg(argv: string[]): string | undefined {
  return argv.find(
    (arg) => arg.startsWith("offy://") || arg.startsWith("liner://"),
  );
}
