import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";

export interface AccessPayload {
  sub: string;
  iat: number;
  exp: number;
}

export const ACCESS_TTL_SECONDS = 60 * 30;
export const REFRESH_TTL_DAYS = 60;
export const REFRESH_TTL_SECONDS = REFRESH_TTL_DAYS * 24 * 60 * 60;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signAccessToken(userId: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessPayload = { sub: userId, iat: now, exp: now + ACCESS_TTL_SECONDS };
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", env.authSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyAccessToken(token: string): AccessPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts as [string, string, string];
  const expected = createHmac("sha256", env.authSecret).update(`${header}.${body}`).digest("base64url");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccessPayload;
    if (!payload.sub || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltPart, hashPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart) return false;
  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function accessTokenExpiry(): string {
  return new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString();
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
}
