import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "./auth.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** O cliente espera o envelope plano: { code, message }. */
export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof ApiError) {
    reply.status(error.status).send({ code: error.code ?? "ERROR", message: error.message });
    return;
  }
  reply.status(500).send({ code: "INTERNAL", message: "internal error" });
}

export function requireUserId(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new ApiError(401, "UNAUTHORIZED", "UNAUTHORIZED");
  const payload = verifyAccessToken(header.slice(7));
  if (!payload) throw new ApiError(401, "UNAUTHORIZED", "UNAUTHORIZED");
  return payload.sub;
}

export interface Parser<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: (string | number)[]; message: string }> } };
}

export function parseBody<T>(schema: Parser<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError(
      400,
      first ? `${first.path.join(".")}: ${first.message}` : "INVALID_INPUT",
      "INVALID_INPUT",
    );
  }
  return result.data;
}

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function int(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function encodeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify([at, id])).toString("base64url");
}

export function decodeCursor(cursor: unknown): { at: string; id: string } | null {
  if (typeof cursor !== "string" || !cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return Array.isArray(parsed) && parsed.length === 2
      ? { at: String(parsed[0]), id: String(parsed[1]) }
      : null;
  } catch {
    return null;
  }
}

export function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
