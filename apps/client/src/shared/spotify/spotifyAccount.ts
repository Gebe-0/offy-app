export interface SpotifyAccount {
  id: string;
  name: string;
  email?: string;
  photoUrl?: string;
  product?: string;
}

const AUTH_CHANGED_EVENT = "spotify-auth:changed";

let cachedAccount: SpotifyAccount | null | undefined;
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
      cachedAccount = session.account;
      isInitialized = true;
      return session.account;
    }
  } catch {
    // electron not available or error
  }
  cachedAccount = null;
  isInitialized = true;
  return null;
}

export function getCachedSpotifyAccount(): SpotifyAccount | null {
  if (!isInitialized && typeof window !== "undefined") {
    void initSpotifyAuth();
  }
  return cachedAccount ?? null;
}

export function isSpotifySignedIn(): boolean {
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
