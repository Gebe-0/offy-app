import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sql } from "../db.js";
import { ApiError, sendError } from "../http.js";
import { verifyAccessToken } from "../auth.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export interface JamParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isHost: boolean;
  joinedAt: number;
}

export interface JamSubscriber {
  userId: string;
  send: (event: string, data: unknown) => void;
}

export interface JamRoom {
  code: string;
  hostId: string;
  createdAt: number;
  currentTrack: unknown | null;
  status: "playing" | "paused" | "idle";
  positionMs: number;
  updatedAt: number;
  participants: Map<string, JamParticipant>;
  subscribers: Set<JamSubscriber>;
}

const rooms = new Map<string, JamRoom>();

function sanitizeRoom(room: JamRoom) {
  return {
    code: room.code,
    hostId: room.hostId,
    createdAt: room.createdAt,
    currentTrack: room.currentTrack,
    status: room.status,
    positionMs: room.positionMs,
    updatedAt: room.updatedAt,
    participants: Array.from(room.participants.values()),
  };
}

function broadcast(room: JamRoom, event: string, data: unknown) {
  for (const sub of room.subscribers) {
    try {
      sub.send(event, data);
    } catch {
      // subscriber will be cleaned up on close
    }
  }
}

function getUserIdFromRequest(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const payload = verifyAccessToken(header.slice(7));
    if (payload?.sub) return payload.sub;
  }
  const query = request.query as Record<string, unknown>;
  if (typeof query.token === "string" && query.token) {
    const payload = verifyAccessToken(query.token);
    if (payload?.sub) return payload.sub;
  }
  throw new ApiError(401, "UNAUTHORIZED", "UNAUTHORIZED");
}

async function getUserInfo(userId: string) {
  const rows = await sql`
    select id, username, display_name, avatar_url from users where id = ${userId} limit 1
  `;
  const row = rows[0];
  return {
    userId: String(row?.id ?? userId),
    username: String(row?.username ?? "offy_user"),
    displayName: String(row?.display_name ?? row?.username ?? "Membro"),
    avatarUrl: (row?.avatar_url as string | null) ?? null,
  };
}

