import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AuthTokens } from "@offy/contracts";
import { sql } from "../db.js";
import { sendPasswordResetEmail } from "../email.js";
import {
  accessTokenExpiry,
  getDummyPasswordHash,
  hashPassword,
  hashRefreshToken,
  hashResetCode,
  newRefreshToken,
  refreshExpiry,
  signAccessToken,
  verifyPassword,
  verifyAccessToken,
} from "../auth.js";
import { ApiError, requireUserId, sendError } from "../http.js";
import { checkRateLimit } from "../rateLimit.js";
import { EMAIL_PATTERN, USERNAME_PATTERN, publicUser } from "../users.js";

interface AuthBody {
  email?: unknown;
  password?: unknown;
  username?: unknown;
  displayName?: unknown;
}

function requireEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "INVALID_EMAIL", "INVALID_EMAIL");
  }
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

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/auth/register", async (request, reply) => {
    try {
      checkRateLimit(`reg:${request.ip}`, 10);
      const body = (request.body ?? {}) as AuthBody;
      const email = requireEmail(body.email);
      const password = requirePassword(body.password);
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      const displayName =
        typeof body.displayName === "string" && body.displayName.trim().length > 0
          ? body.displayName.trim().slice(0, 64)
          : username;

      if (!USERNAME_PATTERN.test(username)) {
        throw new ApiError(400, "INVALID_USERNAME", "INVALID_USERNAME");
      }

      const existing = await sql`
        select 1 from users where lower(email) = ${email} or lower(username) = ${username} limit 1
      `;
      if (existing[0]) throw new ApiError(409, "ACCOUNT_EXISTS", "ACCOUNT_EXISTS");

      const passwordHash = await hashPassword(password);
      const inserted = await sql`
        insert into users (email, password_hash, username, display_name)
        values (${email}, ${passwordHash}, ${username}, ${displayName})
        returning *
      `;
      return reply.send(await issueTokens(inserted[0]));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    try {
      checkRateLimit(`login:ip:${request.ip}`, 15);
      const body = (request.body ?? {}) as AuthBody;
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) throw new ApiError(400, "INVALID_CREDENTIALS", "INVALID_CREDENTIALS");

      checkRateLimit(`login:email:${email}`, 10);

      const rows = await sql`select * from users where lower(email) = ${email} limit 1`;
      const row = rows[0];
      const targetHash = row?.password_hash ?? (await getDummyPasswordHash());
      const passwordOk = await verifyPassword(password, targetHash);
      if (!row || !passwordOk) {
        throw new ApiError(401, "INVALID_CREDENTIALS", "INVALID_CREDENTIALS");
      }
      return reply.send(await issueTokens(row));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/auth/forgot-password", async (request, reply) => {
    try {
      checkRateLimit(`forgot:ip:${request.ip}`, 5);
      const body = (request.body ?? {}) as { email?: unknown };
      const email = requireEmail(body.email);
      checkRateLimit(`forgot:email:${email}`, 3, 5 * 60_000);

      const rows = await sql`select id from users where lower(email) = ${email} limit 1`;
      const user = rows[0];
      if (user) {
        const code = String(crypto.randomInt(100000, 1000000));
        const codeHash = hashResetCode(String(user.id), code);
        const expiresAt = new Date(Date.now() + 15 * 60_000);

        await sql`
          update password_reset_codes
          set used_at = now()
          where user_id = ${user.id} and used_at is null
        `;
        await sql`
          insert into password_reset_codes (user_id, code_hash, expires_at)
          values (${user.id}, ${codeHash}, ${expiresAt})
        `;

        // Dispara o envio de forma assíncrona para evitar timing oracle de enumeração de contas
        void sendPasswordResetEmail(email, code).catch((mailErr) => {
          request.log.error(mailErr, "failed to send password reset email");
        });
      }

      return reply.send({ ok: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/auth/reset-password", async (request, reply) => {
    try {
      checkRateLimit(`reset:ip:${request.ip}`, 10);
      const body = (request.body ?? {}) as {
        email?: unknown;
        code?: unknown;
        newPassword?: unknown;
      };
      const email = requireEmail(body.email);
      checkRateLimit(`reset:email:${email}`, 8, 5 * 60_000);

      const code = typeof body.code === "string" ? body.code.trim() : "";
      const newPassword = requirePassword(body.newPassword);

      if (!/^\d{6}$/.test(code)) {
        throw new ApiError(400, "Código inválido ou expirado.", "INVALID_OR_EXPIRED_CODE");
      }

      const users = await sql`select id from users where lower(email) = ${email} limit 1`;
      const user = users[0];
      if (!user) {
        throw new ApiError(400, "Código inválido ou expirado.", "INVALID_OR_EXPIRED_CODE");
      }

      // Incrementa attempts atomicamente antes da verificação para evitar TOCTOU paralelo
      const claimed = await sql`
        with latest as (
          select id
          from password_reset_codes
          where user_id = ${user.id}
            and used_at is null
            and expires_at > now()
          order by created_at desc
          limit 1
        )
        update password_reset_codes prc
        set attempts = prc.attempts + 1
        from latest
        where prc.id = latest.id
          and prc.attempts < 5
          and prc.used_at is null
        returning prc.id, prc.code_hash
      `;

      const record = claimed[0];
      if (!record) {
        throw new ApiError(400, "Código inválido ou expirado.", "INVALID_OR_EXPIRED_CODE");
      }

      const incomingHash = hashResetCode(String(user.id), code);
      const expectedBuf = Buffer.from(String(record.code_hash), "hex");
      const incomingBuf = Buffer.from(incomingHash, "hex");
      const valid =
        expectedBuf.length === incomingBuf.length &&
        crypto.timingSafeEqual(expectedBuf, incomingBuf);

      if (!valid) {
        throw new ApiError(400, "Código inválido ou expirado.", "INVALID_OR_EXPIRED_CODE");
      }

      const nextPasswordHash = await hashPassword(newPassword);

      await sql.begin(async (tx: any) => {
        const consumed = await tx`
          update password_reset_codes
          set used_at = now()
          where id = ${record.id} and used_at is null
          returning id
        `;
        if (!consumed[0]) {
          throw new ApiError(400, "Código inválido ou expirado.", "INVALID_OR_EXPIRED_CODE");
        }
        await tx`
          update users
          set password_hash = ${nextPasswordHash}
          where id = ${user.id}
        `;
        await tx`
          update refresh_tokens
          set revoked_at = now()
          where user_id = ${user.id} and revoked_at is null
        `;
      });

      return reply.send({ ok: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    try {
      checkRateLimit(`refresh:ip:${request.ip}`, 30);
      const body = (request.body ?? {}) as { refreshToken?: unknown };
      const token = typeof body.refreshToken === "string" ? body.refreshToken : "";
      if (!token) throw new ApiError(401, "INVALID_REFRESH_TOKEN", "INVALID_REFRESH_TOKEN");

      const tokenHash = hashRefreshToken(token);

      // Rotação atômica: apenas uma requisição concorrente consegue revogar e renovar o token
      const revoked = await sql`
        update refresh_tokens
        set revoked_at = now()
        where token_hash = ${tokenHash} and revoked_at is null
        returning id, user_id, expires_at
      `;
      const tokenRow = revoked[0];
      if (!tokenRow) throw new ApiError(401, "INVALID_REFRESH_TOKEN", "INVALID_REFRESH_TOKEN");
      if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
        throw new ApiError(401, "REFRESH_SESSION_EXPIRED", "REFRESH_SESSION_EXPIRED");
      }

      const users = await sql`select * from users where id = ${tokenRow.user_id} limit 1`;
      if (!users[0]) throw new ApiError(401, "INVALID_REFRESH_TOKEN", "INVALID_REFRESH_TOKEN");

      return reply.send(await issueTokens(users[0]));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    try {
      checkRateLimit(`logout:ip:${request.ip}`, 30);
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
