import crypto from "node:crypto";
import path from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  session,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import {
  AuthSessionStore,
  type AuthSessionStoreDeps,
  type SessionCipher,
} from "./auth-session-store.js";

export interface SpotifyUserAccount {
  id: string;
  name: string;
  email?: string;
  photoUrl?: string;
  product?: string;
}

export interface StoredSpotifySession {
  accessToken: string;
  refreshToken?: string;
  spDc?: string;
  expiresAt: number;
  account: SpotifyUserAccount;
}

const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SPOTIFY_APP_VERSION = "1.2.89.52.g96d6ec2b";

const PATHFINDER_HASHES = {
  profileAttributes:
    "08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0",
  accountAttributes:
    "be4ce359daee01463ddb8e77536220e108e3d28105e12199f244d7a5954e9d14",
  libraryV3:
    "390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455",
  fetchPlaylistContents:
    "21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf",
  fetchLibraryTracks:
    "087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240",
} as const;

let cachedTotpSecret: { secret: string; version: number } = {
  secret: ',7/*F("rLJ2oxaKL^f+E1xvP@N',
  version: 61,
};
let lastTotpSecretRefreshAt = 0;

function generateSpotifyTotp(
  secretStr: string,
  timestampSeconds: number,
): string {
  const transformed = Array.from(Buffer.from(secretStr, "utf8")).map(
    (byte, index) => byte ^ ((index % 33) + 9),
  );
  const joined = transformed.map((num) => num.toString(10)).join("");
  const key = Buffer.from(joined, "utf8");

  const counter = BigInt(Math.floor(timestampSeconds / 30));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter, 0);

  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % 1_000_000).toString(10).padStart(6, "0");
}

async function refreshSpotifyTotpSecret(): Promise<void> {
  if (Date.now() - lastTotpSecretRefreshAt < 5 * 60_000) return;
  lastTotpSecretRefreshAt = Date.now();
  try {
    const htmlRes = await fetch("https://open.spotify.com/", {
      headers: { "User-Agent": CHROME_USER_AGENT },
    });
    if (!htmlRes.ok) return;
    const html = await htmlRes.text();
    const scriptUrls =
      html.match(
        /https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[a-f0-9]+\.js/g,
      ) || [];
    for (const url of scriptUrls) {
      const jsRes = await fetch(url, {
        headers: { "User-Agent": CHROME_USER_AGENT },
      });
      if (!jsRes.ok) continue;
      const js = await jsRes.text();
      const matches = [
        ...js.matchAll(
          /secret\s*:\s*(['"])((?:\\.|(?!\1).)+)\1\s*,\s*version\s*:\s*(\d+)/g,
        ),
      ];
      if (matches.length > 0) {
        let best = cachedTotpSecret;
        for (const m of matches) {
          const ver = Number(m[3]);
          const rawSecret = m[2].replace(/\\(['"\\])/g, "$1");
          if (ver >= best.version && rawSecret.length >= 10) {
            best = { secret: rawSecret, version: ver };
          }
        }
        cachedTotpSecret = best;
        return;
      }
    }
  } catch (err) {
    console.warn("[spotify] refreshSpotifyTotpSecret failed:", err);
  }
}

function isAppUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("file:")) return true;
  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (!devServer) return false;
  try {
    return new URL(url).origin === new URL(devServer).origin;
  } catch {
    return false;
  }
}

function fromApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return isAppUrl(event.senderFrame?.url);
}

export function extractSpDc(raw: string): string | null {
  if (!raw) return null;
  let str = raw.trim();
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1).trim();
  }
  const match = str.match(/(?:^|;\s*|\b)sp_dc=([^;\s]+)/);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  if (str.length >= 20 && !str.includes(" ") && !str.includes(";")) {
    return str;
  }
  return null;
}

