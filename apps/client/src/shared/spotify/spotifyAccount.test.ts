import { describe, expect, it } from "vitest";
import { parseSpotifyUrl } from "@/features/library/services/import/sources/spotify/spotifyUrl";
import { isSpotifySignedIn } from "./spotifyAccount";

describe("Spotify Integration", () => {
  it("parses liked songs collection url correctly", () => {
    const result = parseSpotifyUrl(
      "https://open.spotify.com/collection/tracks",
    );
    expect(result.type).toBe("collection");
    expect(result.id).toBe("tracks");
  });

  it("parses spotify:liked uri correctly", () => {
    const result = parseSpotifyUrl("spotify:liked");
    expect(result.type).toBe("collection");
    expect(result.id).toBe("tracks");
  });

  it("parses standard spotify playlist url correctly", () => {
    const result = parseSpotifyUrl(
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    );
    expect(result.type).toBe("playlist");
    expect(result.id).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });

  it("checks signed in state when empty", () => {
    expect(isSpotifySignedIn()).toBe(false);
  });
});
