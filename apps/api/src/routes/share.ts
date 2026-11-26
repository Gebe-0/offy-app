import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sql } from "../db.js";

export type ShareEntityType = "track" | "playlist" | "album" | "artist" | "home";

export interface EntityMeta {
  title: string;
  subtitle: string;
  coverUrl?: string | null;
  badge: string;
}

const OFFY_LOGO_SVG = `<svg class="brand-glyph" viewBox="0 0 593 518" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M 226 19 L 186 52 L 159 98 L 152 125 L 151 156 L 161 199 L 176 197 L 201 183 L 253 116 L 283 102 L 308 104 L 321 112 L 331 124 L 337 138 L 339 162 L 329 194 L 310 216 L 285 226 L 262 225 L 193 209 L 147 208 L 99 219 L 60 241 L 35 265 L 21 285 L 4 330 L 3 379 L 10 405 L 21 428 L 37 450 L 65 475 L 88 488 L 120 498 L 152 499 L 174 494 L 238 458 L 259 452 L 278 452 L 296 457 L 356 495 L 405 513 L 457 513 L 509 494 L 533 477 L 552 458 L 569 434 L 587 387 L 589 342 L 579 303 L 558 267 L 525 237 L 486 219 L 462 214 L 437 214 L 434 225 L 433 254 L 439 278 L 449 295 L 482 330 L 492 359 L 490 376 L 483 391 L 472 404 L 457 413 L 438 417 L 415 414 L 385 401 L 326 366 L 282 356 L 258 358 L 231 366 L 175 399 L 155 407 L 126 404 L 102 382 L 97 366 L 101 338 L 117 316 L 141 301 L 182 294 L 216 300 L 279 319 L 315 320 L 334 316 L 371 297 L 394 275 L 415 245 L 426 221 L 437 177 L 437 130 L 427 91 L 402 50 L 365 19 L 322 3 L 275 2 Z" fill="#ededed" fill-rule="evenodd"/>
</svg>`;

const metaCache = new Map<string, { meta: EntityMeta; expiresAt: number }>();
const META_CACHE_TTL_MS = 60 * 60 * 1000;

function extractMetaTag(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const match = html.match(re);
  if (match?.[1]) return match[1];
  const rev = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  return html.match(rev)?.[1] ?? null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

async function fetchExternalMeta(
  type: ShareEntityType,
  id: string,
  meta: EntityMeta,
): Promise<EntityMeta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    if (type === "track" && /^[A-Za-z0-9_-]{11}$/.test(id)) {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
        { signal: controller.signal },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        if (data.title) meta.title = data.title;
        if (data.author_name) meta.subtitle = data.author_name.replace(/\s*-\s*Topic$/i, "");
        meta.coverUrl = data.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      } else {
        meta.coverUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      }
      return meta;
    }

    let targetUrl: string | null = null;
    if (type === "artist" && /^UC[A-Za-z0-9_-]{22}$/.test(id)) {
      targetUrl = `https://www.youtube.com/channel/${id}`;
    } else if (type === "album" && /^MPRE[A-Za-z0-9_-]{4,64}$/.test(id)) {
      targetUrl = `https://music.youtube.com/browse/${id}`;
    } else if (type === "playlist" && /^(?:VL)?PL[A-Za-z0-9_-]+$/.test(id)) {
      const listId = id.startsWith("VL") ? id.slice(2) : id;
      targetUrl = `https://www.youtube.com/playlist?list=${listId}`;
    }

    if (targetUrl) {
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });
      if (res.ok) {
        const html = await res.text();
        const ogTitle = extractMetaTag(html, "og:title");
        const ogImage = extractMetaTag(html, "og:image");
        if (ogTitle) {
          const clean = decodeHtmlEntities(ogTitle)
            .replace(/\s*-\s*YouTube(?:\s+Music)?$/i, "")
            .replace(/\s*-\s*Topic$/i, "")
            .trim();
          if (clean) meta.title = clean;
        }
        if (ogImage) meta.coverUrl = decodeHtmlEntities(ogImage);
      }
    }
  } catch {
    // fallback gracioso
  } finally {
    clearTimeout(timer);
  }
  return meta;
}

