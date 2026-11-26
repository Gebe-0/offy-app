import { useLocation, useNavigate } from "react-router-dom";
import { HeartFill, Music2Line } from "@mingcute/react";
import { usePlaylistsList } from "@/features/library/hooks/usePlaylists";
import { CoverImage } from "@/features/covers";
import { Tooltip } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { cn } from "@/shared/lib";

export function SidebarShortcuts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: playlistData } = usePlaylistsList();
  const playlists = playlistData?.playlists ?? [];

  const isLikedActive = location.pathname === "/library/saved";
  const currentPlaylistId =
    location.pathname === "/library/playlist"
      ? new URLSearchParams(location.search).get("id")
      : null;

  return (
    <div className="flex flex-1 min-h-0 w-full flex-col items-center">
      <div className="my-[12px] h-px w-[24px] shrink-0 bg-white/[0.1]" />

      <div className="flex flex-1 min-h-0 w-full flex-col items-center gap-[10px] overflow-y-auto px-[6px] pb-[8px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Liked Songs */}
        <Tooltip
          content={t("library.liked_songs") || "Músicas Curtidas"}
          side="right"
          sideOffset={12}
        >
          <button
            type="button"
            onClick={() => navigate("/library/saved")}
            className={cn(
              "relative flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] border-0 cursor-pointer transition-all duration-150 active:scale-[0.95]",
              "bg-gradient-to-br from-[#3b3f7a] via-[#272b59] to-[#1a1d3d] text-white/90 hover:brightness-110",
              isLikedActive && "ring-2 ring-white/80",
            )}
          >
            <HeartFill size={18} />
          </button>
        </Tooltip>

        {/* User Playlists */}
        {playlists.map((pl) => {
          const isActive = currentPlaylistId === pl.id;
          const covers = pl.coverUrls?.filter(Boolean) ?? [];
          const hasCollage = covers.length >= 4;
          const singleCover = pl.coverUrl || covers[0] || "";

          return (
            <Tooltip
              key={pl.id}
              content={pl.title}
              side="right"
              sideOffset={12}
            >
              <button
                type="button"
                onClick={() =>
                  navigate(`/library/playlist?id=${encodeURIComponent(pl.id)}`)
                }
                className={cn(
                  "relative h-[40px] w-[40px] shrink-0 overflow-hidden rounded-[10px] border-0 bg-white/[0.06] p-0 cursor-pointer transition-all duration-150 hover:brightness-110 active:scale-[0.95]",
                  isActive && "ring-2 ring-white/80",
                )}
              >
                {hasCollage ? (
                  <div className="grid h-full w-full grid-cols-2 grid-rows-2">
                    {covers.slice(0, 4).map((url, idx) => (
                      <CoverImage
                        key={`${pl.id}-${idx}`}
                        src={url}
                        alt=""
                        width={20}
                        height={20}
                        className="h-full w-full object-cover"
                      />
                    ))}
                  </div>
                ) : singleCover ? (
                  <CoverImage
                    src={singleCover}
                    alt={pl.title}
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-text-tertiary">
                    <Music2Line size={18} />
                  </div>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
