export interface InnertubeProfile {
  name: string;
  clientName: string;
  clientVersion: string;
  clientId: string;
  origin: string;
  userAgent?: string;
  context?: Record<string, unknown>;
}

/**
 * WEB_REMIX é o catálogo (busca, browse). Hoje ele exige PO token para
 * playback, por isso os perfis de app abaixo resolvem o áudio.
 */
export const WEB_REMIX_PROFILE: InnertubeProfile = {
  name: "WEB_REMIX",
  clientName: "WEB_REMIX",
  clientVersion: "1.20260911.08.00",
  clientId: "67",
  origin: "https://music.youtube.com",
};

export const VISIONOS_PROFILE: InnertubeProfile = {
  name: "VISIONOS",
  clientName: "VISIONOS",
  clientVersion: "1.04",
  clientId: "101",
  origin: "https://music.youtube.com",
  userAgent: "com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; en_US)",
  context: {
    osName: "visionOS",
    osVersion: "26.6.0.23O770",
    deviceMake: "Apple",
    deviceModel: "RealityDevice17,1",
    platform: "MOBILE",
  },
};

export const ANDROID_VR_PROFILE: InnertubeProfile = {
  name: "ANDROID_VR",
  clientName: "ANDROID_VR",
  clientVersion: "1.65.10",
  clientId: "28",
  origin: "https://www.youtube.com",
  userAgent:
    "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
  context: {
    osName: "Android",
    osVersion: "12L",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: 32,
    buildId: "SQ3A.220605.009.A1",
    packageName: "com.google.android.apps.youtube.vr.oculus",
  },
};

export const CATALOG_PROFILE = WEB_REMIX_PROFILE;
export const PLAYBACK_PROFILES: readonly InnertubeProfile[] = [VISIONOS_PROFILE, ANDROID_VR_PROFILE];
