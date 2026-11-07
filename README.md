# 🎵 OFFY Music Player

<div align="center">

<img src="./.github/assets/logo.png" width="96" alt="OFFY Logo" />

### Reprodutor musical desktop ultrarrápido, livre de anúncios e com sincronização coletiva.

[![Versão](https://img.shields.io/badge/Versão-1.1.5-E11D48?style=for-the-badge)](https://github.com/Gebe-0/offy-app)
[![Documentação](https://img.shields.io/badge/Documentação-DOCUMENTATION.md-3B82F6?style=for-the-badge)](./DOCUMENTATION.md)
[![Suporte Discord](https://img.shields.io/badge/Suporte%20Discord-@arlw__-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com)
[![Editor](https://img.shields.io/badge/Editor-GEBE--OFFY-10B981?style=for-the-badge)](https://github.com/Gebe-0/offy-app)

[📖 Ler Documentação Completa](./DOCUMENTATION.md) • [🎧 Sistema de Jam](./DOCUMENTATION.md#4-sistema-de-jam-sessões-coletivas-em-tempo-real) • [🎛️ Equalizador 10-Bandas](./DOCUMENTATION.md#3-equalizador-de-10-bandas-velocidade-e-pitch) • [💬 Suporte (@arlw_)](./DOCUMENTATION.md#10-suporte-e-comunidade)

</div>

---

## 🌟 Destaques do OFFY

- **Zero Anúncios & Zero Rastreamento:** Audição limpa, ininterrupta e sem telemetria abusiva.
- **OFFY Jam (Ouvir Junto):** Sessões em grupo em tempo real com código de convite, permissões de controle e sincronização SSE anti-drift.
- **Equalizador Paramétrico de 10 Bandas:** Controle cirúrgico de frequências (32 Hz a 16 kHz), presets sonoros e controle de velocidade/pitch.
- **Letras Word-Level (Karaokê):** Pipeline inteligente de provedores (`bLyrics`, `Unison`, `LRCLIB`) com visualizador Fullscreen e shaders WebGL dinâmicos.
- **Biblioteca e Isolamento de Contas:** Perfis 100% isolados, sem vazamento de histórico, curtidas ou mixes diários.
- **Discord Rich Presence:** Integração nativa com Discord exibindo status ao vivo e sessão Jam.

---

## 🏗️ Estrutura do Monorepo

```
offy/
├── apps/
│   ├── api/            # Fastify + PostgreSQL (Oracle Cloud Dedicated VM) — auth, catálogo, biblioteca, social, letras, jam
│   └── client/         # Cliente desktop OFFY (Electron + React + TypeScript + Tailwind)
├── packages/
│   ├── core/           # InnerTube (busca, browse, streaming de alta qualidade), letras
│   └── contracts/      # Contratos e tipos compartilhados da API (TypeScript)
├── migrations/         # Migrações versionadas do PostgreSQL (001, 002, 003...)
├── scripts/            # Scripts de automação (migrate.mjs, clear-cache.mjs)
└── DOCUMENTATION.md    # Guia e documentação técnica oficial de todo o ecossistema
```

---

## 🔊 Como o Áudio Funciona

O catálogo e o áudio são resolvidos **diretamente no cliente**:
`clientCatalog` comunica-se com o InnerTube, e o servidor atua exclusivamente como facilitador e fallback.
Isso significa que não existe gargalo de tráfego de áudio na API — e não é preciso mintar PO token no servidor.

Perfis InnerTube utilizados e validados:

- `WEB_REMIX` para catálogo e buscas.
- `VISIONOS` e `ANDROID_VR` para áudio com máxima taxa de bits e sem restrições.

---

## 🎤 Letras — Pipeline de Alta Precisão

O backend roda o mesmo chain de providers de alto padrão via `@braccato/provider-blyrics`:

```
blyrics → unison → binimum → portato → legato → lrclib-synced → lrclib-plain
Better     Unison   BiniLyrics  QQ Music  Kugou     LRCLIB        LRCLIB plain
Lyrics
```

- `blyrics` entrega letras **palavra por palavra** (TTML) com timestamps ultraprecisos.
- O chain para no primeiro provider que encontra a faixa — otimizando velocidade e tráfego.
- `GET /v1/tracks/:id/lyrics` responde via **Server-Sent Events (SSE)** em tempo real.
- Cache inteligente em PostgreSQL com TTL de 7 dias para respostas em menos de 20 ms.

---

## 🚀 Como Executar Localmente

```bash
# 1. Executar migrações do banco
node scripts/migrate.mjs

# 2. Iniciar a API
pnpm --filter @offy/api build
pnpm --filter @offy/api start        # http://127.0.0.1:8787

# 3. Iniciar o cliente desktop
pnpm --filter @offy/client install
pnpm --filter @offy/client dev
```

### Build do Instalador Windows (NSIS)

```bash
pnpm --filter @offy/client electron:build:win
# Instalador gerado em release/OFFY-Setup-0.1.0.exe
```

---

## ⚙️ Variáveis de Ambiente

### `.env` na raiz (API):

```env
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DATABASE_URL_DIRECT=postgresql://.../neondb?sslmode=require
PORT=8787
HOST=127.0.0.1
AUTH_SECRET=<32 bytes hex>
CORS_ORIGIN=*
```

### Configuração do Cliente (.env):

```env
VITE_API_URL=https://api.cloudfy.shop
```

---

## 🧪 Testes e Validação

```bash
pnpm --filter @offy/api exec tsx src/e2e.ts          # Testes E2E da API
pnpm --filter @offy/api exec tsx src/lyrics-test.ts  # Teste do pipeline de letras
node scripts/clear-lyrics-cache.mjs                  # Limpeza do cache de letras
```

---

## 💬 Suporte e Contato

Dúvidas, suporte técnico direto ou sugestões:

- **Discord do Desenvolvedor:** **`@arlw_`**
- **Guia Completo:** Consulte o [DOCUMENTATION.md](./DOCUMENTATION.md) para detalhes de atalhos, arquitetura, equalizador e soluções de problemas.

---

<div align="center">

Desenvolvido por **GEBE - OFFY** • 2026

</div>
