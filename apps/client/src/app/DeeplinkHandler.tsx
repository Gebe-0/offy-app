import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, toClientTrack } from "@/shared/api";
import { playerEngine } from "@/features/player";
import { useJamStore } from "@/features/jam";
import { useAuthStore } from "@/features/auth";

interface DeeplinkTarget {
  type: "artist" | "album" | "playlist" | "track" | "jam";
  id: string;
}

function waitForAuthReady(run: (authenticated: boolean) => void): () => void {
  const { status } = useAuthStore.getState();
  if (status !== "initializing") {
    run(status === "authenticated");
    return () => {};
  }
  const unsub = useAuthStore.subscribe((state) => {
    if (state.status !== "initializing") {
      unsub();
      run(state.status === "authenticated");
    }
  });
  return unsub;
}

// opens shared entities arriving via liner:// deeplinks (main pre-validates)
export default function DeeplinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const off = window.linerElectron?.onDeeplink((target: DeeplinkTarget) => {
      const cancelAuthWait = waitForAuthReady((authenticated) => {
        void (async () => {
          try {
            switch (target.type) {
              case "artist":
                navigate(`/artist?id=${encodeURIComponent(target.id)}`);
                break;
              case "album":
                navigate(
                  `/collection?type=album&id=${encodeURIComponent(target.id)}`,
                );
                break;
              case "playlist":
                navigate(
                  `/collection?type=playlist&id=${encodeURIComponent(target.id)}`,
                );
                break;
              case "track": {
                const track = toClientTrack(await api.getTrack(target.id));
                playerEngine.playTrack(
                  track,
                  [track],
                  track.artists,
                  track.coverUrl,
                );
                navigate("/player");
                break;
              }
              case "jam": {
                if (!authenticated) break;
                void useJamStore.getState().joinJam(target.id);
                useJamStore.getState().openModal();
                break;
              }
            }
          } catch (err) {
            console.warn("[deeplink] failed to open target", target, err);
          }
        })();
      });
      cleanups.push(cancelAuthWait);
    });
    return () => {
      off?.();
      for (const cancel of cleanups) cancel();
    };
  }, [navigate]);

  return null;
}