export async function registerJamRoutes(app: FastifyInstance): Promise<void> {
  // Criação de sala Jam
  app.post("/v1/jam/create", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const user = await getUserInfo(userId);

      // Limpar salas antigas onde o usuário era host
      for (const [existingCode, room] of rooms.entries()) {
        if (room.hostId === userId) {
          broadcast(room, "jam_closed", { reason: "host_recreated" });
          rooms.delete(existingCode);
        }
      }

      let code = generateCode();
      while (rooms.has(code)) {
        code = generateCode();
      }

      const room: JamRoom = {
        code,
        hostId: userId,
        createdAt: Date.now(),
        currentTrack: null,
        status: "idle",
        positionMs: 0,
        updatedAt: Date.now(),
        participants: new Map([
          [
            userId,
            {
              ...user,
              isHost: true,
              joinedAt: Date.now(),
            },
          ],
        ]),
        subscribers: new Set(),
      };

      rooms.set(code, room);

      return reply.send({
        ok: true,
        room: sanitizeRoom(room),
        jamUrl: `offy://jam?id=${code}`,
        shareUrl: `https://offy-api-fp82.onrender.com/jam/${code}`,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Entrar em uma sala existente
  app.post("/v1/jam/:code/join", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const params = request.params as { code?: string };
      const code = (params.code ?? "").toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) {
        throw new ApiError(404, "JAM_NOT_FOUND", "JAM_NOT_FOUND");
      }

      const user = await getUserInfo(userId);
      const isHost = room.hostId === userId;

      room.participants.set(userId, {
        ...user,
        isHost,
        joinedAt: Date.now(),
      });

      broadcast(room, "participant_joined", {
        user: { ...user, isHost },
        participants: Array.from(room.participants.values()),
      });

      return reply.send({
        ok: true,
        room: sanitizeRoom(room),
        jamUrl: `offy://jam?id=${code}`,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Obter detalhes da sala
  app.get("/v1/jam/:code", async (request, reply) => {
    try {
      const params = request.params as { code?: string };
      const code = (params.code ?? "").toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) {
        throw new ApiError(404, "JAM_NOT_FOUND", "JAM_NOT_FOUND");
      }

      return reply.send({
        ok: true,
        room: sanitizeRoom(room),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Sair da sala
  app.post("/v1/jam/:code/leave", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const params = request.params as { code?: string };
      const code = (params.code ?? "").toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) return reply.send({ ok: true });

      if (room.hostId === userId) {
        // Se o Host sair, encerra a sala
        broadcast(room, "jam_closed", { reason: "host_left" });
        rooms.delete(code);
      } else {
        room.participants.delete(userId);
        broadcast(room, "participant_left", {
          userId,
          participants: Array.from(room.participants.values()),
        });
      }

      return reply.send({ ok: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Sincronizar estado (Play / Pause / Seek / Nova Faixa)
  app.post("/v1/jam/:code/sync", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const params = request.params as { code?: string };
      const code = (params.code ?? "").toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) {
        throw new ApiError(404, "JAM_NOT_FOUND", "JAM_NOT_FOUND");
      }

      if (!room.participants.has(userId)) {
        throw new ApiError(403, "NOT_IN_JAM", "NOT_IN_JAM");
      }

      const body = (request.body ?? {}) as {
        action: "PLAY" | "PAUSE" | "SEEK" | "TRACK_CHANGE";
        track?: unknown;
        positionMs?: number;
      };

      const now = Date.now();
      if (body.action === "TRACK_CHANGE" && body.track !== undefined) {
        room.currentTrack = body.track;
        room.positionMs = Math.max(0, Number(body.positionMs ?? 0));
        room.status = "playing";
        room.updatedAt = now;
      } else if (body.action === "PLAY") {
        room.status = "playing";
        if (body.positionMs !== undefined) {
          room.positionMs = Math.max(0, Number(body.positionMs));
        }
        room.updatedAt = now;
      } else if (body.action === "PAUSE") {
        room.status = "paused";
        if (body.positionMs !== undefined) {
          room.positionMs = Math.max(0, Number(body.positionMs));
        }
        room.updatedAt = now;
      } else if (body.action === "SEEK") {
        room.positionMs = Math.max(0, Number(body.positionMs ?? 0));
        room.updatedAt = now;
      }

      broadcast(room, "sync", {
        action: body.action,
        track: room.currentTrack,
        status: room.status,
        positionMs: room.positionMs,
        updatedAt: room.updatedAt,
        senderId: userId,
      });

      return reply.send({ ok: true, room: sanitizeRoom(room) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Stream Server-Sent Events (SSE) para tempo real
  app.get("/v1/jam/:code/events", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const params = request.params as { code?: string };
      const code = (params.code ?? "").toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) {
        return reply.status(404).send({ code: "JAM_NOT_FOUND", message: "Jam not found" });
      }

      // Headers SSE
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.raw.flushHeaders?.();

      const subscriber: JamSubscriber = {
        userId,
        send: (event: string, data: unknown) => {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
      };

      room.subscribers.add(subscriber);

      // Envia o estado atual de boas-vindas
      subscriber.send("init", sanitizeRoom(room));

      // Ping a cada 15s para não cair conexão
      const pingInterval = setInterval(() => {
        try {
          reply.raw.write(": ping\n\n");
        } catch {
          clearInterval(pingInterval);
        }
      }, 15000);

      request.raw.on("close", () => {
        clearInterval(pingInterval);
        room.subscribers.delete(subscriber);
      });

      // Retorna a promise para manter a conexão aberta no Fastify
      await new Promise<void>((resolve) => {
        request.raw.on("close", resolve);
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Rota Web pública amigável para convites via navegador
  app.get("/jam/:code", async (request, reply) => {
    const params = request.params as { code?: string };
    const code = (params.code ?? "").toUpperCase().trim();
    const appDeepLink = `offy://jam?id=${encodeURIComponent(code)}`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Entrar na Jam do OFFY</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b0b0d;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .card {
      background: #141418;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 2.5rem 2rem;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    }
    .badge {
      display: inline-block;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      margin-bottom: 1.25rem;
      border: 1px solid rgba(96, 165, 250, 0.25);
    }
    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      letter-spacing: -0.02em;
    }
    p {
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    .code-box {
      background: #1c1c22;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    .code-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: #71717a;
      letter-spacing: 0.08em;
      margin-bottom: 0.35rem;
    }
    .code-value {
      font-size: 2.4rem;
      font-weight: 800;
      letter-spacing: 0.25em;
      color: #38bdf8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding-left: 0.25em;
    }
    .btn {
      display: block;
      width: 100%;
      background: #ffffff;
      color: #0b0b0d;
      font-weight: 600;
      font-size: 1rem;
      padding: 0.9rem;
      border-radius: 12px;
      text-decoration: none;
      transition: all 0.15s ease;
      cursor: pointer;
      border: none;
    }
    .btn:hover {
      background: #e4e4e7;
      transform: translateY(-1px);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Sessão em Grupo</div>
    <h1>Ouvir Juntos no OFFY</h1>
    <p>Seu amigo convidou você para ouvir músicas sincronizadas em tempo real.</p>
    <div class="code-box">
      <div class="code-label">Código da Jam</div>
      <div class="code-value">${code}</div>
    </div>
    <a href="${appDeepLink}" class="btn">Abrir no OFFY</a>
  </div>
  <script>
    // Tenta abrir o app automaticamente
    window.location.href = "${appDeepLink}";
  </script>
</body>
</html>`;

    reply.type("text/html; charset=utf-8").send(html);
  });
}