export function registerSpotifyIpc(): {
  getValidToken: () => Promise<string | null>;
  getSession: () => StoredSpotifySession | null;
} {
  const cipher: SessionCipher = {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(data),
  };

  const deps: AuthSessionStoreDeps = {
    fetch: (url, init) => fetch(url, init),
    syncClock: () => {},
  };

  const store = new AuthSessionStore(
    path.join(app.getPath("userData"), "auth", "spotify-session.json"),
    cipher,
    deps,
  );

  let activeLoginWindow: BrowserWindow | null = null;
  const spSession = session.fromPartition("persist:spotify");

  // Set modern Chrome user agent to allow Google / Social auth
  spSession.setUserAgent(CHROME_USER_AGENT);

  let capturedBearerToken: string | null = null;

  // Intercept Bearer tokens sent to Spotify APIs by the official Web Player client
  spSession.webRequest.onSendHeaders(
    { urls: ["*://*.spotify.com/*"] },
    (details) => {
      const auth =
        details.requestHeaders["Authorization"] ||
        details.requestHeaders["authorization"] ||
        details.requestHeaders["AUTHORIZATION"];
      if (auth && typeof auth === "string" && auth.startsWith("Bearer ")) {
        const token = auth.slice(7).trim();
        if (token && token.length > 20) {
          capturedBearerToken = token;
        }
      }
    },
  );

  // Persist sp_dc cookie into Chromium cookie store with 10-year expiration
  async function persistSpDcCookie(spDc: string): Promise<void> {
    if (!spDc) return;
    const farFuture = Math.floor(Date.now() / 1000) + 3600 * 24 * 365 * 10;
    try {
      await spSession.cookies.set({
        url: "https://open.spotify.com",
        name: "sp_dc",
        value: spDc,
        domain: ".spotify.com",
        path: "/",
        secure: true,
        httpOnly: true,
        expirationDate: farFuture,
        sameSite: "no_restriction",
      });
    } catch (err) {
      console.warn("[spotify] failed to persist sp_dc cookie:", err);
    }
  }

  function commitSpotifySession(sessionData: StoredSpotifySession): void {
    const safeSession: StoredSpotifySession = {
      ...sessionData,
      accessToken: sessionData.accessToken || "spotify-persisted-token",
      refreshToken:
        sessionData.spDc ||
        sessionData.refreshToken ||
        "spotify-persisted-spdc",
      spDc: sessionData.spDc || sessionData.refreshToken,
    };
    store.set(safeSession as unknown as Record<string, unknown>);
    if (safeSession.spDc) {
      void persistSpDcCookie(safeSession.spDc);
    }
  }

  // Headless background window to catch official Bearer token if API token extraction fails
  async function refreshBearerViaHeadlessWeb(): Promise<string | null> {
    if (activeLoginWindow && !activeLoginWindow.isDestroyed()) return null;

    return new Promise((resolve) => {
      let resolved = false;
      const cleanup = (token: string | null) => {
        if (resolved) return;
        resolved = true;
        if (!bgWindow.isDestroyed()) {
          bgWindow.destroy();
        }
        resolve(token);
      };

      const timeout = setTimeout(() => {
        cleanup(capturedBearerToken);
      }, 12_000);

      const bgWindow = new BrowserWindow({
        show: false,
        width: 300,
        height: 300,
        webPreferences: {
          partition: "persist:spotify",
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      bgWindow.webContents.setUserAgent(CHROME_USER_AGENT);

      const checkInterval = setInterval(() => {
        if (capturedBearerToken && capturedBearerToken.startsWith("BQ")) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          cleanup(capturedBearerToken);
        }
      }, 400);

      bgWindow.webContents.on("did-fail-load", () => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        cleanup(capturedBearerToken);
      });

      bgWindow.loadURL("https://open.spotify.com/").catch(() => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        cleanup(capturedBearerToken);
      });
    });
  }

  async function resurrectSessionFromCookies(): Promise<StoredSpotifySession | null> {
    try {
      const cookies = await spSession.cookies.get({ name: "sp_dc" });
      const cookieSpDc = cookies[0]?.value;
      if (!cookieSpDc) return null;

      console.log("[spotify] resurrecting session from persistent cookie jar...");
      const tokenData = await fetchTokenWithSpDc(cookieSpDc);
      const token = tokenData?.accessToken || capturedBearerToken;
      if (token) {
        const profile = await fetchSpotifyUserProfile(token);
        const resurrected: StoredSpotifySession = {
          accessToken: token,
          refreshToken: cookieSpDc,
          spDc: cookieSpDc,
          expiresAt: tokenData?.expiresAt ?? Date.now() + 3600_000,
          account: {
            id: profile.id || "spotify-user",
            name: profile.name || "Spotify",
            email: undefined,
            photoUrl: profile.photoUrl,
            product: profile.product || "free",
          },
        };
        commitSpotifySession(resurrected);
        return resurrected;
      }
    } catch (err) {
      console.warn("[spotify] resurrectSessionFromCookies failed:", err);
    }
    return null;
  }

  // Sync sp_dc cookie to partition cookie store if available or resurrect from cookies
  const initialSession = store.get() as unknown as StoredSpotifySession | null;
  if (initialSession?.spDc) {
    void persistSpDcCookie(initialSession.spDc);
  } else {
    void resurrectSessionFromCookies();
  }

  async function requestTokenFromApi(
    spDc: string,
    totpConfig: { secret: string; version: number },
  ): Promise<{ accessToken: string; expiresAt: number } | null> {
    let serverTimeSeconds = Math.floor(Date.now() / 1000);
    try {
      const stRes = await fetch("https://open.spotify.com/api/server-time", {
        headers: { "User-Agent": CHROME_USER_AGENT },
      });
      if (stRes.ok) {
        const stJson = (await stRes.json()) as { serverTime?: number };
        if (typeof stJson.serverTime === "number" && stJson.serverTime > 0) {
          serverTimeSeconds = stJson.serverTime;
        }
      }
    } catch {
      // fallback to local clock
    }

    const clientSeconds = Math.floor(Date.now() / 1000);
    const totp = generateSpotifyTotp(totpConfig.secret, clientSeconds);
    const totpServer = generateSpotifyTotp(
      totpConfig.secret,
      serverTimeSeconds,
    );

    const tokenUrl = `https://open.spotify.com/api/token?reason=init&productType=web-player&totp=${encodeURIComponent(totp)}&totpServer=${encodeURIComponent(totpServer)}&totpVer=${totpConfig.version}`;
    const res = await fetch(tokenUrl, {
      headers: {
        "User-Agent": CHROME_USER_AGENT,
        Accept: "application/json",
        Referer: "https://open.spotify.com/",
        Cookie: `sp_dc=${spDc}`,
      },
    });
    if (!res.ok) {
      console.warn("[spotify] /api/token HTTP status:", res.status);
      return null;
    }
    const data = (await res.json()) as any;
    if (data?.accessToken && !data.isAnonymous) {
      const expiresAt =
        Number(data.accessTokenExpirationTimestampMs) || Date.now() + 3600_000;
      return {
        accessToken: String(data.accessToken),
        expiresAt,
      };
    }
    return null;
  }

  async function fetchTokenWithSpDc(
    spDc: string,
  ): Promise<{ accessToken: string; expiresAt: number } | null> {
    if (!spDc) return null;
    try {
      const firstAttempt = await requestTokenFromApi(spDc, cachedTotpSecret);
      if (firstAttempt) return firstAttempt;

      await refreshSpotifyTotpSecret();
      const secondAttempt = await requestTokenFromApi(spDc, cachedTotpSecret);
      if (secondAttempt) return secondAttempt;

      // Resilient fallback for long idle periods: silent official web player token extraction
      const headlessToken = await refreshBearerViaHeadlessWeb();
      if (headlessToken) {
        return {
          accessToken: headlessToken,
          expiresAt: Date.now() + 3600_000,
        };
      }
      return null;
    } catch (err) {
      console.error("[spotify] fetchTokenWithSpDc failed:", err);
      return null;
    }
  }

  async function queryPathfinder(
    token: string,
    operationName: string,
    sha256Hash: string,
    variables: Record<string, unknown> = {},
  ): Promise<{ status: number; data: any }> {
    const params = new URLSearchParams({
      operationName,
      variables: JSON.stringify(variables),
      extensions: JSON.stringify({
        persistedQuery: { version: 1, sha256Hash },
      }),
    });
    const url = `https://api-partner.spotify.com/pathfinder/v1/query?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": CHROME_USER_AGENT,
        "app-platform": "WebPlayer",
        "spotify-app-version": SPOTIFY_APP_VERSION,
      },
    });
    if (!res.ok) {
      return { status: res.status, data: null };
    }
    const json = await res.json();
    return { status: 200, data: json };
  }

  async function fetchSpotifyUserProfile(
    token: string,
  ): Promise<Partial<SpotifyUserAccount>> {
    const result: Partial<SpotifyUserAccount> = {};
    try {
      const [profileRes, accountRes] = await Promise.all([
        queryPathfinder(
          token,
          "profileAttributes",
          PATHFINDER_HASHES.profileAttributes,
          {},
        ),
        queryPathfinder(
          token,
          "accountAttributes",
          PATHFINDER_HASHES.accountAttributes,
          {},
        ),
      ]);

      const profile = profileRes.data?.data?.me?.profile;
      if (profile) {
        if (typeof profile.username === "string" && profile.username) {
          result.id = profile.username;
        } else if (typeof profile.uri === "string" && profile.uri) {
          result.id = profile.uri.split(":").pop();
        }
        if (typeof profile.name === "string" && profile.name) {
          result.name = profile.name;
        }
        const sources = profile.avatar?.sources;
        if (Array.isArray(sources) && sources.length > 0) {
          const best = sources[sources.length - 1]?.url || sources[0]?.url;
          if (typeof best === "string" && best) {
            result.photoUrl = best;
          }
        }
      }

      const product = accountRes.data?.data?.me?.account?.product;
      if (typeof product === "string" && product) {
        result.product = product.toLowerCase();
      }
    } catch (err) {
      console.warn("[spotify] fetchSpotifyUserProfile failed:", err);
    }
    return result;
  }

  let inFlightTokenRefresh: Promise<string | null> | null = null;

  async function getValidToken(forceRefresh = false): Promise<string | null> {
    if (inFlightTokenRefresh) {
      return inFlightTokenRefresh;
    }
    const promise = getValidTokenInternal(forceRefresh);
    inFlightTokenRefresh = promise.finally(() => {
      inFlightTokenRefresh = null;
    });
    return promise;
  }

  async function getValidTokenInternal(
    forceRefresh = false,
  ): Promise<string | null> {
    const current =
      (store.get() as unknown as StoredSpotifySession | null) ??
      (await resurrectSessionFromCookies());
    if (!current) return null;

    const expiresAt = Number(current.expiresAt) || 0;
    if (
      !forceRefresh &&
      current.accessToken &&
      current.accessToken.startsWith("BQ") &&
      Date.now() < expiresAt - 60_000
    ) {
      return String(current.accessToken);
    }

    let spDc = current.spDc || current.refreshToken;
    if (!spDc) {
      try {
        const cookies = await spSession.cookies.get({});
        const found = cookies.find((c) => c.name === "sp_dc")?.value;
        if (found) spDc = found;
      } catch {
        // ignore
      }
    }

    if (spDc) {
      const tokenData = await fetchTokenWithSpDc(spDc);
      if (tokenData?.accessToken) {
        const updated: StoredSpotifySession = {
          ...current,
          spDc,
          refreshToken: spDc,
          accessToken: tokenData.accessToken,
          expiresAt: tokenData.expiresAt,
        };
        commitSpotifySession(updated);
        return tokenData.accessToken;
      }
    }

    if (capturedBearerToken && capturedBearerToken.startsWith("BQ")) {
      return capturedBearerToken;
    }

    return current.accessToken?.startsWith("BQ") ? current.accessToken : null;
  }

  async function queryPathfinderWithRetry(
    operationName: string,
    sha256Hash: string,
    variables: Record<string, unknown> = {},
  ): Promise<any | null> {
    let token = await getValidToken(false);
    if (!token) return null;

    let res = await queryPathfinder(token, operationName, sha256Hash, variables);
    const hasAuthError =
      res.status === 401 ||
      res.status === 403 ||
      Boolean(
        res.data?.errors?.some(
          (e: any) =>
            typeof e?.message === "string" &&
            (e.message.toLowerCase().includes("unauthor") ||
              e.message.toLowerCase().includes("token") ||
              e.message.toLowerCase().includes("forbidden")),
        ),
      );

    if (hasAuthError) {
      token = await getValidToken(true);
      if (token) {
        res = await queryPathfinder(token, operationName, sha256Hash, variables);
      }
    }
    return res.data;
  }

  async function fetchLikedTracksInternal(): Promise<{
    tracks: any[];
    total: number;
  }> {
    const allTracks: any[] = [];
    let offset = 0;
    const limit = 50;
    let total = 0;

    try {
      while (true) {
        const json = await queryPathfinderWithRetry(
          "fetchLibraryTracks",
          PATHFINDER_HASHES.fetchLibraryTracks,
          {
            offset,
            limit,
          },
        );

        const tracksNode = json?.data?.me?.library?.tracks;
        if (!tracksNode) break;

        if (typeof tracksNode.totalCount === "number") {
          total = tracksNode.totalCount;
        }
        const items = Array.isArray(tracksNode.items) ? tracksNode.items : [];
        if (items.length === 0) break;

        for (const item of items) {
          const trackWrapper = item?.track;
          const track = trackWrapper?.data;
          if (!track || track.__typename !== "Track") continue;

          const uri = String(track.uri || trackWrapper?._uri || "");
          const sourceId = uri.split(":").pop() || "";
          const title = typeof track.name === "string" ? track.name.trim() : "";
          if (!sourceId || !title) continue;

          const artistItems = Array.isArray(track.artists?.items)
            ? track.artists.items
            : [];
          const artists = artistItems
            .map((a: any) => a?.profile?.name || a?.name)
            .filter(
              (name: unknown): name is string =>
                typeof name === "string" && name.length > 0,
            );

          const albumName =
            typeof track.albumOfTrack?.name === "string"
              ? track.albumOfTrack.name
              : undefined;
          const coverSources = track.albumOfTrack?.coverArt?.sources;
          const coverUrl =
            Array.isArray(coverSources) && coverSources.length > 0
              ? coverSources[0]?.url
              : undefined;
          const durationMs =
            track.duration?.totalMilliseconds ??
            track.trackDuration?.totalMilliseconds;

          allTracks.push({
            sourceId,
            title,
            artists: artists.length > 0 ? artists : ["Spotify Artist"],
            ...(albumName ? { album: albumName } : {}),
            ...(typeof durationMs === "number" ? { durationMs } : {}),
            ...(typeof coverUrl === "string" ? { coverUrl } : {}),
          });
        }

        offset += items.length;
        if (offset >= total) break;
      }
      return { tracks: allTracks, total: total || allTracks.length };
    } catch (err) {
      console.error("[spotify] fetchLikedTracksInternal failed:", err);
      return { tracks: allTracks, total: allTracks.length };
    }
  }

  let lastProfileHealAttemptAt = 0;

  ipcMain.handle("spotify-auth:get-session", async (event) => {
    if (!fromApp(event)) return null;
    const current =
      (store.get() as unknown as StoredSpotifySession | null) ??
      (await resurrectSessionFromCookies());
    if (!current) return null;

    // Only heal if default placeholder is present and not recently attempted
    const needsProfileHeal =
      (!current.account ||
        current.account.id === "spotify-user" ||
        current.account.name === "Spotify") &&
      Date.now() - lastProfileHealAttemptAt > 5 * 60_000;

    if (needsProfileHeal) {
      lastProfileHealAttemptAt = Date.now();
      try {
        const token = await getValidToken(false);
        if (token) {
          const profile = await fetchSpotifyUserProfile(token);
          if (profile.id || profile.name || profile.photoUrl) {
            const latest =
              (store.get() as unknown as StoredSpotifySession | null) ??
              current;
            const healed: StoredSpotifySession = {
              ...latest,
              account: {
                id: profile.id || latest.account?.id || "spotify-user",
                name: profile.name || latest.account?.name || "Spotify",
                email: latest.account?.email,
                photoUrl: profile.photoUrl || latest.account?.photoUrl,
                product: profile.product || latest.account?.product || "free",
              },
            };
            commitSpotifySession(healed);
            return healed;
          }
        }
      } catch (err) {
        console.warn("[spotify] auto-heal session profile failed:", err);
      }
    }

    return current;
  });

  ipcMain.handle("spotify-auth:logout", async (event) => {
    if (!fromApp(event)) return false;
    store.set(null);
    capturedBearerToken = null;
    try {
      await spSession.clearStorageData();
    } catch (err) {
      console.error("[spotify] clearStorageData failed:", err);
    }
    return true;
  });

  ipcMain.handle("spotify-auth:login", async (event) => {
    if (!fromApp(event)) return { success: false, error: "Unauthorized" };
    if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
      activeLoginWindow.focus();
      return { success: false, error: "Login already in progress" };
    }

    return new Promise((resolve) => {
      let resolved = false;

      const authWindow = new BrowserWindow({
        width: 500,
        height: 720,
        title: "OFFY - Conectar Spotify",
        center: true,
        resizable: true,
        minimizable: true,
        maximizable: false,
        autoHideMenuBar: true,
        backgroundColor: "#121212",
        webPreferences: {
          partition: "persist:spotify",
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      authWindow.webContents.setUserAgent(CHROME_USER_AGENT);
      activeLoginWindow = authWindow;

      const finish = (result: {
        success: boolean;
        session?: StoredSpotifySession;
        cancelled?: boolean;
        error?: string;
      }) => {
        if (resolved) return;
        resolved = true;
        activeLoginWindow = null;
        if (!authWindow.isDestroyed()) {
          authWindow.close();
        }
        resolve(result);
      };

      authWindow.on("closed", () => {
        if (!resolved) {
          finish({ success: false, cancelled: true });
        }
      });

      let isExtracting = false;

      const checkAndExtract = async () => {
        if (resolved || isExtracting || authWindow.isDestroyed()) return;
        const currentUrl = authWindow.webContents.getURL();
        if (!currentUrl.includes("open.spotify.com")) return;

        const cookies = await spSession.cookies.get({});
        const spDc = cookies.find((c) => c.name === "sp_dc")?.value;
        if (!spDc) return;

        isExtracting = true;
        try {
          authWindow.setTitle("OFFY - Conectando conta...");

          let tokenData = await fetchTokenWithSpDc(spDc);
          let token = tokenData?.accessToken || capturedBearerToken;

          if (!token) {
            for (let i = 0; i < 8; i++) {
              await new Promise((r) => setTimeout(r, 400));
              if (authWindow.isDestroyed()) return;
              tokenData = await fetchTokenWithSpDc(spDc);
              token = tokenData?.accessToken || capturedBearerToken;
              if (token) break;
            }
          }

          let userId = "spotify-user";
          let userName = "Spotify";
          let userEmail: string | undefined = undefined;
          let photoUrl: string | undefined = undefined;
          let product = "free";

          if (token) {
            const profile = await fetchSpotifyUserProfile(token);
            if (profile.id) userId = profile.id;
            if (profile.name) userName = profile.name;
            if (profile.photoUrl) photoUrl = profile.photoUrl;
            if (profile.product) product = profile.product;
          }

          if (userName === "Spotify" && !authWindow.isDestroyed()) {
            const pageData = await authWindow.webContents
              .executeJavaScript(`
                (() => {
                  let id = null;
                  for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    const match = k.match(/^([a-zA-Z0-9_-]{15,}):/);
                    if (match && match[1] !== "anonymous") {
                      id = match[1];
                      break;
                    }
                  }

                  let displayName = null;
                  let photoUrl = null;
                  const btn = document.querySelector('button[data-testid="user-widget-link"]') ||
                              document.querySelector('button[aria-label*="perfil" i]') ||
                              document.querySelector('button[aria-label*="profile" i]');
                  if (btn) {
                    displayName = btn.getAttribute("aria-label") || btn.innerText || null;
                    if (displayName) {
                      displayName = displayName.replace(/perfil de /i, "").replace(/profile of /i, "").replace(/profile/i, "").trim();
                    }
                    const img = btn.querySelector("img");
                    if (img?.src) photoUrl = img.src;
                  }

                  return { id, displayName, photoUrl };
                })()
              `)
              .catch(() => null);

            if (pageData?.id && userId === "spotify-user") userId = pageData.id;
            if (pageData?.displayName && userName === "Spotify")
              userName = pageData.displayName;
            if (pageData?.photoUrl && !photoUrl) photoUrl = pageData.photoUrl;
          }

          if (!token) {
            console.error(
              "[spotify] failed to acquire a valid Bearer token for Spotify session",
            );
            finish({
              success: false,
              error: "Falha ao obter token de acesso do Spotify.",
            });
            return;
          }

          const finalSession: StoredSpotifySession = {
            accessToken: token,
            spDc,
            refreshToken: spDc,
            expiresAt: tokenData?.expiresAt ?? Date.now() + 3600_000,
            account: {
              id: userId,
              name: userName,
              email: userEmail,
              photoUrl,
              product,
            },
          };

          commitSpotifySession(finalSession);
          finish({ success: true, session: finalSession });
        } catch (err) {
          console.error("[spotify] session extraction failed:", err);
          isExtracting = false;
        }
      };

      authWindow.webContents.on("did-finish-load", () => {
        void checkAndExtract();
      });

      authWindow.webContents.on("did-navigate-in-page", () => {
        void checkAndExtract();
      });

      authWindow.webContents.on("did-navigate", () => {
        void checkAndExtract();
      });

      authWindow.loadURL(
        "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F",
      );
    });
  });

  ipcMain.handle("spotify:get-user-playlists", async (event) => {
    if (!fromApp(event)) return { items: [] };

    try {
      const json = await queryPathfinderWithRetry(
        "libraryV3",
        PATHFINDER_HASHES.libraryV3,
        {
          filters: ["Playlists"],
          order: null,
          textFilter: "",
          features: [
            "LIKED_SONGS",
            "YOUR_EPISODES_V2",
            "PRERELEASES",
            "EVENTS",
          ],
          limit: 50,
          offset: 0,
          flatten: true,
          expandedFolders: [],
          folderUri: null,
          includeFoldersWhenFlattening: false,
        },
      );

      const rawItems = json?.data?.me?.libraryV3?.items;
      if (!Array.isArray(rawItems)) {
        return { items: [] };
      }

      const playlists: Array<{
        id: string;
        title: string;
        trackCount: number;
        imageUrl: string;
        spotifyUrl: string;
        isPublic: boolean;
      }> = [];

      for (const entry of rawItems) {
        const wrapper = entry?.item;
        const data = wrapper?.data;
        if (
          wrapper?.__typename !== "PlaylistResponseWrapper" ||
          data?.__typename !== "Playlist"
        ) {
          continue;
        }
        const uri: string = data.uri || wrapper._uri || "";
        const id = uri.split(":").pop() || "";
        if (!id) continue;

        const sources = data.images?.items?.[0]?.sources;
        const imageUrl =
          Array.isArray(sources) && sources.length > 0
            ? String(sources[0]?.url || "")
            : "";

        playlists.push({
          id,
          title: String(data.name || "Playlist"),
          trackCount: Number(data.tracks?.totalCount ?? data.totalLikes ?? 0),
          imageUrl,
          spotifyUrl: `https://open.spotify.com/playlist/${id}`,
          isPublic: true,
        });
      }

      // Enrich trackCount via fetchPlaylistContents (limit: 1) in batches of 8
      const batchSize = 8;
      for (let i = 0; i < playlists.length; i += batchSize) {
        const batch = playlists.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (pl) => {
            try {
              const detail = await queryPathfinderWithRetry(
                "fetchPlaylistContents",
                PATHFINDER_HASHES.fetchPlaylistContents,
                {
                  uri: `spotify:playlist:${pl.id}`,
                  offset: 0,
                  limit: 1,
                },
              );
              const totalCount = detail?.data?.playlistV2?.content?.totalCount;
              if (typeof totalCount === "number") {
                pl.trackCount = totalCount;
              }
            } catch {
              // ignore individual count error
            }
          }),
        );
      }

      return { items: playlists };
    } catch (err) {
      console.error("[spotify] get-user-playlists failed:", err);
      return { items: [] };
    }
  });

  ipcMain.handle(
    "spotify:get-playlist-tracks",
    async (event, { playlistId }: { playlistId: string }) => {
      if (!fromApp(event) || !playlistId) return { tracks: [], total: 0 };

      // Handle liked tracks alias
      if (
        playlistId === "collection:tracks" ||
        playlistId === "tracks" ||
        playlistId === "collection"
      ) {
        const liked = await fetchLikedTracksInternal();
        return {
          tracks: liked.tracks,
          total: liked.total,
          title: "Músicas Curtidas (Spotify)",
          description: "Músicas curtidas sincronizadas do seu Spotify",
          coverUrl: liked.tracks[0]?.coverUrl,
        };
      }

      const allTracks: any[] = [];
      let offset = 0;
      const limit = 100;
      let total = 0;
      let playlistTitle: string | undefined;
      let playlistDescription: string | undefined;
      let playlistCoverUrl: string | undefined;

      try {
        while (true) {
          const json = await queryPathfinderWithRetry(
            "fetchPlaylistContents",
            PATHFINDER_HASHES.fetchPlaylistContents,
            {
              uri: `spotify:playlist:${playlistId}`,
              offset,
              limit,
            },
          );

          const playlistV2 = json?.data?.playlistV2;
          const content = playlistV2?.content;
          if (!content) break;

          if (!playlistTitle && typeof playlistV2?.name === "string") {
            playlistTitle = playlistV2.name;
          }
          if (
            !playlistDescription &&
            typeof playlistV2?.description === "string"
          ) {
            playlistDescription = playlistV2.description;
          }
          const headerSources = playlistV2?.images?.items?.[0]?.sources;
          if (
            !playlistCoverUrl &&
            Array.isArray(headerSources) &&
            headerSources.length > 0
          ) {
            playlistCoverUrl = headerSources[0]?.url;
          }

          if (typeof content.totalCount === "number") {
            total = content.totalCount;
          }
          const items = Array.isArray(content.items) ? content.items : [];
          if (items.length === 0) break;

          for (const item of items) {
            const track = item?.itemV2?.data;
            if (!track || track.__typename !== "Track") continue;
            const uri = String(track.uri || "");
            const sourceId = uri.split(":").pop() || "";
            const title =
              typeof track.name === "string" ? track.name.trim() : "";
            if (!sourceId || !title) continue;

            const artistItems = Array.isArray(track.artists?.items)
              ? track.artists.items
              : [];
            const artists = artistItems
              .map((a: any) => a?.profile?.name || a?.name)
              .filter(
                (name: unknown): name is string =>
                  typeof name === "string" && name.length > 0,
              );

            const albumName =
              typeof track.albumOfTrack?.name === "string"
                ? track.albumOfTrack.name
                : undefined;
            const coverSources = track.albumOfTrack?.coverArt?.sources;
            const coverUrl =
              Array.isArray(coverSources) && coverSources.length > 0
                ? coverSources[0]?.url
                : undefined;
            const durationMs =
              track.trackDuration?.totalMilliseconds ??
              track.duration?.totalMilliseconds;

            allTracks.push({
              sourceId,
              title,
              artists: artists.length > 0 ? artists : ["Spotify Artist"],
              ...(albumName ? { album: albumName } : {}),
              ...(typeof durationMs === "number" ? { durationMs } : {}),
              ...(typeof coverUrl === "string" ? { coverUrl } : {}),
            });
          }

          offset += items.length;
          if (offset >= total) break;
        }
        return {
          tracks: allTracks,
          total: total || allTracks.length,
          ...(playlistTitle ? { title: playlistTitle } : {}),
          ...(playlistDescription ? { description: playlistDescription } : {}),
          ...(playlistCoverUrl ? { coverUrl: playlistCoverUrl } : {}),
        };
      } catch (err) {
        console.error("[spotify] get-playlist-tracks failed:", err);
        return { tracks: allTracks, total: allTracks.length };
      }
    },
  );

  ipcMain.handle("spotify:get-liked-tracks", async (event) => {
    if (!fromApp(event)) return { tracks: [], total: 0 };
    return fetchLikedTracksInternal();
  });

  return {
    getValidToken: () => getValidToken(false),
    getSession: () => store.get() as unknown as StoredSpotifySession | null,
  };
}
