import type { SearchResult, SearchType } from "@offy/contracts";
import { asArray, asRecord, str, type JsonRecord } from "../json.js";
import { artistsFrom, cover, durationMs } from "./browse.js";
import { postInnertube } from "./client.js";
import { CATALOG_PROFILE } from "./profiles.js";

const SEARCH_PARAMS: Record<Exclude<SearchType, "all">, string> = {
  track: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
  artist: "EgWKAQIgAWoKEAkQBRAKEAMQBA%3D%3D",
  album: "EgWKAQIYAWoKEAkQBRAKEAMQBA%3D%3D",
  playlist: "EgWKAQIoAWoKEAkQBRAKEAMQBA%3D%3D",
};

const TYPE_TOKENS = new Set(["song", "video", "single", "ep", "album", "playlist", "artist"]);

function runs(value: unknown): JsonRecord[] {
  return asArray(asRecord(value)?.runs)
    .map(asRecord)
    .filter((run): run is JsonRecord => Boolean(run));
}

function text(value: unknown): string | undefined {
  const record = asRecord(value);
  if (str(record?.simpleText)) return str(record?.simpleText)!.trim();
  const joined = runs(value)
    .map((run) => run.text)
    .filter((part): part is string => typeof part === "string")
    .join("")
    .trim();
  return joined || undefined;
}

function browseEndpoint(value: unknown): JsonRecord | undefined {
  return asRecord(asRecord(asRecord(value)?.navigationEndpoint)?.browseEndpoint);
}

function pageType(endpoint: JsonRecord | undefined): string | undefined {
  return str(
    asRecord(asRecord(endpoint?.browseEndpointContextSupportedConfigs)?.browseEndpointContextMusicConfig)?.pageType,
  );
}

function textArtists(input: JsonRecord[], title: string): string[] {
  return input
    .map((run) => str(run.text)?.trim())
    .filter((value): value is string => {
      if (!value || value === "•" || value === title) return false;
      if (/^\d+:\d+$/.test(value)) return false;
      if (TYPE_TOKENS.has(value.toLowerCase())) return false;
      if (/^\d{4}$/.test(value)) return false;
      if (/^\d+(?:[.,]\d+)?[KMB]?\s+(?:plays?|views?|reprodu)/i.test(value)) return false;
      return true;
    });
}

function column(renderer: JsonRecord, index: number): JsonRecord | undefined {
  const entry = asRecord(asArray(renderer.flexColumns)[index]);
  return asRecord(asRecord(entry?.musicResponsiveListItemFlexColumnRenderer)?.text);
}

function fixedColumn(renderer: JsonRecord, index: number): JsonRecord | undefined {
  const entry = asRecord(asArray(renderer.fixedColumns)[index]);
  return asRecord(asRecord(entry?.musicResponsiveListItemFixedColumnRenderer)?.text);
}

function watchId(value: unknown): string | undefined {
  return str(asRecord(asRecord(value)?.watchEndpoint)?.videoId);
}

function videoIdOf(renderer: JsonRecord, titleRun: JsonRecord | undefined): string | undefined {
  const fromPlaylist = str(asRecord(renderer.playlistItemData)?.videoId);
  if (fromPlaylist) return fromPlaylist;
  const overlay = asRecord(asRecord(asRecord(renderer.overlay)?.musicItemThumbnailOverlayRenderer)?.content);
  return (
    watchId(titleRun?.navigationEndpoint) ??
    watchId(asRecord(overlay?.musicPlayButtonRenderer)?.playNavigationEndpoint) ??
    watchId(renderer.onTap) ??
    watchId(renderer.navigationEndpoint)
  );
}

function bestThumbnail(value: unknown): string | undefined {
  const record = asRecord(value);
  const inner = asRecord(asRecord(record?.musicThumbnailRenderer)?.thumbnail) ?? record;
  const entries = asArray(inner?.thumbnails)
    .map(asRecord)
    .flatMap((entry) => (entry && str(entry.url) ? [{ url: str(entry.url)!, size: Number(entry.width ?? 0) }] : []))
    .sort((a, b) => b.size - a.size);
  return entries[0]?.url;
}

