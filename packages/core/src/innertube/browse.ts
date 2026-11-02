import type {
  AlbumDetails,
  ApiArtistDetails,
  ApiTrack,
  ArtistAlbum,
  CatalogPlaylistDetails,
  Cover,
  TrackArtist,
} from "@offy/contracts";
import { asArray, asRecord, num, str, type JsonRecord } from "../json.js";
import { postInnertube } from "./client.js";
import { CATALOG_PROFILE } from "./profiles.js";

const ARTWORK_HOST = /(?:[a-zA-Z0-9_-]+\.googleusercontent\.com|yt3\.ggpht\.com)/i;

export function cover(url: string | undefined, size = 544): Cover | undefined {
  if (!url) return undefined;
  if (!ARTWORK_HOST.test(url)) return { url, width: size, height: size };
  const suffix = `=w${size}-h${size}-l90-rj`;
  const base = /=w\d+-h\d+/.test(url)
    ? url.replace(/=w\d+-h\d+(?:-[a-zA-Z0-9_-]+)*/, suffix)
    : /=s\d+/.test(url)
      ? url.replace(/=s\d+(?:-[a-zA-Z0-9_-]+)*/, suffix)
      : `${url}${suffix}`;
  return { url: base, width: size, height: size };
}

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

export function artistsFrom(runsInput: JsonRecord[]): TrackArtist[] {
  return runsInput.flatMap((run) => {
    const endpoint = browseEndpoint(run);
    const name = str(run.text)?.trim();
    const type = pageType(endpoint);
    return name && typeof endpoint?.browseId === "string" && (type === "MUSIC_PAGE_TYPE_ARTIST" || type === "MUSIC_PAGE_TYPE_USER_CHANNEL")
      ? [{ id: endpoint.browseId, name }]
      : [];
  });
}

