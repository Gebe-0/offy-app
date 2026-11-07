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
import path from "node:path";
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

  async function getValidToken(): Promise<string | null> {
    const raw = store.get();
    if (!raw || !raw.accessToken) return null;
    const current = raw as unknown as StoredSpotifySession;

    const expiresAt = Number(current.expiresAt) || 0;
    if (Date.now() < expiresAt - 60_000) {
      return String(current.accessToken);
    }

    const spSession = session.fromPartition("persist:spotify");
    try {
      const bgWin = new BrowserWindow({
        show: false,
        width: 200,
        height: 200,
        webPreferences: {
          partition: "persist:spotify",
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      await bgWin.loadURL("https://open.spotify.com/");
      const fresh = await bgWin.webContents.executeJavaScript(`
        (async () => {
          try {
            const res = await fetch("/api/token", { credentials: "include" });
            if (!res.ok) return null;
            return await res.json();
          } catch { return null; }
        })()
      `);
      bgWin.destroy();

      if (fresh && fresh.accessToken) {
        const updated: StoredSpotifySession = {
          ...current,
          accessToken: fresh.accessToken,
          expiresAt:
            fresh.accessTokenExpirationTimestampMs || Date.now() + 3600_000,
        };
        store.set(updated as unknown as Record<string, unknown>);
        return fresh.accessToken;
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
    try {
      const spSession = session.fromPartition("persist:spotify");
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
      const spSession = session.fromPartition("persist:spotify");

      const authWindow = new BrowserWindow({
        width: 480,
        height: 720,
        title: "OFFY - Conectar Spotify",
        center: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        webPreferences: {
          partition: "persist:spotify",
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

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

      const attemptExtraction = async () => {
        if (resolved || authWindow.isDestroyed()) return;
        const currentUrl = authWindow.webContents.getURL();
        if (!currentUrl.includes("open.spotify.com")) return;

        try {
          const cookies = await spSession.cookies.get({
            domain: ".spotify.com",
          });
          const spDc = cookies.find((c) => c.name === "sp_dc")?.value;

          const data = (await authWindow.webContents.executeJavaScript(`
            (async () => {
              try {
                const tokenRes = await fetch("/api/token", { credentials: "include" });
                if (!tokenRes.ok) return null;
                const tokenJson = await tokenRes.json();
                if (!tokenJson || !tokenJson.accessToken || tokenJson.isAnonymous) return null;
                const meRes = await fetch("https://api.spotify.com/v1/me", {
                  headers: { "Authorization": "Bearer " + tokenJson.accessToken }
                });
                if (!meRes.ok) return null;
                const meJson = await meRes.json();
                return { token: tokenJson, me: meJson };
              } catch (e) {
                return null;
              }
            })()
          `)) as {
            token: {
              accessToken: string;
              accessTokenExpirationTimestampMs?: number;
            };
            me: {
              id: string;
              display_name?: string;
              email?: string;
              images?: Array<{ url: string }>;
              product?: string;
            };
          } | null;

          if (data && data.token && data.me) {
            const finalSession: StoredSpotifySession = {
              accessToken: data.token.accessToken,
              spDc,
              refreshToken: spDc,
              expiresAt:
                data.token.accessTokenExpirationTimestampMs ||
                Date.now() + 3600_000,
              account: {
                id: data.me.id,
                name: data.me.display_name || data.me.id,
                email: data.me.email,
                photoUrl: data.me.images?.[0]?.url,
                product: data.me.product,
              },
            };
            store.set(finalSession as unknown as Record<string, unknown>);
            finish({ success: true, session: finalSession });
          }
        } catch {
          // not ready yet
        }
      };

      const checkTimer = setInterval(() => {
        void attemptExtraction();
      }, 1000);

      authWindow.webContents.on("did-finish-load", () => {
        void attemptExtraction();
      });

      authWindow.webContents.on("did-navigate-in-page", () => {
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
