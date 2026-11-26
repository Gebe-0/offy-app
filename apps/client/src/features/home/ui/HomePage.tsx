import { useState, useEffect } from "react";
import PopularTracksSection from "./PopularTracksSection";
import ListeningNowSection from "./ListeningNowSection";
import HomePageSkeleton from "./HomePageSkeleton";
import { useRecentlyPlayed } from "../hooks/useRecentlyPlayed";
import { useListeningNow } from "../hooks/useListeningNow";
import { useTranslation } from "@/languages";
import { usePageBackdrop } from "@/shared/lib";
import { FireFill, Music2Fill, TimeFill, SearchLine } from "@mingcute/react";

export default function HomePage() {
  const [attempt, setAttempt] = useState(0);
  return <HomeFeed key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

function HomeFeed({ onRetry: _onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  const { tracks: listeningNow, isLoading: listeningLoading } =
    useListeningNow();
  const { data: recentlyPlayed, isLoading: recentLoading } =
    useRecentlyPlayed(20);
  const hasListeningNow = listeningNow.length > 0;
  const hasRecent = Boolean(recentlyPlayed && recentlyPlayed.length > 0);
  const backdropCover =
    listeningNow[0]?.coverUrl ||
    recentlyPlayed?.[0]?.item?.coverUrl ||
    undefined;
  usePageBackdrop(
    backdropCover,
    backdropCover ? { blur: 64, dim: 0.28 } : undefined,
  );

  const isDataLoading = listeningLoading || recentLoading;
  const isReady = !isDataLoading;
  const isEmpty = !hasListeningNow && !hasRecent;
  const [skeletonExited, setSkeletonExited] = useState(() => !isDataLoading);

  useEffect(() => {
    if (isReady && !skeletonExited) {
      const timer = setTimeout(() => {
        setSkeletonExited(true);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isReady, skeletonExited]);

  return (
    <div className="relative h-full w-full overflow-y-auto overflow-x-hidden bg-transparent pt-(--page-inset-top) pb-(--page-inset-bottom)">
      <div className="relative z-1 grid grid-cols-1 items-start w-full">
        {isReady && isEmpty && (
          <div className="col-start-1 row-start-1 flex min-h-[60vh] w-full flex-col items-center justify-center gap-[12px] px-[24px] text-center">
            <div className="flex size-[56px] items-center justify-center rounded-full bg-fill-subtle text-accent-primary">
              <Music2Fill size={28} />
            </div>
            <span className="text-title font-[600] text-text-primary text-[20px]">
              {t("home.welcome_title") || "Sua música começa aqui"}
            </span>
            <span className="text-body text-text-secondary max-w-[420px] text-[14px] leading-relaxed">
              {t("home.welcome_desc") ||
                "Busque e reproduza seus artistas favoritos. Conforme você ouve, suas faixas e histórico personalizado aparecerão aqui."}
            </span>
            <button
              type="button"
              onClick={() => {
                const searchBtn = document.querySelector<HTMLButtonElement>(
                  'button[aria-label*="Search"], button[aria-label*="search"], button[data-search-trigger]',
                );
                if (searchBtn) searchBtn.click();
                const searchInput = document.querySelector<HTMLInputElement>(
                  'input[type="search"], input[placeholder*="Search"], input[placeholder*="Buscar"]',
                );
                if (searchInput) {
                  searchInput.focus();
                }
              }}
              className="mt-[8px] flex h-[40px] items-center gap-[8px] rounded-[10px] bg-accent-primary px-[18px] text-[14px] font-[500] text-text-on-accent transition-transform active:scale-[0.98] hover:opacity-90 cursor-pointer"
            >
              <SearchLine size={16} />
              <span>{t("home.explore_music") || "Buscar músicas"}</span>
            </button>
          </div>
        )}

        {isReady && !isEmpty && (
          <div className="col-start-1 row-start-1 w-full pb-[16px]">
            {hasListeningNow && (
              <div style={{ animation: "page-enter 200ms ease-out" }}>
                <ListeningNowSection
                  title={t("home.listeningNow") || "Ouvindo agora"}
                  icon={<FireFill />}
                  tracks={listeningNow}
                  headingMarginTop="mt-0"
                />
              </div>
            )}

            {hasRecent && (
              <PopularTracksSection
                title={t("home.jumpBackIn")}
                icon={<TimeFill />}
                items={recentlyPlayed}
                headingMarginTop={hasListeningNow ? "mt-[22px]" : "mt-0"}
              />
            )}
          </div>
        )}

        {!skeletonExited && (
          <div
            className={`col-start-1 row-start-1 w-full z-10 transition-opacity duration-300 ease-out ${
              isReady
                ? "opacity-0 pointer-events-none"
                : "opacity-100 pointer-events-auto"
            }`}
            onTransitionEnd={(event) => {
              if (event.target === event.currentTarget) setSkeletonExited(true);
            }}
          >
            <HomePageSkeleton />
          </div>
        )}
      </div>
    </div>
  );
}
