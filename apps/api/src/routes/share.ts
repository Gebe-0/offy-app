import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sql } from "../db.js";

export type ShareEntityType = "track" | "playlist" | "album" | "artist" | "home";

export interface EntityMeta {
  title: string;
  subtitle: string;
  coverUrl?: string | null;
  badge: string;
}

const OFFY_LOGO_SVG = `<svg class="logo-svg" viewBox="0 0 593 518" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M 226 19 L 186 52 L 159 98 L 152 125 L 151 156 L 161 199 L 176 197 L 201 183 L 253 116 L 283 102 L 308 104 L 321 112 L 331 124 L 337 138 L 339 162 L 329 194 L 310 216 L 285 226 L 262 225 L 193 209 L 147 208 L 99 219 L 60 241 L 35 265 L 21 285 L 4 330 L 3 379 L 10 405 L 21 428 L 37 450 L 65 475 L 88 488 L 120 498 L 152 499 L 174 494 L 238 458 L 259 452 L 278 452 L 296 457 L 356 495 L 405 513 L 457 513 L 509 494 L 533 477 L 552 458 L 569 434 L 587 387 L 589 342 L 579 303 L 558 267 L 525 237 L 486 219 L 462 214 L 437 214 L 434 225 L 433 254 L 439 278 L 449 295 L 482 330 L 492 359 L 490 376 L 483 391 L 472 404 L 457 413 L 438 417 L 415 414 L 385 401 L 326 366 L 282 356 L 258 358 L 231 366 L 175 399 L 155 407 L 126 404 L 102 382 L 97 366 L 101 338 L 117 316 L 141 301 L 182 294 L 216 300 L 279 319 L 315 320 L 334 316 L 371 297 L 394 275 L 415 245 L 426 221 L 437 177 L 437 130 L 427 91 L 402 50 L 365 19 L 322 3 L 275 2 Z" fill="white" fill-rule="evenodd"/>
</svg>`;

async function resolveEntityMeta(
  type: ShareEntityType,
  id: string,
): Promise<EntityMeta> {
  const meta: EntityMeta = {
    title: id,
    subtitle: "OFFY Music Player",
    badge: type.toUpperCase(),
  };

  try {
    if (type === "track") {
      meta.badge = "MÚSICA";
      const rows = await sql`select title, artists, cover_url from tracks where id = ${id} limit 1`;
      if (rows.length > 0) {
        meta.title = rows[0].title || id;
        meta.subtitle = rows[0].artists || "OFFY Music";
        meta.coverUrl = rows[0].cover_url || null;
      }
    } else if (type === "playlist") {
      meta.badge = "PLAYLIST";
      const rows = await sql`select title, description from playlists where id::text = ${id} limit 1`;
      if (rows.length > 0) {
        meta.title = rows[0].title || id;
        meta.subtitle = rows[0].description || "Playlist no OFFY";
      }
    } else if (type === "album") {
      meta.badge = "ÁLBUM";
      meta.title = id;
      meta.subtitle = "Álbum no OFFY";
    } else if (type === "artist") {
      meta.badge = "ARTISTA";
      meta.title = decodeURIComponent(id);
      meta.subtitle = "Artista no OFFY";
    }
  } catch {
    // Fallback silencioso para garantir que a página sempre renderize
  }

  return meta;
}

export function renderNotFoundHtml(options?: {
  title?: string;
  message?: string;
}): string {
  const title = options?.title || "Nada tocando por aqui";
  const message =
    options?.message ||
    "O link que você tentou acessar não existe, foi movido ou a faixa não está mais disponível.";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 • Conteúdo Não Encontrado • OFFY Music</title>
  
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="OFFY Music Player">
  <meta property="og:title" content="404 • Conteúdo Não Encontrado">
  <meta property="og:description" content="${message}">
  <meta name="theme-color" content="#08080a">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #08080a;
      background-image: radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.03) 0%, transparent 70%);
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
      margin-bottom: 2rem;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-svg {
      width: 36px;
      height: 36px;
      filter: drop-shadow(0 2px 8px rgba(255, 255, 255, 0.1));
    }
    .brand-name {
      font-size: 1.35rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      color: #ffffff;
    }

    .glass-card {
      background: rgba(18, 18, 22, 0.7);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 2.75rem 2rem;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.05);
      color: #a1a1aa;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      margin-bottom: 1.5rem;
    }

    .icon-wrapper {
      width: 76px;
      height: 76px;
      margin: 0 auto 1.5rem auto;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #71717a;
    }

    .icon-wrapper svg {
      width: 38px;
      height: 38px;
      stroke-width: 1.75;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.3;
      margin-bottom: 0.5rem;
      color: #ffffff;
    }

    .subtitle {
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.55;
      margin-bottom: 2rem;
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
      font-size: 0.95rem;
      padding: 0.95rem 1rem;
      border-radius: 14px;
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
      border: none;
      margin-bottom: 0.75rem;
    }
    .btn-primary:hover {
      background: #e4e4e7;
      transform: translateY(-1px);
    }
    .btn-primary:active {
      transform: translateY(0);
    }

    .btn-secondary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      background: rgba(255, 255, 255, 0.03);
      color: #a1a1aa;
      font-weight: 600;
      font-size: 0.9rem;
      padding: 0.85rem 1rem;
      border-radius: 12px;
      text-decoration: none;
      border: 1px solid rgba(255, 255, 255, 0.08);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.07);
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
  <div class="container">
    <div class="logo-container">
      ${OFFY_LOGO_SVG}
      <span class="brand-name">OFFY</span>
    </div>

    <div class="glass-card">
      <div class="badge">
        404 • NÃO ENCONTRADO
      </div>

      <div class="icon-wrapper">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m4.93 4.93 4.24 4.24"></path>
          <path d="m14.83 14.83 4.24 4.24"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </div>

      <h1>${title}</h1>
      <p class="subtitle">${message}</p>

      <a href="offy://home" class="btn-primary">
        Abrir o OFFY
      </a>

      <a href="https://github.com/Gebe-0/offy-app/releases/latest" class="btn-secondary" target="_blank" rel="noopener noreferrer">
        Baixar o OFFY para Windows
      </a>
    </div>

    <div class="footer">
      OFFY Music Player • 2026
    </div>
  </div>
