import { useEffect, useMemo, useState } from "react";
import {
  fetchUserSpotifyPlaylists,
  onSpotifyAuthChanged,
  useSpotifyPreferences,
  type SpotifyUserPlaylist,
  isSpotifySignedIn,
} from "@/shared/spotify";
import type { LibraryItemViewModel } from "../types";

const SPOTIFY_ORDER_ORIGIN = Date.UTC(2005, 0, 1);

let cachedPlaylists: SpotifyUserPlaylist[] | null = null;

function toLibraryItem(
  playlist: SpotifyUserPlaylist,
  index: number,
): LibraryItemViewModel {
  return {
    id: `spotify:${playlist.id}`,
    title: playlist.title,
    subtitle: `${playlist.trackCount} faixas • Spotify`,
    imageUrl: playlist.imageUrl,
    kind: "playlist",
    href: `/collection?type=playlist&id=${encodeURIComponent(`spotify:${playlist.id}`)}`,
    addedAt: new Date(SPOTIFY_ORDER_ORIGIN - index).toISOString(),
    isOwned: false,
    source: "spotify",
  };
}

export function useSpotifyLibraryItems(): LibraryItemViewModel[] {
  const syncLibrary = useSpotifyPreferences((state) => state.syncLibrary);
  const [signedIn, setSignedIn] = useState(isSpotifySignedIn);
  const [playlists, setPlaylists] = useState<SpotifyUserPlaylist[]>(
    cachedPlaylists ?? [],
  );

  useEffect(
    () => onSpotifyAuthChanged(() => setSignedIn(isSpotifySignedIn())),
    [],
  );

  useEffect(() => {
    if (!signedIn || !syncLibrary) {
      setPlaylists([]);
      return;
    }
    let cancelled = false;
    void fetchUserSpotifyPlaylists().then((items) => {
      if (!cancelled) {
        cachedPlaylists = items;
        setPlaylists(items);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, syncLibrary]);

  return useMemo(() => {
    if (!syncLibrary || !signedIn) return [];
    const seen = new Set<string>();
    const unique = playlists.filter((p) => {
      if (!p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    return unique.map(toLibraryItem);
  }, [playlists, signedIn, syncLibrary]);
}
