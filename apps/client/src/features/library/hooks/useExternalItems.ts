import { useEffect } from "react";
import { api, mediaUrl, toMaxQualityAvatarUrl } from "@/shared/api";
import {
  freshFor,
  revalidateResource,
  useCachedResource,
} from "@/shared/cache/useCachedResource";
import { useSessionOwner } from "@/features/home/hooks/sessionAwareLoad";
import type { LibraryItemViewModel } from "../types";

export type EntityType = "album" | "artist" | "playlist";

const EMPTY_ITEMS: LibraryItemViewModel[] = [];
const SAVED_ITEMS_POLICY = { isFresh: freshFor(5 * 60_000) };

async function loadSavedItems(
  type: EntityType,
): Promise<LibraryItemViewModel[]> {
  const collectionType =
    type === "album" ? "albums" : type === "artist" ? "artists" : "playlists";
  try {
    const response = await api.listSavedCollections(collectionType);
    const items: LibraryItemViewModel[] = [];
    for (const raw of response?.items || []) {
      const entry = (raw ?? {}) as Record<string, any>;
      const value = (entry[type] ?? entry) as Record<string, any>;
      if (!value) continue;
      const rawCover =
        value?.cover?.url
          ? mediaUrl(value.cover.url)
          : typeof value?.coverUrl === "string"
            ? value.coverUrl
            : "";
      const cover =
        type === "artist" ? toMaxQualityAvatarUrl(rawCover) : rawCover;
      const id = String(value.id || entry.id || "");
      if (!id) continue;
      const title =
        type === "artist"
          ? (value.name || value.title || id)
          : (value.title || value.name || id);
      items.push({
        id,
        title,
        subtitle:
          type === "artist"
            ? "Artist"
            : type === "playlist"
              ? value.author ||
                (value.trackCount ? `${value.trackCount} tracks` : "Playlist")
              : [
                  value.year,
                  value.trackCount ? `${value.trackCount} tracks` : undefined,
                ]
                  .filter(Boolean)
                  .join(" • "),
        imageUrl: cover,
        kind: type,
        href:
          type === "artist"
            ? `/artist?id=${encodeURIComponent(id)}`
            : type === "playlist"
              ? `/collection?type=playlist&id=${encodeURIComponent(id)}`
              : `/collection?type=album&id=${encodeURIComponent(id)}`,
        addedAt: entry.savedAt || new Date().toISOString(),
        ...(value.trackCount !== undefined ? { trackCount: value.trackCount } : {}),
        isOwned: false,
      });
    }
    return items;
  } catch {
    return EMPTY_ITEMS;
  }
}

export function useExternalItems(type: EntityType) {
  const owner = useSessionOwner();
  const key = `library:saved:${type}:${owner}`;
  const { data, isLoading } = useCachedResource(
    key,
    () => loadSavedItems(type),
    SAVED_ITEMS_POLICY,
  );

  useEffect(() => {
    const refresh = () =>
      void revalidateResource(key, () => loadSavedItems(type), { force: true });
    window.addEventListener("library:changed", refresh);
    return () => window.removeEventListener("library:changed", refresh);
  }, [key, type]);

  return { data: data ?? EMPTY_ITEMS, isLoading };
}