</body>
</html>`;
}

export function renderShareHtml(
  type: ShareEntityType,
  id: string,
  meta: EntityMeta,
): string {
  const appDeepLink =
    type === "home" ? "offy://home" : `offy://${type}?id=${encodeURIComponent(id)}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meta.title} • OFFY Music</title>
  
  <!-- OpenGraph / Discord / WhatsApp Embed -->
  <meta property="og:type" content="music.song">
  <meta property="og:site_name" content="OFFY Music Player">
  <meta property="og:title" content="${meta.title}">
  <meta property="og:description" content="${meta.subtitle}">
  ${meta.coverUrl ? `<meta property="og:image" content="${meta.coverUrl}">` : ""}
  <meta name="theme-color" content="#08080a">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #08080a;
      background-image: radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.03) 0%, transparent 70%);
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
      filter: drop-shadow(0 2px 8px rgba(255, 255, 255, 0.1));
    }
    .brand-name {
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: #ffffff;
    }

    .glass-card {
      background: rgba(18, 18, 22, 0.7);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 28px;
      padding: 2.5rem 2rem;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: rgba(255, 255, 255, 0.05);
      color: #d4d4d8;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 0.4rem 0.9rem;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      margin-bottom: 1.5rem;
    }

    .cover-art {
      width: 140px;
      height: 140px;
      border-radius: ${type === "artist" ? "50%" : "18px"};
      object-fit: cover;
      margin: 0 auto 1.5rem auto;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: block;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.3;
      margin-bottom: 0.4rem;
      color: #ffffff;
      word-break: break-word;
    }

    .subtitle {
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.5;
      margin-bottom: 1.75rem;
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

    .hint {
      margin-top: 1rem;
      color: #71717a;
      font-size: 0.78rem;
      line-height: 1.4;
    }

    .footer {
      margin-top: 2rem;
      color: #52525b;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-container">
      ${OFFY_LOGO_SVG}
      <span class="brand-name">OFFY</span>
    </div>

    <div class="glass-card">
      <div class="badge">
        ${meta.badge}
      </div>

      ${meta.coverUrl ? `<img src="${meta.coverUrl}" alt="${meta.title}" class="cover-art" />` : ""}

      <h1>${meta.title}</h1>
      <p class="subtitle">${meta.subtitle}</p>

      <a href="${appDeepLink}" class="btn-primary" id="openBtn">
        Abrir no OFFY
      </a>

      <a href="https://github.com/Gebe-0/offy-app/releases/latest" class="btn-secondary" target="_blank" rel="noopener noreferrer">
        Baixar o OFFY para Windows
      </a>

      <p class="hint">
        Tentando abrir automaticamente no OFFY. Se nada acontecer, clique no botão acima.
      </p>
    </div>

    <div class="footer">
      OFFY Music Player • 2026
    </div>
  </div>

  <script>
    window.location.href = "${appDeepLink}";
  </script>
</body>
</html>`;
}

export async function registerShareRoutes(app: FastifyInstance): Promise<void> {
  const handler = async (
    type: ShareEntityType,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const query = request.query as Record<string, unknown>;
    const params = request.params as Record<string, string>;
    const id = String(params.id || query.id || "").trim();

    if (!id) {
      reply.status(404).type("text/html; charset=utf-8");
      return reply.send(renderNotFoundHtml());
    }

    const meta = await resolveEntityMeta(type, id);
    const html = renderShareHtml(type, id, meta);

    reply.type("text/html; charset=utf-8");
    return reply.send(html);
  };

  // Suporte a rotas com query (?id=...) e rotas com param (/:id)
  for (const type of ["track", "playlist", "album", "artist"] as const) {
    app.get(`/${type}`, (req, rep) => handler(type, req, rep));
    app.get(`/${type}/:id`, (req, rep) => handler(type, req, rep));
  }
}
