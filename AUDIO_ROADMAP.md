# 🎧 Roadmap do Motor de Áudio — OFFY Music Player

Este documento reúne o planejamento técnico e especificações das melhorias planejadas para o motor de áudio do **OFFY** (`apps/client/src/features/player`).

---

## 📌 1. Crossfade Simultâneo Real (*Dual-Deck Overlap*)

### Contexto Atual
- No estado atual (`playerRuntime.ts`), quando a música atinge o limiar `currentTime >= duration - crossfadeDuration`, o player inicia um *fade-out* do volume da música atual até 0.
- Somente quando o volume chega a zero é disparado o `SKIP_NEXT`, iniciando a próxima faixa do zero.
- Ou seja, trata-se de um **fade-out sequencial**, e não de uma transição contínua.

### Especificação da Melhoria
- **Arquitetura Dual-Deck (`Deck A` e `Deck B`):**
  - Manter dois nós de reprodução HTMLAudioElement/AudioContext ativos (`primary` e `secondary`).
  - Quando a faixa atual no Deck A atingir `duration - crossfadeDuration`, o Deck B é preparado e inicia imediatamente a reprodução da próxima faixa com volume 0.
  - Uma curva linear/exponencial via Web Audio API ajusta simultaneamente:
    - **Deck A (saindo):** Volume vai de `100%` para `0%` ao longo do tempo de crossfade.
    - **Deck B (entrando):** Volume sobe de `0%` para `100%` exatamente no mesmo intervalo.
  - Ao terminar o tempo de crossfade, o Deck A é pausado e limpo, e o Deck B assume como player principal.
- **Benefício:** Transições perfeitas entre faixas sem silêncio entre músicas, idêntico ao comportamento do Spotify e Apple Music.

---

## 📌 2. Auto-Recuperação de URLs Expiradas (Erro 403 YouTube)

### Contexto Atual
- As URLs diretas de streaming de áudio resolvidas via InnerTube possuem tokens de expiração assinados pelo YouTube (`expire=...`, duração aproximada de 6 horas).
- Se o usuário pausar a reprodução e voltar horas depois, ou deixar o player aberto de um dia para o outro, a tag de áudio encontra erro HTTP 403 (Forbidden) ao tentar reproduzir ou buscar novas faixas do buffer.

### Especificação da Melhoria
- **Interceptor de Falha de Streaming no `playerRuntime`:**
  - Adicionar listener para eventos de erro de mídia no elemento de áudio (`audioEl.error` com código `MEDIA_ERR_NETWORK` ou falha de requisição com status 403).
  - Implementar mecanismo de *retry* transparente:
    1. Captura o `positionMs` exato onde a música foi interrompida.
    2. Invoca silenciosamente `resolveDirectAudioStream(trackId)` para obter uma nova URL de stream com token renovado.
    3. Reatribui o `src` do player de áudio com a nova URL e restaura a posição `currentTime = positionMs / 1000`.
    4. Se a faixa estava no estado `playing`, retoma a reprodução automaticamente sem intervenção do usuário.
- **Benefício:** O usuário nunca mais sofrerá com músicas que "travam no pause" ou que não tocam após longos períodos de inatividade.

---

## 📌 3. Pre-buffering Preditivo e Cache em Disco

### Especificação da Melhoria
- **Pre-buffering da Próxima Música:**
  - Quando a música atual atinge 80% da duração, o InnerTube resolver já busca a URL da próxima faixa da fila em background e inicializa o preload.
- **Otimização de Cache Local:**
  - Validação de integridade e descarte automático de blocos corrompidos no IndexedDB (`linerDb` / `offyDb`) com limite configurável de armazenamento (ex: 1 GB a 5 GB) e política de expiração LRU (*Least Recently Used*).
