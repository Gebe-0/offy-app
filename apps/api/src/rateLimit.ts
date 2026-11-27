import { ApiError } from "./http.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_KEYS = 50_000;
const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs = 60_000,
  message = "Muitas tentativas. Aguarde um minuto.",
): void {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    if (buckets.size >= MAX_KEYS) {
      // Evict expired entries first, then oldest entry if still full
      for (const [k, v] of buckets.entries()) {
        if (now > v.resetAt) buckets.delete(k);
        if (buckets.size < MAX_KEYS * 0.8) break;
      }
      if (buckets.size >= MAX_KEYS) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) buckets.delete(oldestKey);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (entry.count >= maxAttempts) {
    throw new ApiError(429, message, "TOO_MANY_REQUESTS");
  }
  entry.count += 1;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of buckets.entries()) {
    if (now > entry.resetAt) buckets.delete(k);
  }
}, 5 * 60_000).unref();
