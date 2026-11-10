import type { FastifyInstance, FastifyRequest } from "fastify";
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
  hostName: string;
  createdAt: number;
  currentTrack: unknown | null;
  status: "playing" | "paused" | "idle";
  positionMs: number;
  updatedAt: number;
  allowGuestControl: boolean;
  queue: unknown[];
  participants: Map<string, JamParticipant>;
  subscribers: Set<JamSubscriber>;
}

const rooms = new Map<string, JamRoom>();

// Limpeza automática de salas inativas ou abandonadas
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const noSubscribersTimeout =
      room.subscribers.size === 0 && now - room.updatedAt > 15 * 60 * 1000;
    const maxLifetimeTimeout = now - room.updatedAt > 12 * 60 * 60 * 1000;
    if (noSubscribersTimeout || maxLifetimeTimeout) {
      broadcast(room, "jam_closed", { reason: "timeout" });
      rooms.delete(code);
    }
  }
}, 60 * 1000);

function sanitizeRoom(room: JamRoom) {
  return {
    code: room.code,
    hostId: room.hostId,
    hostName: room.hostName,
    createdAt: room.createdAt,
    currentTrack: room.currentTrack,
    status: room.status,
    positionMs: room.positionMs,
    updatedAt: room.updatedAt,
    allowGuestControl: room.allowGuestControl,
    queue: room.queue,
    participants: Array.from(room.participants.values()),
  };
}

