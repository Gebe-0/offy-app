import type { PublicUser, UserProfile } from "@offy/contracts";
import { iso } from "./http.js";

export function publicUser(row: any): PublicUser {
  return {
    id: String(row.id),
    ...(row.email ? { email: String(row.email) } : {}),
    username: row.username ?? null,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    isPublic: Boolean(row.is_public ?? true),
    showActivity: Boolean(row.show_activity ?? true),
    showHistory: Boolean(row.show_history ?? true),
    showLikedTracks: Boolean(row.show_liked_tracks ?? true),
    participateLeaderboards: Boolean(row.participate_leaderboards ?? true),
  };
}

export function userProfile(row: any, extra: { followersCount: number; followingCount: number; isFollowing?: boolean }): UserProfile {
  return {
    ...publicUser(row),
    followersCount: extra.followersCount,
    followingCount: extra.followingCount,
    ...(extra.isFollowing !== undefined ? { isFollowing: extra.isFollowing } : {}),
    createdAt: iso(row.created_at),
    privacy: {
      isPublic: Boolean(row.is_public ?? true),
      showActivity: Boolean(row.show_activity ?? true),
      showHistory: Boolean(row.show_history ?? true),
      showLikedTracks: Boolean(row.show_liked_tracks ?? true),
      participateLeaderboards: Boolean(row.participate_leaderboards ?? true),
    },
  };
}

export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
