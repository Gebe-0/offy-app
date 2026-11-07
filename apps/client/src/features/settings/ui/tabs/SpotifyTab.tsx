import { useState } from "react";
import {
  DownloadLine,
  HeartFill,
  Playlist2Fill,
  Refresh1Line,
} from "@mingcute/react";
import { useTranslation } from "@/languages";
import { ToggleSwitch, useToast } from "@/shared/ui";
import { useSpotifyPreferences } from "@/shared/spotify";
import { SpotifyAccountCard, useSpotifyAccount } from "@/features/spotify-auth";
import { useImportStore } from "@/features/library";
import { SettingRow, SettingSection } from "../controls";

export function SpotifyTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { signedIn } = useSpotifyAccount();

  const syncLibrary = useSpotifyPreferences((s) => s.syncLibrary);
  const setSyncLibrary = useSpotifyPreferences((s) => s.setSyncLibrary);
  const syncLikedSongs = useSpotifyPreferences((s) => s.syncLikedSongs);
  const setSyncLikedSongs = useSpotifyPreferences((s) => s.setSyncLikedSongs);
  const useAccountForImport = useSpotifyPreferences(
    (s) => s.useAccountForImport,
  );
  const setUseAccountForImport = useSpotifyPreferences(
    (s) => s.setUseAccountForImport,
  );

  const [syncingLikes, setSyncingLikes] = useState(false);

  const handleSyncLikes = async () => {
    if (!signedIn) {
      toast(
        t("settings.spotify.sign_in_required") ||
          "Conecte sua conta do Spotify primeiro.",
        "error",
      );
      return;
    }

    setSyncingLikes(true);
    try {
      await useImportStore
        .getState()
        .startImport("https://open.spotify.com/collection/tracks");
      toast(
        t("settings.spotify.sync_started") ||
          "Importação das Músicas Curtidas iniciada!",
        "checkmark",
      );
    } catch (err) {
      toast(
        t("settings.spotify.sync_failed") ||
          "Falha ao iniciar sincronização das músicas curtidas.",
        "error",
      );
    } finally {
      setSyncingLikes(false);
    }
  };

  return (
    <div className="flex flex-col gap-[28px]">
      {!searchQuery?.trim() && <SpotifyAccountCard />}

      <SettingSection
        label={t("settings.spotify.section_likes") || "Músicas Curtidas"}
      >
        <SettingRow
          title={
            t("settings.spotify.sync_likes.title") ||
            "Sincronizar Músicas Curtidas"
          }
          description={
            t("settings.spotify.sync_likes.description") ||
            "Cria e sincroniza suas músicas curtidas em uma playlist dedicada 'Músicas Curtidas (Spotify)'."
          }
          explained
          icon={<HeartFill size={20} className="text-[#1ED760]" />}
          titleKey="settings.spotify.sync_likes.title"
          descKey="settings.spotify.sync_likes.description"
          searchQuery={searchQuery}
          control={
            <button
              type="button"
              onClick={handleSyncLikes}
              disabled={syncingLikes || !signedIn}
              className="flex items-center gap-[6px] px-[14px] py-[6px] rounded-item bg-fill hover:bg-fill-hover text-text-primary text-[13px] font-medium transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Refresh1Line
                size={14}
                className={syncingLikes ? "animate-spin" : ""}
              />
              <span>
                {syncingLikes
                  ? t("settings.spotify.syncing") || "Sincronizando..."
                  : t("settings.spotify.sync_now") || "Sincronizar agora"}
              </span>
            </button>
          }
        />
      </SettingSection>

      <SettingSection
        label={t("settings.spotify.section_library") || "Biblioteca"}
      >
        <SettingRow
          title={
            t("settings.spotify.sync_library.title") || "Sincronizar biblioteca"
          }
          description={
            t("settings.spotify.sync_library.description") ||
            "Exibe as playlists da sua conta do Spotify na biblioteca ao lado das playlists do OFFY."
          }
          icon={<Playlist2Fill size={20} />}
          titleKey="settings.spotify.sync_library.title"
          descKey="settings.spotify.sync_library.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={syncLibrary}
              onChange={setSyncLibrary}
              disabled={!signedIn}
            />
          }
        />
      </SettingSection>

      <SettingSection
        label={t("settings.spotify.section_import") || "Importação"}
      >
        <SettingRow
          title={
            t("settings.spotify.full_import.title") ||
            "Importar faixas completas"
          }
          description={
            t("settings.spotify.full_import.description") ||
            "Utiliza sua sessão do Spotify para carregar todas as músicas de playlists longas (mais de 100 músicas) sem limitações."
          }
          explained
          icon={<DownloadLine size={20} />}
          titleKey="settings.spotify.full_import.title"
          descKey="settings.spotify.full_import.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={useAccountForImport}
              onChange={setUseAccountForImport}
              disabled={!signedIn}
            />
          }
        />
      </SettingSection>
    </div>
  );
}
