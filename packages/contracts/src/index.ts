export interface Cover {
  url: string;
  width: number;
  height: number;
  fallbackUrl?: string;
}

export interface TrackArtist {
  id: string;
  name: string;
}

export interface TrackAlbum {
  id: string;
  title: string;
}

export type TrackAudioVariant = "music-video" | "premium-only";

export interface Track {
  id: string;
  title: string;
  artists: TrackArtist[];
  album?: TrackAlbum;
  durationMs: number;
  cover?: Cover;
  explicit?: boolean;
  audioVariant?: TrackAudioVariant;
}

export interface ApiTrack extends Track {
  type?: "track";
  viewer?: { liked: boolean };
}

export interface TrackDetails extends Track {
  description?: string;
  releaseDate?: string;
  viewer?: { liked: boolean };
  relatedTracks?: Track[];
}

export type ApiTrackDetails = TrackDetails;

export type SearchType = "all" | "track" | "artist" | "album" | "playlist";

export interface SearchArtistItem {
  type: "artist";
  id: string;
  name: string;
  cover?: Cover;
}

export interface SearchAlbumItem {
  type: "album";
  id: string;
  title: string;
  artists: { id: string; name: string }[];
  year?: number;
  cover?: Cover;
}

export interface SearchPlaylistItem {
  type: "playlist";
  id: string;
  title: string;
  author?: string;
  cover?: Cover;
}

export type SearchResult =
  | (Track & { type: "track"; viewer?: { liked: boolean } })
  | SearchArtistItem
  | SearchAlbumItem
  | SearchPlaylistItem;

export type SearchResponse = { items: SearchResult[] };

export interface ArtistAlbum {
  id: string;
  title: string;
  year?: number;
  cover?: Cover;
  explicit?: boolean;
  totalTracks?: number;
  trackCount?: number;
}

export interface ArtistRelease extends ArtistAlbum {
  releaseType: "single" | "ep";
}

export interface ArtistDetails {
  type: "artist";
  id: string;
  name: string;
  bio?: string;
  cover?: Cover;
  monthlyListeners?: string;
  followers?: number;
  verified: boolean;
  tracks: ApiTrack[];
  albums: ArtistAlbum[];
  singles: ArtistRelease[];
}

export type ApiArtistDetails = ArtistDetails;

export interface AlbumDetails {
  type: "album";
  id: string;
  title: string;
  artists: { id: string; name: string }[];
  year?: number;
  cover?: Cover;
  trackCount?: number;
  durationMs?: number;
  tracks: ApiTrack[];
}

export type ApiAlbumDetails = AlbumDetails;

export interface CatalogPlaylistDetails {
  type: "playlist";
  id: string;
  title: string;
  author?: string;
  description?: string;
  year?: number;
  cover?: Cover;
  trackCount?: number;
  durationMs?: number;
  tracks: ApiTrack[];
}

export type ApiCatalogPlaylistDetails = CatalogPlaylistDetails;

export interface PublicUser {
  id: string;
  email?: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  isPublic?: boolean;
  showActivity?: boolean;
  showHistory?: boolean;
  showLikedTracks?: boolean;
  participateLeaderboards?: boolean;
}

export type AuthUser = PublicUser;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  user: PublicUser;
  expiresAt?: number;
}

export interface UserPrivacySettings {
  isPublic: boolean;
  showActivity: boolean;
  showHistory: boolean;
  showLikedTracks: boolean;
  participateLeaderboards: boolean;
}

export interface UserProfile extends PublicUser {
  followersCount: number;
  followingCount: number;
  isFollowing?: boolean;
  createdAt: string;
  privacy?: UserPrivacySettings;
}

export interface UpdateProfileInput {
  username?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  isPublic?: boolean;
  showActivity?: boolean;
  showHistory?: boolean;
  showLikedTracks?: boolean;
  participateLeaderboards?: boolean;
}

