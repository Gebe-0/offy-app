import type { FastifyInstance } from "fastify";

export async function registerDocsRoutes(app: FastifyInstance) {
  const getDocsHtml = () => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentação Oficial • OFFY Music</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #09090b;
      --card-bg: rgba(24, 24, 27, 0.65);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --text-dim: #71717a;
      --accent: #ff3b3b;
      --accent-glow: rgba(255, 59, 59, 0.25);
      --jam-green: #34d399;
      --jam-glow: rgba(52, 211, 153, 0.25);
      --discord: #5865F2;
    }
    
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.6;
      overflow-x: hidden;
      position: relative;
    }

    /* Background Ambient Lights */
    .glow-left {
      position: fixed;
      top: -150px;
      left: -150px;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(255, 59, 59, 0.12) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .glow-right {
      position: fixed;
      bottom: -150px;
      right: -150px;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(52, 211, 153, 0.08) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    /* Top Navigation */
    header {
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      background: rgba(9, 9, 11, 0.8);
      border-bottom: 1px solid var(--card-border);
      padding: 0.9rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      color: inherit;
    }
    .logo-badge {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #ff3b3b, #ff7d7d);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      color: white;
      box-shadow: 0 4px 14px var(--accent-glow);
    }
    .logo-text {
      font-weight: 800;
      font-size: 1.15rem;
      letter-spacing: -0.02em;
    }
    .logo-sub {
      font-size: 0.75rem;
      color: var(--text-dim);
      background: rgba(255, 255, 255, 0.06);
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-weight: 600;
      margin-left: 0.4rem;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .discord-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(88, 101, 242, 0.15);
      color: #939aff;
      border: 1px solid rgba(88, 101, 242, 0.3);
      padding: 0.45rem 0.9rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
    }
    .discord-btn:hover {
      background: #5865F2;
      color: white;
      box-shadow: 0 4px 16px rgba(88, 101, 242, 0.4);
      transform: translateY(-1px);
    }

    /* Layout */
    .container {
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      gap: 2.5rem;
      padding: 2.5rem 2rem;
      flex: 1;
      position: relative;
      z-index: 10;
    }

    /* Sidebar Navigation */
    .sidebar {
      width: 260px;
      flex-shrink: 0;
      position: sticky;
      top: 5rem;
      height: calc(100vh - 6rem);
      overflow-y: auto;
      padding-right: 1rem;
    }
    .sidebar::-webkit-scrollbar { width: 4px; }
    .sidebar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }

    .nav-group {
      margin-bottom: 1.5rem;
    }
    .nav-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--text-dim);
      letter-spacing: 0.08em;
      margin-bottom: 0.6rem;
      padding-left: 0.75rem;
    }
    .nav-links {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .nav-item a {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.88rem;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .nav-item a:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.06);
    }
    .nav-item.active a {
      color: white;
      background: rgba(255, 59, 59, 0.12);
      border-left: 3px solid var(--accent);
      font-weight: 600;
    }

    /* Main Content */
    .content {
      flex: 1;
      min-width: 0;
    }

    .hero-banner {
      background: linear-gradient(135deg, rgba(255, 59, 59, 0.08) 0%, rgba(24, 24, 27, 0.4) 100%);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 2.2rem;
      margin-bottom: 2.5rem;
      position: relative;
      overflow: hidden;
    }
    .hero-banner h1 {
      font-size: 2.2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 0.75rem;
      background: linear-gradient(135deg, #ffffff 40%, #d4d4d8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero-banner p {
      color: var(--text-muted);
      font-size: 1.05rem;
      max-width: 700px;
      line-height: 1.6;
    }

    /* Sections */
    section {
      margin-bottom: 3.5rem;
      scroll-margin-top: 5rem;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.75rem;
    }
    .section-icon {
      font-size: 1.5rem;
    }
    .section-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 1.25rem;
      transition: border-color 0.2s ease;
    }
    .card:hover {
      border-color: rgba(255, 255, 255, 0.15);
    }
    .card h3 {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      color: white;
    }
    .card p {
      color: var(--text-muted);
      font-size: 0.95rem;
      line-height: 1.6;
    }

    /* Feature Grid */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.25rem;
    }

    /* Code Snippet / Badge */
    code, .key-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      color: #fafafa;
    }
    .key-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    .key-table th, .key-table td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--card-border);
      font-size: 0.9rem;
    }
    .key-table th {
      color: var(--text-dim);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Support Box */
    .support-box {
      background: linear-gradient(135deg, rgba(88, 101, 242, 0.12) 0%, rgba(24, 24, 27, 0.6) 100%);
      border: 1px solid rgba(88, 101, 242, 0.25);
      border-radius: 20px;
      padding: 2.2rem;
      position: relative;
      overflow: hidden;
    }
    .support-box::before {
      content: "";
      position: absolute;
      top: -40px;
      right: -40px;
      width: 180px;
      height: 180px;
      background: radial-gradient(circle, rgba(88, 101, 242, 0.25) 0%, transparent 70%);
      pointer-events: none;
    }
    .support-tag-box {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(88, 101, 242, 0.35);
      padding: 0.6rem 1.2rem;
      border-radius: 12px;
      margin: 1.25rem 0;
    }
    .support-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.25rem;
      font-weight: 700;
      color: #939aff;
    }
    .copy-btn {
      background: #5865F2;
      color: white;
      border: none;
      padding: 0.4rem 0.85rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .copy-btn:hover {
      background: #4752c4;
      transform: scale(1.03);
    }
    .copy-btn:active {
      transform: scale(0.97);
    }

    /* Step guide */
    .step-item {
      display: flex;
      gap: 1.2rem;
      margin-bottom: 1.25rem;
    }
    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(52, 211, 153, 0.15);
      color: var(--jam-green);
      border: 1px solid rgba(52, 211, 153, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.95rem;
      flex-shrink: 0;
    }
    .step-content h4 {
      font-size: 1.05rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    /* Responsive */
    @media (max-width: 860px) {
      .container { flex-direction: column; padding: 1.5rem 1rem; }
      .sidebar { display: none; }
      .hero-banner { padding: 1.5rem; }
      .hero-banner h1 { font-size: 1.7rem; }
    }
  </style>
</head>
<body>
  <div class="glow-left"></div>
  <div class="glow-right"></div>

  <!-- Header -->
  <header>
    <a href="#" class="logo-container">
      <div class="logo-badge">O</div>
      <span class="logo-text">OFFY</span>
      <span class="logo-sub">Docs</span>
    </a>
    <div class="header-actions">
      <a href="#suporte" class="discord-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.894a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        Suporte Discord: @arlw_
      </a>
    </div>
  </header>

  <!-- Container -->
  <div class="container">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="nav-group">
        <div class="nav-title">Comece Aqui</div>
        <ul class="nav-links">
          <li class="nav-item active"><a href="#visao-geral">🚀 Visão Geral</a></li>
          <li class="nav-item"><a href="#reproducao">🎵 Motor de Áudio</a></li>
          <li class="nav-item"><a href="#jam">👥 Ouvir Juntos (Jam)</a></li>
          <li class="nav-item"><a href="#letras">🎤 Letras & Tela Cheia</a></li>
        </ul>
      </div>

      <div class="nav-group">
        <div class="nav-title">Recursos</div>
        <ul class="nav-links">
          <li class="nav-item"><a href="#biblioteca">📚 Biblioteca & Playlists</a></li>
          <li class="nav-item"><a href="#discord">🎮 Discord Rich Presence</a></li>
          <li class="nav-item"><a href="#atalhos">⌨️ Atalhos de Teclado</a></li>
        </ul>
      </div>

      <div class="nav-group">
        <div class="nav-title">Ajuda & Contato</div>
        <ul class="nav-links">
          <li class="nav-item"><a href="#suporte">💬 Suporte Oficial (@arlw_)</a></li>
          <li class="nav-item"><a href="#faq">❓ Dúvidas Frequentes</a></li>
        </ul>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="content">
      <!-- Hero Banner -->
      <div class="hero-banner">
        <h1>Documentação Oficial do OFFY</h1>
        <p>
          O OFFY é um player de música desktop de última geração, desenhado para máxima fidelidade sonora, sincronização colaborativa em tempo real (Jam) e experiência visual fluida.
        </p>
      </div>

      <!-- 1. Visão Geral -->
      <section id="visao-geral">
        <div class="section-header">
          <span class="section-icon">🚀</span>
          <h2 class="section-title">Visão Geral</h2>
        </div>
        <div class="card">
          <h3>O que é o OFFY?</h3>
          <p>
            O OFFY combina um catálogo ilimitado de faixas com algoritmos próprios de recomendação (Daily Mixes), equalizador paramétrico de 10 bandas, sincronização de letras ao vivo e modo Jam colaborativo para ouvir em grupo sem atrasos.
          </p>
        </div>
        <div class="grid-2">
          <div class="card">
            <h3>🔒 Privacidade Total</h3>
            <p>Seus hábitos de escuta e biblioteca são estritamente isolados da sua conta. O OFFY nunca compartilha seus mixes diários com outros usuários.</p>
          </div>
          <div class="card">
            <h3>⚡ Performance Ultra Rápida</h3>
            <p>Construído sobre uma stack moderna com Electron, React, Tailwind v4 e acelerado por GPU, consumindo o mínimo de memória e bateria.</p>
          </div>
        </div>
      </section>

      <!-- 2. Motor de Reprodução -->
      <section id="reproducao">
        <div class="section-header">
          <span class="section-icon">🎵</span>
          <h2 class="section-title">Motor de Reprodução & Áudio</h2>
        </div>
        <div class="card">
          <h3>Equalizador Integrado (10 Bandas)</h3>
          <p>
            Acesse o equalizador pelo ícone de ajustes na barra de reprodução. Escolha entre dezenas de predefinições calibradas por engenheiros de áudio:
          </p>
          <ul style="margin: 0.8rem 0 0 1.4rem; color: var(--text-muted); font-size: 0.92rem;">
            <li><strong>Hi-Fi:</strong> Graves encorpados e agudos arejados, mantendo médios intactos.</li>
            <li><strong>Clareza:</strong> Remove excesso de médios-graves para instrumentos mais nítidos.</li>
            <li><strong>Super Graves & Punch:</strong> Resposta estendida para batidas fortes e subgraves.</li>
            <li><strong>Fones de Ouvido & Notebook:</strong> Otimização acústica para falantes pequenos.</li>
          </ul>
        </div>
        <div class="grid-2">
          <div class="card">
            <h3>Velocidade & Tom (Speed & Pitch)</h3>
            <p>
              Altere a velocidade da faixa de 0.5x até 2.0x e o tom em semitons. No modo "Vincular velocidade ao tom", simula a física de fitas cassete e discos de vinil vintage.
            </p>
          </div>
          <div class="card">
            <h3>Modo Rádio Infinito</h3>
            <p>
              Ao final de qualquer playlist ou faixa avulsa, o motor Radio Wave analisa o perfil harmônico da música e carrega faixas similares continuamente sem interrupções.
            </p>
          </div>
        </div>
      </section>

      <!-- 3. Jam (Ouvir Juntos) -->
      <section id="jam">
        <div class="section-header">
          <span class="section-icon">👥</span>
          <h2 class="section-title">Ouvir Juntos (Jam)</h2>
        </div>
        <div class="card">
          <p style="margin-bottom: 1.25rem;">
            O sistema Jam permite que você e seus amigos escutem as mesmas músicas com sincronização instantânea em tempo real (play, pause, busca e troca de faixa).
          </p>

          <div class="step-item">
            <div class="step-number">1</div>
            <div class="step-content">
              <h4>Criar uma Sala</h4>
              <p>Clique no ícone de Jam (duas pessoas) na barra lateral esquerda e selecione "Criar Sala". Um código exclusivo de 6 dígitos será gerado imediatamente.</p>
            </div>
          </div>

          <div class="step-item">
            <div class="step-number">2</div>
            <div class="step-content">
              <h4>Convidar Amigos</h4>
              <p>Envie o código de 6 dígitos ou clique em "Copiar Link" para compartilhar a URL de convite direta.</p>
            </div>
          </div>

          <div class="step-item">
            <div class="step-number">3</div>
            <div class="step-content">
              <h4>Entrar com Código</h4>
              <p>Seus amigos podem clicar no botão Jam na barra lateral, selecionar "Entrar com Código" e inserir as 6 letras/números nos slots de PIN, ou simplesmente abrir o link recebido.</p>
            </div>
          </div>

          <div class="step-item">
            <div class="step-number">4</div>
            <div class="step-content">
              <h4>Controle de Permissões do Host</h4>
              <p>Como criador (Host), você pode ativar ou desativar o interruptor <strong>"Controle de convidados"</strong>. Se desativado, apenas você poderá trocar, pausar ou alterar a fila da Jam.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 4. Letras & Tela Cheia -->
      <section id="letras">
        <div class="section-header">
          <span class="section-icon">🎤</span>
          <h2 class="section-title">Letras Sincronizadas & Modo Tela Cheia</h2>
        </div>
        <div class="card">
          <h3>Experiência Visual Imersiva</h3>
          <p>
            Pressione <span class="key-badge">F</span> ou clique no botão de tela cheia no player para expandir a interface. As letras são sincronizadas linha a linha em tempo real com renderização fluida sobre o fundo ambiente da capa do álbum.
          </p>
        </div>
      </section>

      <!-- 5. Biblioteca & Playlists -->
      <section id="biblioteca">
        <div class="section-header">
          <span class="section-icon">📚</span>
          <h2 class="section-title">Biblioteca & Importação de Playlists</h2>
        </div>
        <div class="card">
          <h3>Importe de Outras Plataformas em 1 Clique</h3>
          <p>
            Você não precisa recriar suas playlists do zero. No menu lateral, clique em "Nova Playlist" e vá na aba <strong>"Importar"</strong>. Cole o link público de qualquer serviço suportado:
          </p>
          <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1rem;">
            <code>Spotify</code>
            <code>YouTube / YouTube Music</code>
            <code>Apple Music</code>
            <code>Deezer</code>
            <code>SoundCloud</code>
          </div>
        </div>
      </section>

      <!-- 6. Discord RPC -->
      <section id="discord">
        <div class="section-header">
          <span class="section-icon">🎮</span>
          <h2 class="section-title">Integração com Discord Rich Presence</h2>
        </div>
        <div class="card">
          <h3>Mostre o que você está ouvindo</h3>
          <p>
            Em <strong>Configurações &rarr; Integrações &rarr; Discord RPC</strong>, você pode habilitar a presença de status no seu perfil do Discord. O OFFY exibe automaticamente o título, artista, capa do álbum e barra de tempo decorrido.
          </p>
        </div>
      </section>

      <!-- 7. Atalhos de Teclado -->
      <section id="atalhos">
        <div class="section-header">
          <span class="section-icon">⌨️</span>
          <h2 class="section-title">Atalhos de Teclado</h2>
        </div>
        <div class="card" style="padding: 0; overflow: hidden;">
          <table class="key-table">
            <thead>
              <tr>
                <th>Ação</th>
                <th>Tecla de Atalho</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Tocar / Pausar</td>
                <td><span class="key-badge">Espaço</span></td>
              </tr>
              <tr>
                <td>Próxima Faixa</td>
                <td><span class="key-badge">Ctrl</span> + <span class="key-badge">&rarr;</span></td>
              </tr>
              <tr>
                <td>Faixa Anterior</td>
                <td><span class="key-badge">Ctrl</span> + <span class="key-badge">&larr;</span></td>
              </tr>
              <tr>
                <td>Avançar / Retroceder 5 segundos</td>
                <td><span class="key-badge">&rarr;</span> / <span class="key-badge">&larr;</span></td>
              </tr>
              <tr>
                <td>Aumentar / Diminuir Volume</td>
                <td><span class="key-badge">&uarr;</span> / <span class="key-badge">&darr;</span></td>
              </tr>
              <tr>
                <td>Alternar Modo Tela Cheia</td>
                <td><span class="key-badge">F</span></td>
              </tr>
              <tr>
                <td>Abrir Fila de Reprodução</td>
                <td><span class="key-badge">Q</span></td>
              </tr>
              <tr>
                <td>Buscar Músicas</td>
                <td><span class="key-badge">Ctrl</span> + <span class="key-badge">K</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 8. Suporte Oficial -->
      <section id="suporte">
        <div class="section-header">
          <span class="section-icon">💬</span>
          <h2 class="section-title">Suporte Oficial & Atendimento</h2>
        </div>
        <div class="support-box">
          <h3 style="font-size: 1.4rem; font-weight: 800; color: white; margin-bottom: 0.5rem;">
            Precisa de ajuda ou encontrou algum problema?
          </h3>
          <p style="color: #d4d4d8; font-size: 0.98rem; max-width: 650px;">
            O suporte do OFFY é prestado diretamente no privado pelo desenvolvedor no Discord. Fique à vontade para tirar dúvidas, reportar bugs ou enviar sugestões para o app.
          </p>

          <div class="support-tag-box">
            <span style="font-size: 0.85rem; color: #a1a1aa; font-weight: 600;">DISCORD:</span>
            <span class="support-tag" id="discord-tag">@arlw_</span>
            <button class="copy-btn" id="copy-btn" onclick="copyDiscordTag()">Copiar Tag</button>
          </div>

          <p style="font-size: 0.85rem; color: #a1a1aa;">
            Dica: No Discord, abra <em>Adicionar Amigo</em> ou inicie uma conversa privada buscando por <strong>@arlw_</strong>.
          </p>
        </div>
      </section>

      <!-- 9. FAQ -->
      <section id="faq">
        <div class="section-header">
          <span class="section-icon">❓</span>
          <h2 class="section-title">Perguntas Frequentes</h2>
        </div>
        <div class="card">
          <h3>Como funciona a sincronização da Jam?</h3>
          <p>
            A sincronização utiliza conexão SSE (Server-Sent Events) de ultra baixa latência. Se houver qualquer variação de rede, o aplicativo compensa automaticamente os milissegundos para manter todos os ouvintes no mesmo instante da música.
          </p>
        </div>
        <div class="card">
          <h3>O aplicativo tem anúncios?</h3>
          <p>
            Não! O OFFY foi desenvolvido para fornecer uma experiência pura, limpa e contínua de reprodução sem propagandas invasivas.
          </p>
        </div>
        <div class="card">
          <h3>Como atualizar o app?</h3>
          <p>
            O OFFY possui um sistema de atualização integrado. Ao abrir o aplicativo, se uma nova versão estiver disponível, um aviso com o botão "Atualizar" será exibido. Você também pode verificar manualmente em <strong>Configurações &rarr; Sobre</strong>.
          </p>
        </div>
      </section>
    </main>
  </div>

  <script>
    function copyDiscordTag() {
      const tag = "@arlw_";
      navigator.clipboard.writeText(tag).then(() => {
        const btn = document.getElementById("copy-btn");
        const originalText = btn.innerText;
        btn.innerText = "Copiado! ✓";
        btn.style.background = "#34d399";
        btn.style.color = "#000";
        setTimeout(() => {
          btn.innerText = originalText;
          btn.style.background = "#5865F2";
          btn.style.color = "#fff";
        }, 2200);
      });
    }

    // Scroll spy for active sidebar nav
    window.addEventListener("scroll", () => {
      const sections = document.querySelectorAll("section");
      const navLinks = document.querySelectorAll(".nav-item");
      let current = "";
      
      sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (pageYOffset >= sectionTop - 120) {
          current = section.getAttribute("id");
        }
      });

      navLinks.forEach(link => {
        link.classList.remove("active");
        if (link.querySelector("a").getAttribute("href") === "#" + current) {
          link.classList.add("active");
        }
      });
    });
  </script>
</body>
</html>`;

  // Rota principal para a documentação web
  app.get("/docs", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(getDocsHtml());
  });

  // Alias na v1
  app.get("/v1/docs", async (_request, reply) => {
    return reply.redirect("/docs");
  });
}
