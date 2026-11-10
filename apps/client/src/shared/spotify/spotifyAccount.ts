export interface SpotifyAccount {
  id: string;
  name: string;
  email?: string;
  photoUrl?: string;
  product?: string;
}

const AUTH_CHANGED_EVENT = "spotify-auth:changed";
const HAS_SESSION_STORAGE_KEY = "offy:spotify:has-session";
const ACCOUNT_STORAGE_KEY = "offy:spotify:cached-account";

function loadInitialAccount(): SpotifyAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === "string") {
        return parsed as SpotifyAccount;
      }
    }
  } catch {}
  return null;
}

let cachedAccount: SpotifyAccount | null | undefined = loadInitialAccount();
let isInitialized = false;

function notifyAuthChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  }
}

export function onSpotifyAuthChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener);
}

export async function initSpotifyAuth(): Promise<SpotifyAccount | null> {
  if (typeof window === "undefined") return null;

  try {
    const session = await window.linerElectron?.spotifyAuth?.getSession();
    if (session?.account) {
      try {
        localStorage.setItem(HAS_SESSION_STORAGE_KEY, "true");
        localStorage.setItem(
          ACCOUNT_STORAGE_KEY,
          JSON.stringify(session.account),
        );
      } catch {}
      const prev = cachedAccount;
      const next = session.account;
      const changed =
        !prev ||
        prev.id !== next.id ||
        prev.name !== next.name ||
        prev.photoUrl !== next.photoUrl ||
        prev.product !== next.product;
      cachedAccount = next;
      isInitialized = true;
      if (changed) {
        notifyAuthChanged();
      }
      return next;
    } else if (session === null && window.linerElectron?.spotifyAuth) {
      // Electron explicitly confirmed that no session exists on disk/partition
      try {
        localStorage.removeItem(HAS_SESSION_STORAGE_KEY);
        localStorage.removeItem(ACCOUNT_STORAGE_KEY);
      } catch {}
      const hadAccount = Boolean(cachedAccount);
      cachedAccount = null;
      isInitialized = true;
      if (hadAccount) {
        notifyAuthChanged();
      }
      return null;
    }
  } catch (err) {
    // Preserve local cached account on offline or transient startup errors
    console.warn("[spotify] session check encountered temporary error:", err);
  }

  isInitialized = true;
  return cachedAccount ?? null;
}

export function getCachedSpotifyAccount(): SpotifyAccount | null {
  if (!isInitialized && typeof window !== "undefined") {
    void initSpotifyAuth();
  }
  return cachedAccount ?? null;
}

export function isSpotifySignedIn(): boolean {
  if (cachedAccount) return true;
  if (!isInitialized && typeof window !== "undefined") {
    try {
      if (localStorage.getItem(HAS_SESSION_STORAGE_KEY) === "true") {
        void initSpotifyAuth();
        return true;
      }
    } catch {}
    void initSpotifyAuth();
  }
  return Boolean(getCachedSpotifyAccount());
}

export async function signInWithSpotify(): Promise<{
  success: boolean;
  account?: SpotifyAccount;
  cancelled?: boolean;
  error?: string;
}> {
  if (typeof window === "undefined" || !window.linerElectron?.spotifyAuth) {
    return { success: false, error: "Electron API not available" };
  }

  try {
    const result = await window.linerElectron.spotifyAuth.login();
    if (result.success && result.session?.account) {
      try {
        localStorage.setItem(HAS_SESSION_STORAGE_KEY, "true");
        localStorage.setItem(
          ACCOUNT_STORAGE_KEY,
          JSON.stringify(result.session.account),
        );
      } catch {}
      cachedAccount = result.session.account;
      isInitialized = true;
      notifyAuthChanged();
      return { success: true, account: result.session.account };
    }
    return {
      success: false,
      cancelled: result.cancelled,
      error: result.error,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed";
    return { success: false, error: message };
  }
}

export async function signOutSpotify(): Promise<boolean> {
  try {
    localStorage.removeItem(HAS_SESSION_STORAGE_KEY);
    localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  } catch {}
  if (typeof window === "undefined" || !window.linerElectron?.spotifyAuth) {
    cachedAccount = null;
    notifyAuthChanged();
    return true;
  }

  try {
    await window.linerElectron.spotifyAuth.logout();
    cachedAccount = null;
    notifyAuthChanged();
    return true;
  } catch {
    cachedAccount = null;
    notifyAuthChanged();
    return false;
  }
}