export interface UserPlaylist {
  id: string;
  title: string;
  description?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
  trackCount?: number;
  coverUrls?: string[];
  ownerId?: string;
  owner?: {
    id: string;
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
}

export type ApiUserPlaylist = UserPlaylist;

export interface UserPlaylistItem {
  id: string;
  track: ApiTrack;
  position: number;
  addedAt: string;
}

export type ApiUserPlaylistItem = UserPlaylistItem;

export interface LikedTracksPage {
  items: { track: ApiTrack; likedAt: string }[];
  nextCursor: string | null;
}

export type PlaybackContext = { type: string; id?: string };

export interface RecordPlaybackEventRequest {
  playbackSessionId: string;
  listeningSessionId: string;
  trackId: string;
  trackSnapshot?: Track;
  playedDurationMs: number;
  trackDurationMs?: number;
  completionRate: number;
  completed?: boolean;
  skipped?: boolean;
  loopCount?: number;
  hasSeekBackward?: boolean;
  context?: PlaybackContext;
}

export interface PlaybackHistoryItem {
  id: string;
  playbackSessionId: string;
  listeningSessionId: string;
  track: Track;
  playedDurationMs: number;
  completionRate: number;
  completed: boolean;
  skipped: boolean;
  loopCount: number;
  hasSeekBackward: boolean;
  context?: PlaybackContext;
  listenedAt: string;
}

export interface PlaybackHistoryResponse {
  items: PlaybackHistoryItem[];
  nextCursor: string | null;
}

export type PopularTimeWindow = "12h" | "24h" | "7d" | "30d" | "all";

export interface PopularTrackItem {
  rank: number;
  track: Track;
  playCount: number;
  uniqueListeners: number;
  score: number;
  viewer?: { liked: boolean };
}

export interface PopularTracksResponse {
  window: PopularTimeWindow;
  generatedAt: string;
  items: PopularTrackItem[];
}

export interface PopularAlbumEntry {
  id: string;
  title: string;
  artist: string;
  artists?: { id: string; name: string }[];
  coverUrl: string | null;
  year?: number;
  playCount: number;
  uniqueListeners: number;
  trackCount: number;
  score: number;
}

export interface PopularAlbumsResponse {
  window: PopularTimeWindow;
  items: PopularAlbumEntry[];
}

export type MostSavedType = "all" | "album" | "playlist";

export interface MostSavedEntry {
  type: "album" | "playlist";
  id: string;
  title: string;
  subtitle: string;
  artists?: { id: string; name: string }[];
  coverUrl: string | null;
  saves: number;
}

export interface MostSavedResponse {
  type: MostSavedType;
  items: MostSavedEntry[];
}

export type LeaderboardType = "artist" | "global";
export type LeaderboardPeriod = "weekly" | "monthly" | "all_time";

export interface LeaderboardEntryUser {
  id: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  user: LeaderboardEntryUser;
  playedDurationMs: number;
  playCount: number;
}

export interface LeaderboardResponse {
  type: LeaderboardType;
  targetId: string;
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  updatedAt: string;
}

export interface DailyMixItem {
  id: string;
  title: string;
  description: string;
  clusterArtists: string[];
  cover?: Cover;
  trackCount: number;
  tracks: Track[];
}

export interface DailyMixesResponse {
  items: DailyMixItem[];
  generatedAt: string;
}

export type LyricsFormat = "plain" | "lrc" | "ttml" | "qrc" | "richsync";
export type LyricsContentKind = "plain" | "line_synced" | "word_synced" | "syllable_synced";
export type LyricsSyncLevel = "plain" | "line_level" | "word_level" | "syllable_level";

export interface RawLyricsCandidate {
  matchedTrack?: { title?: string; artists?: string[]; durationMs?: number };
  lyrics: { format: LyricsFormat; content: string };
  syncHint?: LyricsContentKind;
}

export interface LyricsQuality {
  total: number;
  match: number;
  content: number;
  sync: number;
  source: number;
  reasons: string[];
}

export interface LyricsCandidate extends RawLyricsCandidate {
  provider: string;
  contentKind: LyricsContentKind;
  syncLevel: LyricsSyncLevel;
  topPriority?: boolean;
  quality: LyricsQuality;
}

export interface LyricsSearchResult {
  provider?: string;
  cached: boolean;
  candidate: LyricsCandidate;
}

export type LyricsStreamEvent =
  | {
      type: "metadata";
      track: { id: string; title: string; artists: { id: string; name: string }[]; durationMs: number };
    }
  | {
      type: "provider";
      provider: string;
      status: "found";
      syncLevel: LyricsSyncLevel;
      candidate: LyricsCandidate;
      durationMs?: number;
    }
  | { type: "provider"; provider: string; status: "not_found"; instrumental?: true; durationMs?: number }
  | { type: "provider"; provider: string; status: "error"; message: string; durationMs?: number }
  | {
      type: "done";
      cached: boolean;
      best?: { provider: string; quality: number; syncLevel: LyricsSyncLevel };
      status?: "not_found";
      instrumental?: true;
    };
