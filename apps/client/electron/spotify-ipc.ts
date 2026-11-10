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

  async function fetchTokenWithSpDc(
    spDc: string,
  ): Promise<{ accessToken: string; expiresAt: number } | null> {
    if (!spDc) return null;
    try {
      const res = await net.fetch(
        "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
        {
          headers: {
            "User-Agent": CHROME_USER_AGENT,
            Cookie: `sp_dc=${spDc}`,
          },
        },
      );
      if (!res.ok) {
        console.warn("[spotify] get_access_token HTTP status:", res.status);
        return null;
      }
      const data = (await res.json()) as any;
      if (data?.accessToken && !data.isAnonymous) {
        const expiresAt =
          Number(data.accessTokenExpirationTimestampMs) ||
          Date.now() + 3600_000;
        return {
          accessToken: String(data.accessToken),
          expiresAt,
        };
      }
    } catch (err) {
      console.error("[spotify] fetchTokenWithSpDc failed:", err);
    }
    return null;
  }

  async function getValidToken(): Promise<string | null> {
    const raw = store.get();
    if (!raw) return null;
    const current = raw as unknown as StoredSpotifySession;

    const expiresAt = Number(current.expiresAt) || 0;
    // Se ainda válido com folga de 60s, reaproveita
    if (current.accessToken && current.accessToken.startsWith("BQ") && Date.now() < expiresAt - 60_000) {
      return String(current.accessToken);
    }

    // Renova via sp_dc se disponível
    const spDc = current.spDc || current.refreshToken;
    if (spDc) {
      const tokenData = await fetchTokenWithSpDc(spDc);
      if (tokenData?.accessToken) {
        const updated: StoredSpotifySession = {
          ...current,
          accessToken: tokenData.accessToken,
          expiresAt: tokenData.expiresAt,
        };
        store.set(updated as unknown as Record<string, unknown>);
        return tokenData.accessToken;
      }
    }

    // Tenta encontrar sp_dc atualizado nos cookies de sessão do Electron
    try {
      const cookies = await spSession.cookies.get({});
      const sessionSpDc = cookies.find((c) => c.name === "sp_dc")?.value;
      if (sessionSpDc) {
        const tokenData = await fetchTokenWithSpDc(sessionSpDc);
        if (tokenData?.accessToken) {
          const updated: StoredSpotifySession = {
            ...current,
            spDc: sessionSpDc,
            refreshToken: sessionSpDc,
            accessToken: tokenData.accessToken,
            expiresAt: tokenData.expiresAt,
          };
          store.set(updated as unknown as Record<string, unknown>);
          return tokenData.accessToken;
        }
      }
    } catch (err) {
      console.error("[spotify] session cookie lookup failed:", err);
    }

    // Fallback: token interceptado recentemente se válido
    if (capturedBearerToken && capturedBearerToken.startsWith("BQ")) {
      return capturedBearerToken;
    }

    return current.accessToken?.startsWith("BQ") ? current.accessToken : null;
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

        // 1. Procurar cookie sp_dc sem filtro de dominio restritivo
        const cookies = await spSession.cookies.get({});
        const spDc = cookies.find((c) => c.name === "sp_dc")?.value;
        if (!spDc) return;

        isExtracting = true;
        try {
          authWindow.setTitle("OFFY - Conectando conta...");

          // 2. Obter Bearer Token oficial diretamente via get_access_token (instantaneo e sem falha)
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

          // 3. Tentar carregar dados oficiais do usuario direto da API oficial do Spotify
          if (token) {
            try {
              const meRes = await net.fetch("https://api.spotify.com/v1/me", {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "User-Agent": CHROME_USER_AGENT,
                },
              });
              if (meRes.ok) {
                const meData = (await meRes.json()) as any;
                if (meData?.id) userId = meData.id;
                if (meData?.display_name) userName = meData.display_name;
                if (meData?.email) userEmail = meData.email;
                if (meData?.images?.[0]?.url) photoUrl = meData.images[0].url;
                if (meData?.product) product = meData.product.toLowerCase();
              }
            } catch (err) {
              console.warn("[spotify] fetch /v1/me warning:", err);
            }
          }

          // Fallback caso a API /v1/me nao tenha preenchido os campos
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

                  let product = "free";
                  try {
                    const init = document.getElementById("initialState");
                    if (init) {
                      const parsed = JSON.parse(atob(init.innerText));
                      if (parsed?.session?.product?.product) {
                        product = parsed.session.product.product.toLowerCase();
                      }
                    }
                  } catch {}

                  return { id, displayName, photoUrl, product };
                })()
              `)
              .catch(() => null);

            if (pageData?.id && userId === "spotify-user") userId = pageData.id;
            if (pageData?.displayName && userName === "Spotify") userName = pageData.displayName;
            if (pageData?.photoUrl && !photoUrl) photoUrl = pageData.photoUrl;
            if (pageData?.product && product === "free") product = pageData.product;
          }

          if (token && userId && userId !== "spotify-user" && (!photoUrl || userName === "Spotify")) {
            try {
              const profileRes = await net.fetch(
                `https://spclient.wg.spotify.com/user-profile-view/v3/profile/${encodeURIComponent(userId)}`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "User-Agent": CHROME_USER_AGENT,
                  },
                },
              );
              if (profileRes.ok) {
                const profileData = (await profileRes.json()) as any;
                if (profileData?.name) userName = profileData.name;
                if (profileData?.image_url) photoUrl = profileData.image_url;
              }
            } catch {}
          }

          if (!token) {
            console.error("[spotify] failed to acquire a valid Bearer token for Spotify session");
            finish({ success: false, error: "Falha ao obter token de acesso do Spotify." });
            return;
          }

          const finalSession: StoredSpotifySession = {
            accessToken: token,
            spDc,
            refreshToken: spDc,
            expiresAt: tokenData?.expiresAt ?? (Date.now() + 3600_000),
            account: {
              id: userId,
              name: userName,
              email: userEmail,
              photoUrl,
              product,
            },
          };

          store.set(finalSession as unknown as Record<string, unknown>);
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
    let token = await getValidToken();
    if (!token) return { items: [] };

    try {
      let res = await net.fetch(
        "https://api.spotify.com/v1/me/playlists?limit=50",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": CHROME_USER_AGENT,
          },
        },
      );

      // Se der 401, tenta renovar o token e repetir a requisicao
      if (res.status === 401) {
        token = await getValidToken();
        if (token) {
          res = await net.fetch(
            "https://api.spotify.com/v1/me/playlists?limit=50",
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "User-Agent": CHROME_USER_AGENT,
              },
            },
          );
        }
      }

      if (!res.ok) {
        console.warn("[spotify] get-user-playlists failed with status:", res.status);
        return { items: [] };
      }
      const data = (await res.json()) as any;
      return {
        items: (data.items || []).filter(Boolean).map((p: any) => ({
          id: p.id,
          title: p.name,
          trackCount: p.tracks?.total ?? 0,
          imageUrl: p.images?.[0]?.url ?? "",
          spotifyUrl:
            p.external_urls?.spotify ??
            `https://open.spotify.com/playlist/${p.id}`,
          isPublic: Boolean(p.public),
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
      let token = await getValidToken();
      if (!token) return { tracks: [], total: 0 };

      const allTracks: any[] = [];
      let offset = 0;
      const limit = 100;
      let total = 0;

      try {
        while (true) {
          let res = await net.fetch(
            `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&offset=${offset}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "User-Agent": CHROME_USER_AGENT,
              },
            },
          );

          if (res.status === 401) {
            token = await getValidToken();
            if (token) {
              res = await net.fetch(
                `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&offset=${offset}`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "User-Agent": CHROME_USER_AGENT,
                  },
                },
              );
            }
          }

          if (!res.ok) {
            console.warn("[spotify] get-playlist-tracks error status:", res.status);
            break;
          }
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
    let token = await getValidToken();
    if (!token) return { tracks: [], total: 0 };

    const allTracks: any[] = [];
    let offset = 0;
    const limit = 50;
    let total = 0;

    try {
      while (true) {
        let res = await net.fetch(
          `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": CHROME_USER_AGENT,
            },
          },
        );

        if (res.status === 401) {
          token = await getValidToken();
          if (token) {
            res = await net.fetch(
              `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "User-Agent": CHROME_USER_AGENT,
                },
              },
            );
          }
        }

        if (!res.ok) {
          console.warn("[spotify] get-liked-tracks error status:", res.status);
          break;
        }
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
