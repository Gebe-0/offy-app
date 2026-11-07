import { useEffect, useState, useCallback } from "react";
import {
  getCachedSpotifyAccount,
  initSpotifyAuth,
  onSpotifyAuthChanged,
  signInWithSpotify,
  signOutSpotify,
  type SpotifyAccount,
} from "@/shared/spotify";

export interface SpotifyAccountState {
  signedIn: boolean;
  account: SpotifyAccount | null;
  loading: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<boolean>;
}

export function useSpotifyAccount(): SpotifyAccountState {
  const [account, setAccount] = useState<SpotifyAccount | null>(() =>
    getCachedSpotifyAccount(),
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    void initSpotifyAuth().then((acc) => {
      setAccount(acc);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
    return onSpotifyAuthChanged(refresh);
  }, [refresh]);

  const signIn = useCallback(async () => {
    setLoading(true);
    const result = await signInWithSpotify();
    if (result.success && result.account) {
      setAccount(result.account);
    }
    setLoading(false);
    return result.success;
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    const success = await signOutSpotify();
    setAccount(null);
    setLoading(false);
    return success;
  }, []);

  return {
    signedIn: Boolean(account),
    account,
    loading,
    signIn,
    signOut,
  };
}