async function resolveEntityMeta(
  type: ShareEntityType,
  id: string,
): Promise<EntityMeta> {
  const cacheKey = `${type}:${id}`;
  const cached = metaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.meta;
  }

  const meta: EntityMeta = {
    title: id,
    subtitle: "OFFY Music Player",
    badge: type === "track" ? "Faixa" : type === "playlist" ? "Playlist" : type === "album" ? "Álbum" : "Artista",
  };

  let resolvedFromDb = false;

  try {
    if (type === "track") {
      meta.badge = "Faixa";
      const rows = await sql`select title, artists, cover_url from tracks where id = ${id} limit 1`;
      if (rows.length > 0 && rows[0].title) {
        meta.title = rows[0].title;
        meta.subtitle = rows[0].artists || "OFFY Music";
        meta.coverUrl = rows[0].cover_url || null;
        resolvedFromDb = true;
      }
    } else if (type === "playlist") {
      meta.badge = "Playlist";
      const rows = await sql`select title, description from playlists where id::text = ${id} and is_public = true limit 1`;
      if (rows.length > 0 && rows[0].title) {
        meta.title = rows[0].title;
        meta.subtitle = rows[0].description || "Playlist curada no OFFY";
        resolvedFromDb = true;
      }
    } else if (type === "album") {
      meta.badge = "Álbum";
      meta.subtitle = "Álbum no OFFY";
    } else if (type === "artist") {
      meta.badge = "Artista";
      meta.title = decodeURIComponent(id);
      meta.subtitle = "Perfil de artista no OFFY";
    }
  } catch {
    // Fallback gracioso
  }

  if (!resolvedFromDb) {
    await fetchExternalMeta(type, id, meta);
  }

  if (metaCache.size > 500) metaCache.clear();
  metaCache.set(cacheKey, { meta, expiresAt: Date.now() + META_CACHE_TTL_MS });
  return meta;
}

const COMMON_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background-color: #060607;
    color: #ededed;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px 16px;
    -webkit-font-smoothing: antialiased;
  }

  .shell {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .brand-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 24px;
  }
  .brand-glyph {
    width: 22px;
    height: 22px;
  }
  .brand-wordmark {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #ededed;
  }

  .deck-card {
    background-color: #0f0f12;
    border: 1px solid rgba(237, 237, 237, 0.07);
    border-radius: 16px;
    padding: 28px 24px;
    width: 100%;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .meta-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    color: #85858b;
    background-color: #17171a;
    border: 1px solid rgba(237, 237, 237, 0.08);
    border-radius: 6px;
    padding: 3px 8px;
    margin-bottom: 20px;
    letter-spacing: 0.02em;
  }

  .disc-visual {
    width: 64px;
    height: 64px;
    border-radius: 12px;
    background-color: #17171b;
    border: 1px solid rgba(237, 237, 237, 0.07);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #85858b;
    margin-bottom: 20px;
  }
  .disc-visual svg {
    width: 28px;
    height: 28px;
  }

  .media-artwork {
    width: 136px;
    height: 136px;
    object-fit: cover;
    margin-bottom: 20px;
    border: 1px solid rgba(237, 237, 237, 0.09);
    background-color: #141416;
  }
  .media-artwork.square {
    border-radius: 10px;
  }
  .media-artwork.circle {
    border-radius: 50%;
  }

  h1 {
    font-size: 18px;
    font-weight: 600;
    line-height: 1.35;
    color: #ededed;
    margin-bottom: 6px;
    word-break: break-word;
    letter-spacing: -0.01em;
  }

  .subline {
    font-size: 13px;
    line-height: 1.5;
    color: #98989f;
    margin-bottom: 24px;
    max-width: 320px;
  }

  .action-stack {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 44px;
    width: 100%;
    background-color: #ededed;
    color: #0f0f12;
    font-size: 13.5px;
    font-weight: 600;
    border-radius: 8px;
    text-decoration: none;
    cursor: pointer;
    border: none;
    transition: background-color 150ms ease;
  }
  .btn-primary:hover {
    background-color: #dedede;
  }
  .btn-primary:active {
    transform: scale(0.99);
  }

  .btn-secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    width: 100%;
    background-color: transparent;
    color: #98989f;
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    border: 1px solid rgba(237, 237, 237, 0.08);
    text-decoration: none;
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
  }
  .btn-secondary:hover {
    background-color: #16161a;
    color: #ededed;
    border-color: rgba(237, 237, 237, 0.14);
  }

  .notice {
    font-size: 12px;
    color: #63636b;
    margin-top: 14px;
    line-height: 1.4;
  }

  .system-meta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #55555c;
    margin-top: 24px;
    letter-spacing: 0.02em;
  }
