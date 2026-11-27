import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
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

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// Constant-time dummy hash used when login email does not exist to prevent timing enumeration.
let dummyHashPromise: Promise<string> | null = null;
export function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("offy-dummy-timing-guard-password-do-not-use");
  }
  return dummyHashPromise;
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
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as {
      alg?: unknown;
      typ?: unknown;
    };
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<AccessPayload>;
    if (
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp) ||
      typeof payload.iat !== "number" ||
      !Number.isFinite(payload.iat) ||
      payload.exp * 1000 < Date.now()
    ) {
      return null;
    }
    return payload as AccessPayload;
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

export function hashResetCode(userId: string, code: string): string {
  return createHmac("sha256", env.authSecret).update(`pwreset:${userId}:${code}`).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltPart, hashPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart) return false;
  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  if (expected.length === 0) return false;
  const actual = await scryptAsync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function accessTokenExpiry(): string {
  return new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString();
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
}
