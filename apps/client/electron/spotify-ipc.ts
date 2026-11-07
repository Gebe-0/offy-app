import path from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  net,
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
    fetch: (url, init) => net.fetch(url, init),
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
  let lastCapturedAt = 0;

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
          lastCapturedAt = Date.now();
        }
      }
    },
  );

  async function getValidToken(): Promise<string | null> {
    const raw = store.get();
    if (!raw || !raw.accessToken) return null;
    const current = raw as unknown as StoredSpotifySession;

    const expiresAt = Number(current.expiresAt) || 0;
    if (Date.now() < expiresAt - 60_000) {
      return String(current.accessToken);
    }

    try {
      const bgWin = new BrowserWindow({
        show: false,
        width: 300,
        height: 300,
        webPreferences: {
          partition: "persist:spotify",
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      bgWin.webContents.setUserAgent(CHROME_USER_AGENT);

      const prevCapturedAt = lastCapturedAt;
      await bgWin.loadURL("https://open.spotify.com/");

      // Wait up to 6 seconds for Spotify Web Player to make an API call with fresh token
      for (let i = 0; i < 12; i++) {
        if (capturedBearerToken && lastCapturedAt > prevCapturedAt) {
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!bgWin.isDestroyed()) {
        bgWin.destroy();
      }

      if (capturedBearerToken && lastCapturedAt > prevCapturedAt) {
        const updated: StoredSpotifySession = {
          ...current,
          accessToken: capturedBearerToken,
          expiresAt: Date.now() + 3600_000,
        };
        store.set(updated as unknown as Record<string, unknown>);
        return capturedBearerToken;
      }
    } catch (err) {
      console.error("[spotify] silent token refresh failed:", err);
    }

    return String(current.accessToken);
  }

  ipcMain.handle("spotify-auth:get-session", (event) => {
    if (!fromApp(event)) return null;
    return store.get();
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
        clearInterval(checkTimer);
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

      const attemptExtraction = async () => {
        if (resolved || isExtracting || authWindow.isDestroyed()) return;
        const currentUrl = authWindow.webContents.getURL();
        if (!currentUrl.includes("open.spotify.com")) return;

        isExtracting = true;
        try {
          authWindow.setTitle("OFFY - Conectando conta...");

          // 1. Get captured token or probe from page context
          let token = capturedBearerToken;

          if (!token) {
            const pageToken = await authWindow.webContents.executeJavaScript(`
              (async () => {
                try {
                  const res = await fetch("/get_access_token?reason=transport&productType=web_player", { credentials: "include" });
                  if (res.ok) {
                    const data = await res.json();
                    if (data && data.accessToken && !data.isAnonymous) return data.accessToken;
                  }
                } catch {}
                try {
                  const res2 = await fetch("/api/token", { credentials: "include" });
                  if (res2.ok) {
                    const data2 = await res2.json();
                    if (data2 && data2.accessToken && !data2.isAnonymous) return data2.accessToken;
                  }
                } catch {}
                return null;
              })()
            `);
            if (pageToken) token = pageToken;
          }

          if (!token) {
            isExtracting = false;
            return;
          }

          // 2. Validate token and fetch user profile
          const meRes = await net.fetch("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!meRes.ok) {
            isExtracting = false;
            return;
          }

          const me = (await meRes.json()) as {
            id: string;
            display_name?: string;
            email?: string;
            images?: Array<{ url: string }>;
            product?: string;
          };

          if (!me || !me.id) {
            isExtracting = false;
            return;
          }

          // 3. Extract sp_dc session cookie
          const cookies = await spSession.cookies.get({
            domain: ".spotify.com",
          });
          const spDc = cookies.find((c) => c.name === "sp_dc")?.value;

          const finalSession: StoredSpotifySession = {
            accessToken: token,
            spDc,
            refreshToken: spDc,
            expiresAt: Date.now() + 3600_000,
            account: {
              id: me.id,
              name: me.display_name || me.id,
              email: me.email,
              photoUrl: me.images?.[0]?.url,
              product: me.product,
            },
          };

          store.set(finalSession as unknown as Record<string, unknown>);
          finish({ success: true, session: finalSession });
        } catch {
          isExtracting = false;
        }
      };

      const checkTimer = setInterval(() => {
        void attemptExtraction();
      }, 700);

      authWindow.webContents.on("did-finish-load", () => {
        void attemptExtraction();
      });

      authWindow.webContents.on("did-navigate-in-page", () => {
        void attemptExtraction();
      });

      authWindow.webContents.on("did-navigate", () => {
        void attemptExtraction();
      });

      authWindow.loadURL(
        "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F",
      );
    });
  });

  ipcMain.handle("spotify:get-user-playlists", async (event) => {
    if (!fromApp(event)) return { items: [] };
    const token = await getValidToken();
    if (!token) return { items: [] };

    try {
      const res = await net.fetch(
        "https://api.spotify.com/v1/me/playlists?limit=50",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) return { items: [] };
      const data = (await res.json()) as any;
      return {
        items: (data.items || []).map((p: any) => ({
          id: p.id,
          title: p.name,
          trackCount: p.tracks?.total ?? 0,
          imageUrl: p.images?.[0]?.url ?? "",
          spotifyUrl:
            p.external_urls?.spotify ??
            `https://open.spotify.com/playlist/${p.id}`,
          isPublic: p.public,
        })),
      };
    } catch (err) {
      console.error("[spotify] get-user-playlists failed:", err);
      return { items: [] };
    }
  });

  ipcMain.handle(
    "spotify:get-playlist-tracks",
    async (event, { playlistId }: { playlistId: string }) => {
      if (!fromApp(event)) return { tracks: [], total: 0 };
      const token = await getValidToken();
      if (!token) return { tracks: [], total: 0 };

      const allTracks: any[] = [];
      let offset = 0;
      const limit = 100;
      let total = 0;

      try {
        while (true) {
          const res = await net.fetch(
            `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&offset=${offset}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) break;
          const data = (await res.json()) as any;
          total = data.total ?? 0;
          const items = data.items || [];
          if (items.length === 0) break;

          for (const item of items) {
            if (!item?.track || !item.track.id) continue;
            allTracks.push({
              sourceId: item.track.id,
              title: item.track.name,
              artists: (item.track.artists || []).map((a: any) => a.name),
              album: item.track.album?.name,
              durationMs: item.track.duration_ms,
              coverUrl: item.track.album?.images?.[0]?.url,
            });
          }

          offset += items.length;
          if (offset >= total) break;
        }
        return { tracks: allTracks, total: total || allTracks.length };
      } catch (err) {
        console.error("[spotify] get-playlist-tracks failed:", err);
        return { tracks: allTracks, total: allTracks.length };
      }
    },
  );

  ipcMain.handle("spotify:get-liked-tracks", async (event) => {
    if (!fromApp(event)) return { tracks: [], total: 0 };
    const token = await getValidToken();
    if (!token) return { tracks: [], total: 0 };

    const allTracks: any[] = [];
    let offset = 0;
    const limit = 50;
    let total = 0;

    try {
      while (true) {
        const res = await net.fetch(
          `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) break;
        const data = (await res.json()) as any;
        total = data.total ?? 0;
        const items = data.items || [];
        if (items.length === 0) break;

        for (const item of items) {
          if (!item?.track || !item.track.id) continue;
          allTracks.push({
            sourceId: item.track.id,
            title: item.track.name,
            artists: (item.track.artists || []).map((a: any) => a.name),
            album: item.track.album?.name,
            durationMs: item.track.duration_ms,
            coverUrl: item.track.album?.images?.[0]?.url,
          });
        }

        offset += items.length;
        if (offset >= total) break;
      }
      return { tracks: allTracks, total: total || allTracks.length };
    } catch (err) {
      console.error("[spotify] get-liked-tracks failed:", err);
      return { tracks: allTracks, total: allTracks.length };
    }
  });

  return {
    getValidToken,
    getSession: () => store.get() as unknown as StoredSpotifySession | null,
  };
}