`;

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

export function renderNotFoundHtml(options?: {
  title?: string;
  message?: string;
}): string {
  const title = escapeHtml(options?.title || "Nada tocando por aqui");
  const message = escapeHtml(
    options?.message ||
      "O link acessado não existe, foi movido ou a faixa não está mais disponível.",
  );

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 • Conteúdo Não Encontrado • OFFY</title>
  
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="OFFY Music Player">
  <meta property="og:title" content="404 • Conteúdo Não Encontrado">
  <meta property="og:description" content="${message}">
  <meta name="theme-color" content="#060607">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    ${COMMON_CSS}
  </style>
</head>
<body>
  <main class="shell">
    <div class="brand-bar">
      ${OFFY_LOGO_SVG}
      <span class="brand-wordmark">OFFY</span>
    </div>

    <section class="deck-card">
      <span class="meta-tag">404 // Ausente</span>

      <div class="disc-visual" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m4.93 4.93 4.24 4.24"></path>
          <path d="m14.83 14.83 4.24 4.24"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </div>

      <h1>${title}</h1>
      <p class="subline">${message}</p>

      <div class="action-stack">
        <a href="offy://home" class="btn-primary">
          Abrir o OFFY
        </a>
        <a href="https://github.com/Gebe-0/offy-app/releases/latest" class="btn-secondary" target="_blank" rel="noopener noreferrer">
          Baixar reprodutor para Windows
        </a>
      </div>
    </section>

    <footer class="system-meta">
      OFFY AUDIO CORE // 44.1kHz • 24-bit
    </footer>
  </main>
</body>
</html>`;
}

export function renderShareHtml(
  type: ShareEntityType,
  id: string,
  meta: EntityMeta,
  autoRedirect = true
): string {
  const appDeepLink =
    type === "home" ? "offy://home" : `offy://${type}?id=${encodeURIComponent(id)}`;
  const safeTitle = escapeHtml(meta.title);
  const safeSubtitle = escapeHtml(meta.subtitle);
  const safeBadge = escapeHtml(meta.badge);
  const safeCoverUrl = meta.coverUrl ? escapeHtml(meta.coverUrl) : null;
  const safeDeepLink = escapeHtml(appDeepLink);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} • OFFY</title>
  
  <!-- OpenGraph / Social Embed -->
  <meta property="og:type" content="music.song">
  <meta property="og:site_name" content="OFFY Music Player">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeSubtitle}">
  ${safeCoverUrl ? `<meta property="og:image" content="${safeCoverUrl}">` : ""}
  <meta name="theme-color" content="#060607">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    ${COMMON_CSS}
  </style>
</head>
<body>
  <main class="shell">
    <div class="brand-bar">
      ${OFFY_LOGO_SVG}
      <span class="brand-wordmark">OFFY</span>
    </div>

    <section class="deck-card">
      <span class="meta-tag">${safeBadge}</span>

      ${
        safeCoverUrl
          ? `<img src="${safeCoverUrl}" alt="${safeTitle}" class="media-artwork ${type === "artist" ? "circle" : "square"}" />`
          : `<div class="disc-visual" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </div>`
      }

      <h1>${safeTitle}</h1>
      <p class="subline">${safeSubtitle}</p>

      <div class="action-stack">
        <a href="${safeDeepLink}" class="btn-primary" id="openBtn">
          Abrir no OFFY
        </a>
        <a href="https://github.com/Gebe-0/offy-app/releases/latest" class="btn-secondary" target="_blank" rel="noopener noreferrer">
          Baixar reprodutor para Windows
        </a>
      </div>

      <p class="notice">
        Se o app não abrir automaticamente, clique em <strong>Abrir no OFFY</strong> acima.
      </p>
    </section>

    <footer class="system-meta">
      OFFY AUDIO CORE // 44.1kHz • 24-bit
    </footer>
  </main>

  ${
    autoRedirect
      ? `<script>setTimeout(function () { window.location.href = ${JSON.stringify(appDeepLink)}; }, 150);</script>`
      : ""
  }
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

  for (const type of ["track", "playlist", "album", "artist"] as const) {
    app.get(`/${type}`, (req, rep) => handler(type, req, rep));
    app.get(`/${type}/:id`, (req, rep) => handler(type, req, rep));
  }
}
