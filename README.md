# OFFY

Backend próprio + cliente Liner, zero custo de infraestrutura.

```
new-app/
  apps/api        Fastify + Postgres (Neon) — auth, catálogo, biblioteca, social, letras
  apps/liner      Cliente desktop (Electron + React) do repositório Liner
  packages/core   InnerTube (busca, browse, player), letras (LRCLIB)
  packages/contracts  Tipos compartilhados do contrato HTTP
  migrations      SQL versionado (001, 002, 003)
  scripts         migrate.mjs, static.mjs
```

## Como o áudio funciona

O catálogo e o áudio são resolvidos **no cliente** (como no Liner original):
`clientCatalog` fala com o InnerTube, e o servidor só é usado como fallback.
Isso significa que não existe endpoint de playback na API — e não é preciso
mintar PO token no servidor.

Perfis InnerTube usados (validados): `WEB_REMIX` para catálogo,
`VISIONOS` e `ANDROID_VR` para áudio. WEB_REMIX responde `UNPLAYABLE` para
playback sem PO token, por isso os perfis de app entram como fallback.

## Letras — mesmo pipeline do Liner

O backend roda o **mesmo chain de providers** que o Liner usava, via
`@braccato/provider-blyrics`:

```
blyrics → unison → binimum → portato → legato → lrclib-synced → lrclib-plain
Better     Unison   BiniLyrics  QQ Music  Kugou     LRCLIB        LRCLIB plain
Lyrics
```

- `blyrics` entrega **word-level** (TTML): cada palavra com timestamp.
- O chain para no primeiro provider que acerta — os seguintes nem são chamados.
- `GET /v1/tracks/:id/lyrics` responde **SSE** com um evento por provider
  (`found` / `not_found`) e um `done` com o melhor resultado. O cliente monta
  o seletor de providers com esses eventos.
- Se já houver resultado em `lyrics_cache` (TTL 7 dias), responde JSON com
  `cached: true` em vez do stream.
- O `videoId` é passado ao provider Unison, que casa pela faixa exata do YouTube.

Validado: `Never Gonna Give You Up`, `Despacito` e `Shape of You` retornam
word-level em 200–500 ms, 58–95 linhas.


## Rodar local

```bash
# 1. banco
node scripts/migrate.mjs

# 2. API
pnpm --filter @offy/api build
pnpm --filter @offy/api start        # http://127.0.0.1:8787

# 3. cliente
cd apps/liner
pnpm install
pnpm build
pnpm exec electron-builder --win --x64
# instalador em release/OFFY-Setup-0.1.0.exe
```

## Variáveis

`.env` na raiz (API):

```
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DATABASE_URL_DIRECT=postgresql://.../neondb?sslmode=require
PORT=8787
HOST=127.0.0.1
AUTH_SECRET=<32 bytes hex>
CORS_ORIGIN=*
```

`apps/liner/.env` (cliente, lido em build time):

```
VITE_API_URL=http://127.0.0.1:8787
```

Trocar `VITE_API_URL` e **recompilar** o cliente é o único passo para apontar
o app ao servidor público.

## Deploy

```bash
docker compose up -d --build
```

`docker-compose.yml` sobe a API em `:8080` e o Caddy com TLS automático
(`SITE_ADDRESS` no `.env`: domínio próprio ou `ip.sslip.io`).

Koyeb: build direto pelo `Dockerfile`, porta `8080`, variáveis do `.env`.

## Endpoints

Auth: `POST /v1/auth/{challenge,register,login,refresh,logout}`, `GET /v1/me`.
`challenge` responde 404 de propósito — desliga proof-of-work.

Catálogo: `GET /v1/catalog/{search,tracks/:id,albums/:id,artists/:id,playlists/:id}`.

Biblioteca: `GET/PUT/DELETE /v1/me/library/tracks[/:id]`,
`GET/PUT/DELETE /v1/me/library/{albums,artists,playlists}[/:id]`.

Playlists: `GET/POST /v1/me/playlists`, `GET/PATCH/DELETE /v1/me/playlists/:id`,
`POST /v1/me/playlists/:id/tracks/:trackId`, `POST /v1/me/playlists/:id/tracks`,
`DELETE .../items/:itemId`, `POST .../items/:itemId/move`.

Social: `GET /v1/users/search`, `GET/PATCH /v1/users/me`, `GET /v1/users/:id`,
`POST/DELETE /v1/users/:id/follow`, `GET /v1/users/:id/{followers,following,playlists,history}`.

Histórico: `POST /v1/me/playback/events`, `GET /v1/me/history`.
Explore: `GET /v1/explore/{popular,popular/albums,most-saved}`.
Leaderboards: `GET /v1/leaderboards/{global,artist/:id}`.
Presença: `POST /v1/presence/heartbeat`, `GET /v1/presence`, `DELETE /v1/presence`.
Letras: `GET /v1/tracks/:id/lyrics` (SSE), `GET /v1/me/lyrics/search`.
Recomendações: `GET /v1/me/recommendations/daily-mixes`.

## Testes

```bash
pnpm --filter @offy/api exec tsx src/e2e.ts          # 28 checagens da API
pnpm --filter @offy/api exec tsx src/lyrics-test.ts  # chain de letras
node scripts/clear-lyrics-cache.mjs                  # zera o cache de letras
```

## Notas de operação

- Neon free suspende após ~5 min de inatividade (cold start 300–800 ms).
  Um ping em `/health` a cada 5 min resolve.
- `prepare: false` na conexão é obrigatório com o pooler do Neon.
- `channel_binding=require` quebra o driver `pg` (não implementa SCRAM-PLUS).
  Remova esse parâmetro da URL.
- O instalador gerado aponta para `127.0.0.1:8787`. Para distribuir, defina
  `VITE_API_URL` com o host público e recompile.