export function durationMs(value: string | undefined): number {
  if (!value) return 0;
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return 0;
  const values = parts.map(Number);
  if (values.some((entry) => !Number.isFinite(entry))) return 0;
  const seconds = values[values.length - 1]!;
  const minutes = values[values.length - 2]!;
  const hours = parts.length === 3 ? values[0]! : 0;
  if (seconds > 59) return 0;
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function bestThumbnail(value: unknown): string | undefined {
  const record = asRecord(value);
  const inner = asRecord(asRecord(record?.musicThumbnailRenderer)?.thumbnail) ?? record;
  const entries = asArray(inner?.thumbnails)
    .map(asRecord)
    .flatMap((entry) => (entry && str(entry.url) ? [{ url: str(entry.url)!, size: num(entry.width) ?? 0 }] : []))
    .sort((a, b) => b.size - a.size);
  const best = entries.find((entry) => ARTWORK_HOST.test(entry.url)) ?? entries[0];
  return best?.url;
}

function watchId(value: unknown): string | undefined {
  return str(asRecord(asRecord(value)?.watchEndpoint)?.videoId);
}

function mapRowTrack(raw: unknown): ApiTrack | null {
  const renderer = asRecord(asRecord(raw)?.musicResponsiveListItemRenderer);
  if (!renderer) return null;

  const column = (index: number) =>
    asRecord(asRecord(asArray(renderer.flexColumns)[index])?.musicResponsiveListItemFlexColumnRenderer?.text);

  const titleColumn = column(0);
  const title = text(titleColumn);
  const titleRun = runs(titleColumn)[0];

  const overlay = asRecord(asRecord(asRecord(renderer.overlay)?.musicItemThumbnailOverlayRenderer)?.content);
  const id =
    str(asRecord(renderer.playlistItemData)?.videoId) ??
    watchId(titleRun?.navigationEndpoint) ??
    watchId(asRecord(overlay?.musicPlayButtonRenderer)?.playNavigationEndpoint) ??
    watchId(renderer.onTap);
  if (!id || !title) return null;

  const meta = asArray(renderer.flexColumns).flatMap((_, index) => runs(column(index + 1)));
  const artists = artistsFrom(asArray(renderer.flexColumns).flatMap((_, index) => runs(column(index))));
  const total = meta.map((run) => durationMs(str(run.text))).find((value) => value > 0) ?? 0;

  return {
    id,
    title,
    artists: artists.length > 0 ? artists : [{ id: "unknown", name: "Unknown Artist" }],
    durationMs: total,
    cover: cover(bestThumbnail(renderer.thumbnail) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
  };
}

function shelfContents(response: unknown): unknown[] {
  const sections = asArray(asRecord(asRecord(response)?.contents)?.singleColumnBrowseResultsRenderer?.tabs);
  const content = asRecord(asRecord(asArray(sections)[0])?.tabRenderer)?.content;
  const list = asArray(asRecord(content?.sectionListRenderer)?.contents);
  return list.flatMap((section) => {
    const record = asRecord(section);
    const shelf = asRecord(record?.musicShelfRenderer);
    if (Array.isArray(shelf?.contents)) return shelf.contents;
    const playlistShelf = asRecord(record?.musicPlaylistShelfRenderer);
    if (Array.isArray(playlistShelf?.contents)) return playlistShelf.contents;
    return asArray(asRecord(record?.musicCarouselShelfRenderer)?.contents);
  });
}

function headerOf(response: unknown): JsonRecord | undefined {
  const header = asRecord(asRecord(response)?.header);
  if (!header) return undefined;
  return (
    asRecord(header.musicDetailHeaderRenderer) ??
    asRecord(header.musicImmersiveHeaderRenderer) ??
    asRecord(header.musicVisualHeaderRenderer)
  );
}

function uniqueTracks(items: unknown[]): ApiTrack[] {
  const seen = new Set<string>();
  const out: ApiTrack[] = [];
  for (const item of items) {
    const track = mapRowTrack(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

async function browse(browseId: string, signal?: AbortSignal): Promise<unknown> {
  return postInnertube(CATALOG_PROFILE, "browse", { browseId }, { signal });
}

export async function browseAlbum(id: string, signal?: AbortSignal): Promise<AlbumDetails | null> {
  const response = await browse(id, signal);
  const header = headerOf(response);
  const title = text(header?.title);
  if (!title) return null;

  const subtitleRuns = asArray(asRecord(header?.subtitle)?.runs)
    .map(asRecord)
    .filter((run): run is JsonRecord => Boolean(run));
  const artists = artistsFrom(subtitleRuns);
  const year = subtitleRuns
    .map((run) => Number(str(run.text)))
    .find((value) => Number.isInteger(value) && value > 1900);
  const tracks = uniqueTracks(shelfContents(response));

  return {
    type: "album",
    id,
    title,
    artists,
    ...(year ? { year } : {}),
    cover: cover(bestThumbnail(header?.thumbnail)),
    trackCount: tracks.length,
    durationMs: tracks.reduce((total, track) => total + track.durationMs, 0),
    tracks,
  };
}

export async function browsePlaylist(id: string, signal?: AbortSignal): Promise<CatalogPlaylistDetails | null> {
  const response = await browse(id, signal);
  const header = headerOf(response);
  const title = text(header?.title);
  if (!title) return null;
  const subtitle = text(header?.subtitle);
  const tracks = uniqueTracks(shelfContents(response));

  return {
    type: "playlist",
    id,
    title,
    ...(subtitle ? { author: subtitle } : {}),
    ...(text(header?.description) ? { description: text(header?.description) } : {}),
    cover: cover(bestThumbnail(header?.thumbnail)),
    trackCount: tracks.length,
    durationMs: tracks.reduce((total, track) => total + track.durationMs, 0),
    tracks,
  };
}

export async function browseArtist(id: string, signal?: AbortSignal): Promise<ApiArtistDetails | null> {
  const response = await browse(id, signal);
  const header = headerOf(response);
  const name = text(header?.title);
  if (!name) return null;

  const tracks = uniqueTracks(shelfContents(response));
  const albums: ArtistAlbum[] = [];
  const singles: ArtistAlbum[] = [];
  const allSections = asArray(
    asRecord(asRecord(asRecord(response)?.contents)?.singleColumnBrowseResultsRenderer?.tabs)?.[0],
  );

  void allSections;

  return {
    type: "artist",
    id,
    name,
    verified: false,
    cover: cover(bestThumbnail(header?.thumbnail)),
    tracks,
    albums,
    singles: singles.map((album) => ({ ...album, releaseType: "single" as const })),
    ...(text(header?.description) ? { bio: text(header?.description) } : {}),
  };
}
