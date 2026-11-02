import type { Track } from "@/shared/types";

export interface JamParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isHost: boolean;
  joinedAt: number;
}

export interface JamRoomState {
  code: string;
  hostId: string;
  hostName: string;
  createdAt: number;
  currentTrack: Track | null;
  status: "playing" | "paused" | "idle";
  positionMs: number;
  updatedAt: number;
  allowGuestControl: boolean;
  queue: Track[];
  participants: JamParticipant[];
}

export interface JamSyncEvent {
  action: "PLAY" | "PAUSE" | "SEEK" | "TRACK_CHANGE";
  track?: Track;
  status: "playing" | "paused" | "idle";
  positionMs: number;
  updatedAt: number;
  senderId: string;
}
