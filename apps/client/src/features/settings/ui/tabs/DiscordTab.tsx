import { useState, useEffect } from "react";
import { useTranslation } from "@/languages";
import {
  DiscordAccountCard,
  useDiscordSettingsStore,
  type DiscordStatusDisplayType,
} from "@/features/discord";
import { ToggleSwitch, MenuSelect } from "@/shared/ui";
import { SettingRow, SettingSection } from "../controls";

export function DiscordTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  const enabled = useDiscordSettingsStore((s) => s.enabled);
  const setEnabled = useDiscordSettingsStore((s) => s.setEnabled);

  const statusDisplayType = useDiscordSettingsStore((s) => s.statusDisplayType);
  const setStatusDisplayType = useDiscordSettingsStore(
    (s) => s.setStatusDisplayType,
  );

  const showTime = useDiscordSettingsStore((s) => s.showTime);
  const setShowTime = useDiscordSettingsStore((s) => s.setShowTime);

  const showArtwork = useDiscordSettingsStore((s) => s.showArtwork);
  const setShowArtwork = useDiscordSettingsStore((s) => s.setShowArtwork);

  const showArtistSmallImage = useDiscordSettingsStore(
    (s) => s.showArtistSmallImage,
  );
  const setShowArtistSmallImage = useDiscordSettingsStore(
    (s) => s.setShowArtistSmallImage,
  );

  const showPaused = useDiscordSettingsStore((s) => s.showPaused);
  const setShowPaused = useDiscordSettingsStore((s) => s.setShowPaused);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col gap-[28px]">
      {!searchQuery?.trim() && <DiscordAccountCard />}

      {/* Main enable switch */}
      <SettingSection>
        <SettingRow
          title={t("settings.discord.enable.title") || "Discord Rich Presence"}
          description={
            t("settings.discord.enable.description") ||
            "Broadcast your active music playback to your Discord profile."
          }
          titleKey="settings.discord.enable.title"
          descKey="settings.discord.enable.description"
          searchQuery={searchQuery}
          control={<ToggleSwitch checked={enabled} onChange={setEnabled} />}
        />
      </SettingSection>

      {/* Display Options */}
      <SettingSection
        label={t("settings.discord.section_display") || "Display Options"}
      >
        {/* Status Line Format */}
        <SettingRow
          title={t("settings.discord.status_display.title") || "Status Format"}
          description={
            t("settings.discord.status_display.description") ||
            "Choose what appears in Discord's 'Listening to...' status header."
          }
          explained
          titleKey="settings.discord.status_display.title"
          descKey="settings.discord.status_display.description"
          searchQuery={searchQuery}
          control={
            mounted ? (
              <MenuSelect<DiscordStatusDisplayType>
                aria-label={
                  t("settings.discord.status_display.title") || "Status Format"
                }
                className="w-[210px]"
                value={statusDisplayType}
                onChange={setStatusDisplayType}
                disabled={!enabled}
                options={[
                  {
                    value: "artist",
                    label:
                      t("settings.discord.status_display.artist") ||
                      "Artist (Default)",
                  },
                  {
                    value: "title",
                    label:
                      t("settings.discord.status_display.song") || "Song Title",
                  },
                  {
                    value: "artist_title",
                    label:
                      t("settings.discord.status_display.artist_song") ||
                      "Artist - Song",
                  },
                  {
                    value: "title_artist",
                    label:
                      t("settings.discord.status_display.song_artist") ||
                      "Song - Artist",
                  },
                  {
                    value: "app",
                    label:
                      t("settings.discord.status_display.app") ||
                      "OFFY (App name)",
                  },
                ]}
              />
            ) : (
              <span />
            )
          }
        />

        {/* Timeline progress bar */}
        <SettingRow
          title={
            t("settings.discord.show_timeline.title") || "Playback Timeline"
          }
          description={
            t("settings.discord.show_timeline.description") ||
            "Display interactive progress bar with elapsed and remaining track time."
          }
          explained
          titleKey="settings.discord.show_timeline.title"
          descKey="settings.discord.show_timeline.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showTime}
              onChange={setShowTime}
              disabled={!enabled}
            />
          }
        />

        {/* Track artwork */}
        <SettingRow
          title={t("settings.discord.show_artwork.title") || "Track Artwork"}
          description={
            t("settings.discord.show_artwork.description") ||
            "Show track or album cover in the Discord activity card."
          }
          titleKey="settings.discord.show_artwork.title"
          descKey="settings.discord.show_artwork.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showArtwork}
              onChange={setShowArtwork}
              disabled={!enabled}
            />
          }
        />

        {/* Artist small image */}
        <SettingRow
          title={
            t("settings.discord.show_artist_image.title") ||
            "Artist Photo Badge"
          }
          description={
            t("settings.discord.show_artist_image.description") ||
            "Display the artist photo in a small circular badge on the bottom corner."
          }
          explained
          titleKey="settings.discord.show_artist_image.title"
          descKey="settings.discord.show_artist_image.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showArtistSmallImage}
              onChange={setShowArtistSmallImage}
              disabled={!enabled}
            />
          }
        />

        {/* Show when paused */}
        <SettingRow
          title={t("settings.discord.show_paused.title") || "Show when Paused"}
          description={
            t("settings.discord.show_paused.description") ||
            "Keep status visible on Discord with a paused indicator when music is paused."
          }
          explained
          titleKey="settings.discord.show_paused.title"
          descKey="settings.discord.show_paused.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showPaused}
              onChange={setShowPaused}
              disabled={!enabled}
            />
          }
        />
      </SettingSection>
    </div>
  );
}
