import { getAccessToken, getApiBaseUrl, type ApiTrack } from "@/shared/api";

export interface ProfileMiniUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  discordHandle: string | null;
}

export interface ProfileAchievementBadge {
  id: string;
  label: string;
  icon?: string;
}

export interface ProfilePinnedCard {
  kind: "playlist" | "likes";
  id: string;
  title: string;
  trackCount: number;
  totalDurationMs: number;
  coverUrls: string[];
}

export interface ProfileSummaryResponse {
  user: ProfileMiniUser & {
    bio: string;
    badges: ProfileAchievementBadge[];
  };
  isSelf: boolean;
  friendsCount: number;
  friendAvatars: ProfileMiniUser[];
  pendingRequestsCount: number;
  friendshipStatus:
    | "self"
    | "friends"
    | "pending_sent"
    | "pending_received"
    | "none";
  pendingRequestId: string | null;
  recent: Array<{ track: ApiTrack; playedAt: string }>;
  topArtistsMonth: Array<{
    name: string;
    id?: string;
    coverUrl: string;
    playCount: number;
  }>;
  topTracksMonth: Array<{ track: ApiTrack; playCount: number }>;
  monthlyListeningMs: number;
  pinnedCards: ProfilePinnedCard[];
}

export interface FriendsListResponse {
  friends: Array<ProfileMiniUser & { friendsSince: string }>;
  incomingRequests: Array<{
    requestId: string;
    requestedAt: string;
    user: ProfileMiniUser;
  }>;
  outgoingRequests: Array<{
    requestId: string;
    requestedAt: string;
    user: ProfileMiniUser;
  }>;
}

async function authedJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const profileApi = {
  getSummary(id = "me"): Promise<ProfileSummaryResponse> {
    return authedJson(`/v1/users/${encodeURIComponent(id)}/summary`);
  },
  getFriends(): Promise<FriendsListResponse> {
    return authedJson("/v1/friends");
  },
  searchUsers(q: string): Promise<ProfileMiniUser[]> {
    return authedJson(`/v1/users/search?q=${encodeURIComponent(q)}&limit=12`);
  },
  sendFriendRequest(targetUserId: string): Promise<{ status: string }> {
    return authedJson("/v1/friends/request", {
      method: "POST",
      body: JSON.stringify({ targetUserId }),
    });
  },
  acceptRequest(requestId: string): Promise<{ ok: boolean }> {
    return authedJson(
      `/v1/friends/requests/${encodeURIComponent(requestId)}/accept`,
      { method: "POST" },
    );
  },
  declineRequest(requestId: string): Promise<{ ok: boolean }> {
    return authedJson(
      `/v1/friends/requests/${encodeURIComponent(requestId)}/decline`,
      { method: "POST" },
    );
  },
  removeFriend(userId: string): Promise<void> {
    return authedJson(`/v1/friends/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  },
  updateProfile(patch: {
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    discordHandle?: string;
  }): Promise<unknown> {
    return authedJson("/v1/users/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
};
