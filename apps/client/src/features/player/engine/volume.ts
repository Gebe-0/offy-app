const VOLUME_CURVE = 2;

export const MAX_VOLUME_LEVEL = 1;
export const MAX_BOOST_VOLUME_LEVEL = 2;

export function getMaxVolumeLevel(audioBoostEnabled: boolean): number {
  return audioBoostEnabled ? MAX_BOOST_VOLUME_LEVEL : MAX_VOLUME_LEVEL;
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

// maps linear web audio gain to perceptual slider curve (0..1 quadratic, 1..2 linear boost)
export function toVolumeLevel(
  gain: number,
  maxLevel: number = MAX_BOOST_VOLUME_LEVEL,
): number {
  const clamped = clamp(gain, maxLevel);
  if (clamped <= 1) {
    return Math.pow(clamped, 1 / VOLUME_CURVE);
  }
  return clamped;
}

// converts ui slider curve back to linear gain (0..1 quadratic, 1..2 linear boost)
export function toVolumeGain(
  level: number,
  maxLevel: number = MAX_BOOST_VOLUME_LEVEL,
): number {
  const clamped = clamp(level, maxLevel);
  if (clamped <= 1) {
    return Math.pow(clamped, VOLUME_CURVE);
  }
  return clamped;
}