function mapTrack(renderer: JsonRecord): SearchResult | null {
  const titleColumn = column(renderer, 0);
  const title = text(titleColumn);
  const id = videoIdOf(renderer, runs(titleColumn)[0]);
  if (!id || !title) return null;

  const allRuns = asArray(renderer.flexColumns).flatMap((_, index) => runs(column(renderer, index)));
  const metaRuns = asArray(renderer.flexColumns)
    .slice(1)
    .flatMap((_, index) => runs(column(renderer, index + 1)));
  const fixedRuns = asArray(renderer.fixedColumns).flatMap((_, index) => runs(fixedColumn(renderer, index)));

  const linked = artistsFrom(allRuns);
  const fallback = textArtists(metaRuns, title);
  const artists =
    linked.length > 0
      ? linked
      : (fallback.length > 0 ? fallback.slice(0, 3) : ["Unknown Artist"]).map((name) => ({ id: "unknown", name }));

  const total =
    [...allRuns, ...fixedRuns].map((run) => durationMs(str(run.text))).find((value) => value > 0) ?? 0;

  return {
    type: "track",
    id,
    title,
    artists,
    durationMs: total,
    cover: cover(bestThumbnail(renderer.thumbnail) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
  };
}

function mapListRow(renderer: JsonRecord): SearchResult | null {
  const endpoint = browseEndpoint(renderer);
  const browseId = str(endpoint?.browseId);
  const title = text(column(renderer, 0));
  if (!browseId || !title) return null;

  const type = pageType(endpoint);
  const art = cover(bestThumbnail(renderer.thumbnail));
  const metaRuns = runs(column(renderer, 1));

  if (type === "MUSIC_PAGE_TYPE_ARTIST" || type === "MUSIC_PAGE_TYPE_USER_CHANNEL") {
    return { type: "artist", id: browseId, name: title, ...(art ? { cover: art } : {}) };
  }
  if (type === "MUSIC_PAGE_TYPE_ALBUM") {
    const year = metaRuns
      .map((run) => Number(str(run.text)))
      .find((value) => Number.isInteger(value) && value > 1900);
    return {
      type: "album",
      id: browseId,
      title,
      artists: artistsFrom(metaRuns),
      ...(year ? { year } : {}),
      ...(art ? { cover: art } : {}),
    };
  }
  if (type === "MUSIC_PAGE_TYPE_PLAYLIST") {
    const author = textArtists(metaRuns, title)[0];
    return { type: "playlist", id: browseId, title, ...(author ? { author } : {}), ...(art ? { cover: art } : {}) };
  }
  return null;
}

function searchItems(response: unknown): unknown[] {
  const tabs = asArray(asRecord(asRecord(asRecord(response)?.contents)?.tabbedSearchResultsRenderer)?.tabs);
  const content = asRecord(asRecord(asRecord(tabs[0])?.tabRenderer)?.content);
  const sections = asRecord(content?.sectionListRenderer)?.contents;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    const record = asRecord(section);
    const shelf = asRecord(record?.musicShelfRenderer);
    if (Array.isArray(shelf?.contents)) return shelf.contents;
    const card = asRecord(record?.musicCardShelfRenderer);
    if (card) return [card, ...asArray(card.contents)];
    return asArray(asRecord(record?.itemSectionRenderer)?.contents);
  });
}

export async function search(query: string, type: SearchType = "all", signal?: AbortSignal): Promise<SearchResult[]> {
  const params = type === "all" ? undefined : SEARCH_PARAMS[type];
  const body = await postInnertube(CATALOG_PROFILE, "search", { query, ...(params ? { params } : {}) }, { signal });

  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const item of searchItems(body)) {
    const record = asRecord(item);
    if (!record) continue;
    const renderer = asRecord(record.musicResponsiveListItemRenderer);
    if (!renderer) continue;

    const mapped = mapTrack(renderer) ?? mapListRow(renderer);
    if (!mapped) continue;
    const key = `${mapped.type}:${mapped.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(mapped);
  }

  return results.filter((item) => type === "all" || item.type === type);
}
