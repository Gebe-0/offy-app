import { describe, it, expect, vi, beforeEach } from "vitest";

// Player pulls canvas/lottie modules that jsdom does not support in headless node
vi.mock("@/features/player", () => ({
  playerEngine: {
    playTrack: vi.fn(async () => {}),
    setJamBridge: vi.fn(),
    skipNext: vi.fn(async () => {}),
    skipPrevious: vi.fn(async () => {}),
  },
  playerRuntime: {
    loadAndPlay: vi.fn(async () => {}),
    pause: vi.fn(),
    resume: vi.fn(),
    seek: vi.fn(),
  },
  usePlayerStore: {
    getState: vi.fn(() => ({
      currentTrack: null,
      positionMs: 0,
      status: "idle",
      setPosition: vi.fn(),
    })),
    subscribe: vi.fn(),
  },
}));

import { useJamStore } from "./jamStore";

describe("jamStore", () => {
  beforeEach(() => {
    useJamStore.setState({
      code: null,
      isHost: false,
      isOpen: false,
      isConnecting: false,
      error: null,
      allowGuestControl: true,
      queue: [],
      participants: [],
      shareUrl: null,
      jamDeepLink: null,
    });
  });

  it("handles invalid codes gracefully without throwing", async () => {
    const res = await useJamStore.getState().joinJam("xyz");
    expect(res).toBe(false);
    expect(useJamStore.getState().error).toBe(
      "O código da Jam deve ter exatamente 6 dígitos.",
    );
  });

  it("clears active jam session upon leaveJam", async () => {
    useJamStore.setState({
      code: "TEST99",
      isHost: true,
      participants: [
        {
          userId: "u1",
          username: "host",
          displayName: "Host User",
          isHost: true,
          joinedAt: Date.now(),
        },
      ],
    });

    await useJamStore.getState().leaveJam();

    const state = useJamStore.getState();
    expect(state.code).toBeNull();
    expect(state.isHost).toBe(false);
    expect(state.participants).toEqual([]);
  });
});
