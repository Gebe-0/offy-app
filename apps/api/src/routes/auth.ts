import type { FastifyInstance } from "fastify";
import type { AuthTokens } from "@offy/contracts";
import { sql } from "../db.js";
import {
  accessTokenExpiry,
  hashPassword,
  hashRefreshToken,
  newRefreshToken,
  refreshExpiry,
  signAccessToken,
  verifyPassword,
  verifyAccessToken,
} from "../auth.js";
import { ApiError, requireUserId, sendError } from "../http.js";
import { EMAIL_PATTERN, USERNAME_PATTERN, publicUser } from "../users.js";

interface AuthBody {
  email?: unknown;
  password?: unknown;
  username?: unknown;
  displayName?: unknown;
}

function requireEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) throw new ApiError(400, "INVALID_EMAIL", "INVALID_EMAIL");
  return email;
}

function requirePassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8 || password.length > 200) {
    throw new ApiError(400, "PASSWORD_TOO_SHORT", "PASSWORD_TOO_SHORT");
  }
  return password;
}

async function issueTokens(row: any): Promise<AuthTokens> {
  const refresh = newRefreshToken();
  await sql`
    insert into refresh_tokens (user_id, token_hash, expires_at)
    values (${row.id}, ${hashRefreshToken(refresh)}, ${refreshExpiry()})
  `;
  return {
    accessToken: signAccessToken(String(row.id)),
    refreshToken: refresh,
    accessTokenExpiresAt: accessTokenExpiry(),
    user: publicUser(row),
  };
}

const authAttempts = new Map<string, { count: number; resetAt: number }>();

function throttle(ip: string, maxAttempts: number, windowMs = 60_000): void {
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (entry.count >= maxAttempts) {
    throw new ApiError(429, "TOO_MANY_REQUESTS", "Muitas tentativas. Aguarde um minuto.");
  }
  entry.count += 1;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authAttempts.entries()) {
    if (now > entry.resetAt) authAttempts.delete(ip);
  }
}, 5 * 60_000).unref();

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/auth/register", async (request, reply) => {
    try {
      throttle(request.ip, 10);
      const body = (request.body ?? {}) as AuthBody;
      const email = requireEmail(body.email);
      const password = requirePassword(body.password);
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      const displayName =
        typeof body.displayName === "string" && body.displayName.trim().length > 0
          ? body.displayName.trim()
          : username;

      if (!USERNAME_PATTERN.test(username)) {
        throw new ApiError(400, "INVALID_USERNAME", "INVALID_USERNAME");
      }

      const existing = await sql`
        select 1 from users where lower(email) = ${email} or lower(username) = ${username} limit 1
      `;
      if (existing[0]) throw new ApiError(409, "ACCOUNT_EXISTS", "ACCOUNT_EXISTS");

      const inserted = await sql`
        insert into users (email, password_hash, username, display_name)
        values (${email}, ${hashPassword(password)}, ${username}, ${displayName})
        returning *
      `;
      return reply.send(await issueTokens(inserted[0]));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    try {
      throttle(request.ip, 15);
      const body = (request.body ?? {}) as AuthBody;
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) throw new ApiError(400, "INVALID_CREDENTIALS", "INVALID_CREDENTIALS");

      const rows = await sql`select * from users where lower(email) = ${email} limit 1`;
      const row = rows[0];
      if (!row || !verifyPassword(password, row.password_hash)) {
        throw new ApiError(401, "INVALID_CREDENTIALS", "INVALID_CREDENTIALS");
      }
      return reply.send(await issueTokens(row));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as { refreshToken?: unknown };
      const token = typeof body.refreshToken === "string" ? body.refreshToken : "";
      if (!token) throw new ApiError(401, "INVALID_REFRESH_TOKEN", "INVALID_REFRESH_TOKEN");

      const rows = await sql`
        select rt.id as token_id, rt.expires_at, u.*
        from refresh_tokens rt join users u on u.id = rt.user_id
        where rt.token_hash = ${hashRefreshToken(token)} and rt.revoked_at is null
        limit 1
      `;
      const row = rows[0];
      if (!row) throw new ApiError(401, "INVALID_REFRESH_TOKEN", "INVALID_REFRESH_TOKEN");
      if (new Date(row.expires_at).getTime() < Date.now()) {
        throw new ApiError(401, "REFRESH_SESSION_EXPIRED", "REFRESH_SESSION_EXPIRED");
      }

      await sql`update refresh_tokens set revoked_at = now() where id = ${row.token_id}`;
      return reply.send(await issueTokens(row));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as { refreshToken?: unknown };
      const token = typeof body.refreshToken === "string" ? body.refreshToken : "";
      if (token) {
        await sql`
          update refresh_tokens set revoked_at = now()
          where token_hash = ${hashRefreshToken(token)} and revoked_at is null
        `;
      }
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/me", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const rows = await sql`select * from users where id = ${userId} limit 1`;
      if (!rows[0]) throw new ApiError(401, "UNAUTHORIZED", "UNAUTHORIZED");
      return reply.send(publicUser(rows[0]));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // o cliente pode mandar um token vazio depois de limpar a sessão
  app.get("/v1/auth/session", async (request, reply) => {
    try {
      const header = request.headers.authorization;
      const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
      const payload = token ? verifyAccessToken(token) : null;
      return reply.send({ authenticated: Boolean(payload) });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
