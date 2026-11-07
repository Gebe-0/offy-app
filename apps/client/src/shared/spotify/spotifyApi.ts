export interface SpotifyUserPlaylist {
  id: string;
  title: string;
  trackCount: number;
  imageUrl: string;
  spotifyUrl: string;
  isPublic: boolean;
}

export interface SpotifyTrackItem {
  sourceId: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  coverUrl?: string;
}

export async function fetchUserSpotifyPlaylists(): Promise<
  SpotifyUserPlaylist[]
> {
  if (typeof window === "undefined" || !window.linerElectron?.spotifyAuth) {
    return [];
  }
  try {
    const res = await window.linerElectron.spotifyAuth.getUserPlaylists();
    return res?.items ?? [];
  } catch (err) {
    console.error("fetchUserSpotifyPlaylists failed:", err);
    return [];
  }
}

export async function fetchUserSpotifyLikedTracks(): Promise<{
  tracks: SpotifyTrackItem[];
  total: number;
}> {
  if (typeof window === "undefined" || !window.linerElectron?.spotifyAuth) {
    return { tracks: [], total: 0 };
  }
  try {
    return await window.linerElectron.spotifyAuth.getLikedTracks();
  } catch (err) {
    console.error("fetchUserSpotifyLikedTracks failed:", err);
    return { tracks: [], total: 0 };
  }
}

export async function fetchSpotifyTracksWithAccount(
  playlistId: string,
): Promise<{
  tracks: SpotifyTrackItem[];
  total: number;
}> {
  if (typeof window === "undefined" || !window.linerElectron?.spotifyAuth) {
    return { tracks: [], total: 0 };
  }
  try {
    return await window.linerElectron.spotifyAuth.getPlaylistTracks(playlistId);
  } catch (err) {
    console.error("fetchSpotifyTracksWithAccount failed:", err);
    return { tracks: [], total: 0 };
  }
}
