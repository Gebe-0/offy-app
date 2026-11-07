import { useState, useMemo, useEffect, useCallback } from "react";
import {
  AddLine,
  CloseCircleFill,
  HeartFill,
  MusicLine,
  Search2Line,
  SpotifyFill,
} from "@mingcute/react";
import Dialog from "@/shared/ui/Dialog";
import { DialogHeader } from "@/shared/ui";
import TextInput from "@/shared/ui/TextInput";
import { AppImage } from "@/features/covers";
import { useTranslation } from "@/languages";
import {
  fetchUserSpotifyPlaylists,
  type SpotifyUserPlaylist,
} from "@/shared/spotify";
import { useSpotifyAccount } from "@/features/spotify-auth";

interface SpotifyPlaylistsModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (playlistUrl: string, title?: string) => void;
}

export default function SpotifyPlaylistsModal({
  open,
  onClose,
  onSelect,
}: SpotifyPlaylistsModalProps) {
  const { t } = useTranslation();
  const { signedIn, signIn, loading: authLoading } = useSpotifyAccount();

  const [playlists, setPlaylists] = useState<SpotifyUserPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [importingUrl, setImportingUrl] = useState<string | null>(null);

  const loadPlaylists = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    try {
      const items = await fetchUserSpotifyPlaylists();
      setPlaylists(items);
    } catch (err) {
      console.error("[SpotifyPlaylistsModal] failed to load playlists:", err);
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setImportingUrl(null);
      if (signedIn) {
        void loadPlaylists();
      }
    }
  }, [open, signedIn, loadPlaylists]);

  const filteredPlaylists = useMemo(() => {
    if (!searchQuery.trim()) return playlists;
    const q = searchQuery.toLowerCase().trim();
    return playlists.filter((p) => p.title.toLowerCase().includes(q));
  }, [playlists, searchQuery]);

  const handleSelect = (url: string, title?: string) => {
    setImportingUrl(url);
    onSelect(url, title);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)} maxWidth={440}>
      <div className="flex flex-col gap-[14px] px-[20px] pb-[20px]">
        <DialogHeader
          title={
            <div className="flex items-center gap-[8px]">
              <SpotifyFill size={22} className="text-[#1ED760]" />
              <span>{t("settings.spotify.my_playlists") || "Playlists do Spotify"}</span>
            </div>
          }
          description={
            t("settings.spotify.my_playlists_desc") ||
            "Selecione uma playlist para importar com 1 clique para o OFFY."
          }
        />

        {!signedIn ? (
          <div className="flex flex-col items-center justify-center gap-[12px] py-[28px] text-center">
            <div className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-fill text-text-primary">
              <SpotifyFill size={28} />
            </div>
            <div className="flex flex-col gap-[4px]">
              <p className="text-[14px] font-medium text-text-primary m-0">
                {t("settings.spotify.connect_account") || "Conecte sua conta do Spotify"}
              </p>
              <p className="text-[12px] text-text-tertiary m-0">
                {t("settings.spotify.connect_account_hint") ||
                  "Faça login para ver e importar suas playlists e músicas curtidas."}
              </p>
            </div>
            <button
              type="button"
              disabled={authLoading}
              onClick={() => void signIn()}
              className="mt-[6px] flex items-center justify-center gap-[8px] px-[20px] py-[8px] rounded-item bg-text-primary/85 text-bg-primary hover:bg-text-primary font-medium text-[13px] transition-colors cursor-pointer border-none"
            >
              <SpotifyFill size={18} />
              <span>{t("settings.spotify.sign_in") || "Entrar"}</span>
            </button>
          </div>
        ) : (
          <>
            {playlists.length >= 4 && (
              <TextInput
                size="sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("library.search_playlists") || "Buscar playlists..."}
                icon={<Search2Line size={16} />}
                rightSlot={
                  searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="border-none bg-transparent p-0 text-text-tertiary hover:text-text-primary cursor-pointer flex items-center justify-center"
                    >
                      <CloseCircleFill size={15} />
                    </button>
                  ) : null
                }
                className="!h-[36px] w-full rounded-control !border-transparent bg-bg-elevated text-body"
              />
            )}

            <div className="flex flex-col gap-[4px] max-h-[340px] overflow-y-auto pr-[2px]">
              {/* Músicas Curtidas pinned row */}
              {!searchQuery && (
                <div className="flex items-center justify-between p-[8px] rounded-item hover:bg-fill-hover transition-colors group">
                  <div className="flex items-center gap-[12px] min-w-0">
                    <div className="relative h-[44px] w-[44px] rounded-item bg-gradient-to-br from-[#450af5] to-[#c4efd9] shrink-0 flex items-center justify-center text-white shadow-sm">
                      <HeartFill size={20} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-medium text-text-primary truncate">
                        {t("settings.spotify.liked_songs") || "Músicas Curtidas"}
                      </span>
                      <span className="text-[11px] text-text-tertiary truncate">
                        Spotify • {t("settings.spotify.collection") || "Coleção"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={importingUrl !== null}
                    onClick={() =>
                      handleSelect(
                        "https://open.spotify.com/collection/tracks",
                        t("settings.spotify.liked_songs") || "Músicas Curtidas (Spotify)",
                      )
                    }
                    className="flex h-[32px] w-[32px] items-center justify-center rounded-control bg-fill hover:bg-[#1ED760] text-text-secondary hover:text-black transition-colors border-none cursor-pointer shrink-0 disabled:opacity-50"
                    title={t("common.import") || "Importar"}
                  >
                    <AddLine size={18} />
                  </button>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-[30px] text-text-tertiary text-[13px]">
                  {t("common.loading") || "Carregando playlists..."}
                </div>
              ) : filteredPlaylists.length === 0 ? (
                <div className="flex items-center justify-center py-[24px] text-text-tertiary text-[13px]">
                  {t("settings.spotify.no_playlists") || "Nenhuma playlist encontrada."}
                </div>
              ) : (
                filteredPlaylists.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-[8px] rounded-item hover:bg-fill-hover transition-colors group"
                  >
                    <div className="flex items-center gap-[12px] min-w-0">
                      <div className="relative h-[44px] w-[44px] rounded-item bg-fill overflow-hidden shrink-0 flex items-center justify-center">
                        {item.imageUrl ? (
                          <AppImage src={item.imageUrl} alt={item.title} fill />
                        ) : (
                          <MusicLine size={20} className="text-text-tertiary" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium text-text-primary truncate">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-text-tertiary truncate">
                          {t("common.tracks", { count: item.trackCount }) ||
                            `${item.trackCount} músicas`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={importingUrl !== null}
                      onClick={() => handleSelect(item.spotifyUrl, item.title)}
                      className="flex h-[32px] w-[32px] items-center justify-center rounded-control bg-fill hover:bg-[#1ED760] text-text-secondary hover:text-black transition-colors border-none cursor-pointer shrink-0 disabled:opacity-50"
                      title={t("common.import") || "Importar"}
                    >
                      <AddLine size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