function broadcast(room: JamRoom, event: string, data: unknown) {
  for (const sub of room.subscribers) {
    try {
      sub.send(event, data);
    } catch {
      // cleaned up on close
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
  // Criar sala de Jam
  app.post("/v1/jam/create", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const user = await getUserInfo(userId);

      // Fecha salas antigas do mesmo host
      for (const [existingCode, existingRoom] of rooms.entries()) {
        if (existingRoom.hostId === userId) {
          broadcast(existingRoom, "jam_closed", { reason: "host_recreated" });
          rooms.delete(existingCode);
        }
      }

      let code = generateCode();
      while (rooms.has(code)) {
        code = generateCode();
      }

      const body = (request.body ?? {}) as {
        allowGuestControl?: boolean;
        currentTrack?: unknown;
        positionMs?: number;
        status?: "playing" | "paused" | "idle";
      };

      const room: JamRoom = {
        code,
        hostId: userId,
        hostName: user.displayName,
        createdAt: Date.now(),
        currentTrack: body.currentTrack ?? null,
        status: body.status ?? (body.currentTrack ? "playing" : "idle"),
        positionMs: Math.max(0, Number(body.positionMs ?? 0)),
        updatedAt: Date.now(),
        allowGuestControl: body.allowGuestControl ?? true,
        queue: [],
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
        shareUrl: `https://api.cloudfy.shop/jam/${code}`,
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
        throw new ApiError(404, "JAM_NOT_FOUND", "Sessão Jam não encontrada.");
      }

      const user = await getUserInfo(userId);
      const isHost = room.hostId === userId;

      // Remove de outras salas onde o usuário estava participando
      for (const [existingCode, existingRoom] of rooms.entries()) {
        if (existingCode !== code && existingRoom.participants.has(userId)) {
          if (existingRoom.hostId === userId) {
            broadcast(existingRoom, "jam_closed", { reason: "host_recreated" });
            rooms.delete(existingCode);
          } else {
            existingRoom.participants.delete(userId);
            broadcast(existingRoom, "participant_left", {
              userId,
              participants: Array.from(existingRoom.participants.values()),
            });
          }
        }
      }

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
        shareUrl: `https://api.cloudfy.shop/jam/${code}`,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Obter detalhes da sala (polling ou leitura direta)
  app.get("/v1/jam/:code", async (request, reply) => {
    try {
      const params = request.params as { code?: string };
      const code = (params.code ?? "").toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) {
        throw new ApiError(404, "JAM_NOT_FOUND", "Sessão Jam não encontrada.");
      }

      return reply.send({
        ok: true,
        room: sanitizeRoom(room),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Configurações da sala (Host apenas)
  app.post("/v1/jam/:code/settings", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const params = request.params as { code?: string };
      const code = (params.code ?? "").toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) throw new ApiError(404, "JAM_NOT_FOUND", "Sessão não encontrada.");
      if (room.hostId !== userId) {
        throw new ApiError(403, "NOT_HOST", "Apenas o Host pode alterar as configurações da Jam.");
      }

      const body = (request.body ?? {}) as { allowGuestControl?: boolean };
      if (typeof body.allowGuestControl === "boolean") {
        room.allowGuestControl = body.allowGuestControl;
      }

      broadcast(room, "settings_updated", {
        allowGuestControl: room.allowGuestControl,
      });

      return reply.send({ ok: true, room: sanitizeRoom(room) });
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

  // Fila da Jam: Adicionar música
  app.post("/v1/jam/:code/queue", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const params = request.params as { code?: string };
      const code = (params.code ?? "").toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) throw new ApiError(404, "JAM_NOT_FOUND", "Sessão não encontrada.");
      if (!room.participants.has(userId)) throw new ApiError(403, "NOT_IN_JAM", "Você não está nesta Jam.");

      if (!room.allowGuestControl && room.hostId !== userId) {
        throw new ApiError(403, "GUEST_CONTROL_DISABLED", "Apenas o Host pode adicionar faixas à fila.");
      }

      const body = (request.body ?? {}) as { track?: unknown };
      if (body.track) {
        room.queue.push(body.track);
        broadcast(room, "queue_updated", { queue: room.queue });
      }

      return reply.send({ ok: true, queue: room.queue });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Fila da Jam: Remover música
  app.delete("/v1/jam/:code/queue/:trackId", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const params = request.params as { code?: string; trackId?: string };
      const code = (params.code ?? "").toUpperCase().trim();
      const trackId = params.trackId ?? "";

      const room = rooms.get(code);
      if (!room) throw new ApiError(404, "JAM_NOT_FOUND", "Sessão não encontrada.");
      if (!room.participants.has(userId)) throw new ApiError(403, "NOT_IN_JAM", "Você não está nesta Jam.");

      if (!room.allowGuestControl && room.hostId !== userId) {
        throw new ApiError(403, "GUEST_CONTROL_DISABLED", "Apenas o Host pode gerenciar a fila.");
      }

      room.queue = room.queue.filter((t: any) => t?.id !== trackId);
      broadcast(room, "queue_updated", { queue: room.queue });

      return reply.send({ ok: true, queue: room.queue });
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
      if (!room) throw new ApiError(404, "JAM_NOT_FOUND", "Sessão não encontrada.");
      if (!room.participants.has(userId)) throw new ApiError(403, "NOT_IN_JAM", "Você não está nesta Jam.");

      // Validação de permissão para convidados
      if (!room.allowGuestControl && room.hostId !== userId) {
        throw new ApiError(403, "GUEST_CONTROL_DISABLED", "O Host desativou o controle para convidados.");
      }

      const body = (request.body ?? {}) as {
        action: "PLAY" | "PAUSE" | "SEEK" | "TRACK_CHANGE" | "SKIP_NEXT" | "SKIP_PREV";
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

  // Stream Server-Sent Events (SSE) nativo e resiliente com hijack
  app.get("/v1/jam/:code/events", async (request, reply) => {
    try {
      const userId = getUserIdFromRequest(request);
      const params = request.params as { code?: string };
      const code = (params.code ?? "").toUpperCase().trim();

      const room = rooms.get(code);
      if (!room) {
        return reply.status(404).send({ code: "JAM_NOT_FOUND", message: "Jam not found" });
      }

      // Desacopla do Fastify lifecycle para manter conexão viva sem timeout
      reply.hijack();

      const res = reply.raw;
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
      });
      res.flushHeaders?.();

      const subscriber: JamSubscriber = {
        userId,
        send: (event: string, data: unknown) => {
          try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          } catch {
            // dead socket
          }
        },
      };

      room.subscribers.add(subscriber);

      // Envia imediatamente o estado inicial completo
      subscriber.send("init", sanitizeRoom(room));

      const pingInterval = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          clearInterval(pingInterval);
          room.subscribers.delete(subscriber);
        }
      }, 10000);

      request.raw.on("close", () => {
        clearInterval(pingInterval);
        room.subscribers.delete(subscriber);
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Página web pública de convite (Design premium Glassmorphism com o visual do OFFY)
  app.get("/jam/:code", async (request, reply) => {
    const params = request.params as { code?: string };
    const code = (params.code ?? "").toUpperCase().trim();
    const room = rooms.get(code);

    const appDeepLink = `offy://jam?id=${encodeURIComponent(code)}`;
    const hostDisplayName = room?.hostName ?? "Seu amigo";
    const currentTrackTitle = (room?.currentTrack as any)?.title ?? null;
    const currentTrackArtist = (room?.currentTrack as any)?.artists ?? null;

    const chars = Array.from({ length: 6 }, (_, i) => code[i] || "");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OFFY • Ouvir Juntos (${code})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #08080a;
      color: #f4f4f5;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
      position: relative;
      overflow-x: hidden;
    }
    
    /* Ambient Glows estilo OFFY */
    .glow-1 {
      position: absolute;
      width: 480px;
      height: 480px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, rgba(99, 102, 241, 0) 70%);
      top: -120px;
      left: 50%;
      transform: translateX(-50%);
      filter: blur(80px);
      z-index: 0;
      pointer-events: none;
    }
    .glow-2 {
      position: absolute;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0) 70%);
      bottom: -100px;
      left: 50%;
      transform: translateX(-50%);
      filter: blur(90px);
      z-index: 0;
      pointer-events: none;
    }

    .container {
      position: relative;
      z-index: 10;
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .logo-container {
      margin-bottom: 1.75rem;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-svg {
      width: 38px;
      height: 38px;
      filter: drop-shadow(0 4px 12px rgba(255, 255, 255, 0.2));
    }
    .brand-name {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: #ffffff;
    }

    .glass-card {
      background: rgba(20, 20, 25, 0.65);
      backdrop-filter: blur(32px);
      -webkit-backdrop-filter: blur(32px);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 28px;
      padding: 2.5rem 2rem;
      width: 100%;
      text-align: center;
      box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 0.4rem 0.9rem;
      border-radius: 9999px;
      border: 1px solid rgba(16, 185, 129, 0.25);
      margin-bottom: 1.5rem;
    }
    .badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: #34d399;
      box-shadow: 0 0 10px #34d399;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.25;
      margin-bottom: 0.5rem;
      color: #ffffff;
    }

    .subtitle {
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 1.75rem;
    }
    .host-highlight {
      color: #ffffff;
      font-weight: 600;
    }

    /* Traços e dígitos estilizados idênticos ao app */
    .code-wrapper {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 20px;
      padding: 1.5rem 1rem;
      margin-bottom: 1.75rem;
    }
    .code-label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #71717a;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    .digits-row {
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    .digit-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 42px;
    }
    .digit-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 2.2rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 6px;
      line-height: 1;
    }
    .digit-line {
      height: 2.5px;
      width: 100%;
      border-radius: 9999px;
      background: #ffffff;
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
    }

    ${
      currentTrackTitle
        ? `
    .now-playing {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 0.85rem;
      color: #cbd5e1;
      margin-bottom: 1.5rem;
      padding: 0.5rem;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 10px;
    }
    `
        : ""
    }

    .btn-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      background: #ffffff;
      color: #09090b;
      font-weight: 700;
      font-size: 1rem;
      padding: 1rem;
      border-radius: 14px;
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
      border: none;
      box-shadow: 0 4px 20px rgba(255, 255, 255, 0.15);
      margin-bottom: 0.75rem;
    }
    .btn-primary:hover {
      background: #e4e4e7;
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(255, 255, 255, 0.25);
    }
    .btn-primary:active {
      transform: translateY(0);
    }

    .btn-secondary {
      display: block;
      width: 100%;
      background: transparent;
      color: #a1a1aa;
      font-weight: 600;
      font-size: 0.9rem;
      padding: 0.75rem;
      border-radius: 12px;
      text-decoration: none;
      border: 1px solid rgba(255, 255, 255, 0.08);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.15);
    }

    .footer {
      margin-top: 2rem;
      color: #52525b;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="glow-1"></div>
  <div class="glow-2"></div>

  <div class="container">
    <div class="logo-container">
      <svg class="logo-svg" viewBox="0 0 593 518" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 226 19 L 186 52 L 159 98 L 152 125 L 151 156 L 161 199 L 176 197 L 201 183 L 253 116 L 283 102 L 308 104 L 321 112 L 331 124 L 337 138 L 339 162 L 329 194 L 310 216 L 285 226 L 262 225 L 193 209 L 147 208 L 99 219 L 60 241 L 35 265 L 21 285 L 4 330 L 3 379 L 10 405 L 21 428 L 37 450 L 65 475 L 88 488 L 120 498 L 152 499 L 174 494 L 238 458 L 259 452 L 278 452 L 296 457 L 356 495 L 405 513 L 457 513 L 509 494 L 533 477 L 552 458 L 569 434 L 587 387 L 589 342 L 579 303 L 558 267 L 525 237 L 486 219 L 462 214 L 437 214 L 434 225 L 433 254 L 439 278 L 449 295 L 482 330 L 492 359 L 490 376 L 483 391 L 472 404 L 457 413 L 438 417 L 415 414 L 385 401 L 326 366 L 282 356 L 258 358 L 231 366 L 175 399 L 155 407 L 126 404 L 102 382 L 97 366 L 101 338 L 117 316 L 141 301 L 182 294 L 216 300 L 279 319 L 315 320 L 334 316 L 371 297 L 394 275 L 415 245 L 426 221 L 437 177 L 437 130 L 427 91 L 402 50 L 365 19 L 322 3 L 275 2 Z" fill="white" fill-rule="evenodd"/>
      </svg>
      <span class="brand-name">OFFY</span>
    </div>

    <div class="glass-card">
      <div class="badge">
        <span class="badge-dot"></span>
        Sessão em Grupo
      </div>

      <h1>Ouvir Juntos</h1>
      <p class="subtitle">
        <span class="host-highlight">${hostDisplayName}</span> convidou você para ouvir músicas em tempo real.
      </p>

      <div class="code-wrapper">
        <div class="code-label">Código da Jam</div>
        <div class="digits-row">
          ${chars
            .map(
              (c) => `
            <div class="digit-col">
              <span class="digit-val">${c}</span>
              <div class="digit-line"></div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>

      ${
        currentTrackTitle
          ? `
      <div class="now-playing">
        <span>Tocando agora:</span>
        <strong style="color: #fff;">${currentTrackTitle}</strong>
        ${currentTrackArtist ? `<span>• ${currentTrackArtist}</span>` : ""}
      </div>
      `
          : ""
      }

      <a href="${appDeepLink}" class="btn-primary" id="openBtn">
        Abrir no OFFY
      </a>

      <button type="button" class="btn-secondary" id="copyBtn" onclick="copyCode()" style="margin-bottom: 0.75rem;">
        Copiar Código
      </button>

      <a href="https://github.com/Gebe-0/offy-app/releases/latest" class="btn-secondary" target="_blank" rel="noopener noreferrer">
        Baixar o OFFY para Windows
      </a>
    </div>

    <div class="footer">
      OFFY Music • Sincronização em Tempo Real
    </div>
  </div>

  <script>
    function copyCode() {
      navigator.clipboard.writeText("${code}").then(() => {
        const btn = document.getElementById('copyBtn');
        btn.innerText = 'Código Copiado!';
        setTimeout(() => { btn.innerText = 'Copiar Código'; }, 2000);
      });
    }
  </script>
</body>
</html>`;

    reply.type("text/html; charset=utf-8").send(html);
  });

  // Alias para /v1/jam/:code/invite
  app.get("/v1/jam/:code/invite", async (request, reply) => {
    const params = request.params as { code?: string };
    const code = (params.code ?? "").toUpperCase().trim();
    return reply.redirect(`/jam/${code}`);
  });
}
