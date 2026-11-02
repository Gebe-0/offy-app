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
  createdAt: number;
  currentTrack: any | null;
  status: "playing" | "paused" | "idle";
  positionMs: number;
  updatedAt: number;
  participants: JamParticipant[];
}

export interface JamSyncEvent {
  action: "PLAY" | "PAUSE" | "SEEK" | "TRACK_CHANGE";
  track?: any;
  status: "playing" | "paused" | "idle";
  positionMs: number;
  updatedAt: number;
  senderId: string;
}
