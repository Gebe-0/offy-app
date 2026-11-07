import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, toClientTrack } from "@/shared/api";
import { playerEngine } from "@/features/player";
import { useJamStore } from "@/features/jam";

interface DeeplinkTarget {
  type: "artist" | "album" | "playlist" | "track" | "jam";
  id: string;
}

// opens shared entities arriving via liner:// deeplinks (main pre-validates)
export default function DeeplinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const off = window.linerElectron?.onDeeplink((target: DeeplinkTarget) => {
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
              void useJamStore.getState().joinJam(target.id);
              useJamStore.getState().openModal();
              break;
            }
          }
        } catch {
          // unknown id or offline, stay where we are
        }
      })();
    });
    return off;
  }, [navigate]);

  return null;
}
