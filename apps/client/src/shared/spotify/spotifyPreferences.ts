import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SpotifyPreferencesState {
  syncLibrary: boolean;
  syncLikedSongs: boolean;
  useAccountForImport: boolean;
  setSyncLibrary: (syncLibrary: boolean) => void;
  setSyncLikedSongs: (syncLikedSongs: boolean) => void;
  setUseAccountForImport: (useAccountForImport: boolean) => void;
}

export const useSpotifyPreferences = create<SpotifyPreferencesState>()(
  persist(
    (set) => ({
      syncLibrary: true,
      syncLikedSongs: true,
      useAccountForImport: true,
      setSyncLibrary: (syncLibrary) => set({ syncLibrary }),
      setSyncLikedSongs: (syncLikedSongs) => set({ syncLikedSongs }),
      setUseAccountForImport: (useAccountForImport) =>
        set({ useAccountForImport }),
    }),
    {
      name: "liner_spotify_preferences",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function prefersSpotifyAccountImport(): boolean {
  return useSpotifyPreferences.getState().useAccountForImport;
}
