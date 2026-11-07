import { describe, expect, it } from "vitest";
import { parseSpotifyUrl } from "@/features/library/services/import/sources/spotify/spotifyUrl";
import { isSpotifySignedIn } from "./spotifyAccount";
import { extractSpDc } from "../../../electron/spotify-ipc";

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

  it("extracts sp_dc correctly from raw and cookie headers", () => {
    expect(extractSpDc("AQD_sample_cookie_value_1234567890abcdef")).toBe(
      "AQD_sample_cookie_value_1234567890abcdef",
    );
    expect(
      extractSpDc(
        "sp_m=br; sp_dc=AQD_sample_cookie_value_1234567890abcdef; sp_landing=...",
      ),
    ).toBe("AQD_sample_cookie_value_1234567890abcdef");
    expect(
      extractSpDc('"sp_dc=AQD_sample_cookie_value_1234567890abcdef"'),
    ).toBe("AQD_sample_cookie_value_1234567890abcdef");
  });
});
