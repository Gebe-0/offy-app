import { create } from "zustand";
import { getApiBaseUrl } from "@/shared/api/baseUrl";
import { getValidAccessToken, getAuthSession } from "@/shared/api/auth-session";
import { toClientTrack } from "@/shared/api/track";
import { showToast } from "@/shared/ui";
import { usePlayerStore, playerEngine, playerRuntime } from "@/features/player";
import type { Track } from "@/shared/types";
import type { JamParticipant, JamRoomState, JamSyncEvent } from "../types";

let activeEventSource: EventSource | null = null;
let pollIntervalTimer: ReturnType<typeof setInterval> | null = null;
let isRemoteSyncing = false;
let lastSyncTimestamp = 0;

export interface JamState {
  code: string | null;
  isHost: boolean;
  isOpen: boolean;
  isConnecting: boolean;
  error: string | null;
  allowGuestControl: boolean;
  queue: Track[];
  participants: JamParticipant[];
  shareUrl: string | null;
  jamDeepLink: string | null;

  openModal: () => void;
  closeModal: () => void;
  createJam: () => Promise<void>;
  joinJam: (code: string) => Promise<boolean>;
  leaveJam: () => Promise<void>;
  updateSettings: (allowGuestControl: boolean) => Promise<void>;
  addToQueue: (track: Track) => Promise<void>;
  removeFromQueue: (trackId: string) => Promise<void>;
}

export const useJamStore = create<JamState>((set, get) => ({
  code: null,
  isHost: false,
  isOpen: false,
  isConnecting: false,
  error: null,
  allowGuestControl: true,
  queue: [],
  participants: [],
  shareUrl: null,
  jamDeepLink: null,

  openModal: () => set({ isOpen: true, error: null }),
  closeModal: () => set({ isOpen: false }),

  createJam: async () => {
    set({ isConnecting: true, error: null });
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error("Você precisa estar conectado para criar uma Jam.");
      }

      const currentPlayerState = usePlayerStore.getState();
      const currentTrack = currentPlayerState.currentTrack ?? undefined;

      const res = await fetch(`${getApiBaseUrl()}/v1/jam/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentTrack,
          positionMs: currentPlayerState.positionMs,
          status: currentPlayerState.status,
          allowGuestControl: get().allowGuestControl,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Erro ao criar Jam.");
      }

      const data = (await res.json()) as {
        ok: boolean;
        room: JamRoomState;
        jamUrl: string;
        shareUrl: string;
      };

      playerEngine.setJamBridge({
        canControlPlayback: () => {
          const { isHost, allowGuestControl } = get();
          return isHost || allowGuestControl;
        },
        isHost: () => get().isHost,
        onSkipNext: () => {
          const { code, isHost, allowGuestControl } = get();
          if (!code || isHost || !allowGuestControl) return;
          void getValidAccessToken().then((token) => {
            if (token) {
              void sendJamSync(code, token, {
                action: "SKIP_NEXT",
              });
            }
          });
        },
        onSkipPrevious: () => {
          const { code, isHost, allowGuestControl } = get();
          if (!code || isHost || !allowGuestControl) return;
          void getValidAccessToken().then((token) => {
            if (token) {
              void sendJamSync(code, token, {
                action: "SKIP_PREV",
              });
            }
          });
        },
      });

      set({
        code: data.room.code,
        isHost: true,
        allowGuestControl: data.room.allowGuestControl ?? true,
        queue: (data.room.queue || []).map(toClientTrack),
        participants: data.room.participants,
        shareUrl: data.shareUrl,
        jamDeepLink: data.jamUrl,
        isConnecting: false,
        isOpen: true,
      });

      startRealtimeSync(data.room.code, token);

      showToast.checkmark(`Jam criada com sucesso! Código: ${data.room.code}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao criar Jam.";
      set({ error: msg, isConnecting: false });
      showToast.error(msg);
    }
  },

  joinJam: async (rawCode: string) => {
    let text = rawCode.trim();
    try {
      if (
        text.includes("://") ||
        text.startsWith("offy:") ||
        text.startsWith("http")
      ) {
        const u = new URL(text);
        const idParam = u.searchParams.get("id");
        if (idParam) {
          text = idParam;
        } else {
          const parts = u.pathname.split("/").filter(Boolean);
          if (parts.length > 0) {
            text = parts[parts.length - 1]!;
          }
        }
      }
    } catch {
      // ignore url error
    }
    const match = text.match(/([A-Z0-9]{6})/i);
    const cleanCode = (match ? match[1]! : text.replace(/[^A-Z0-9]/g, ""))
      .toUpperCase()
      .slice(0, 6);

    if (cleanCode.length !== 6) {
      set({ error: "O código da Jam deve ter exatamente 6 dígitos." });
      return false;
    }

    set({ isConnecting: true, error: null });
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error("Você precisa estar conectado para entrar em uma Jam.");
      }

      const res = await fetch(`${getApiBaseUrl()}/v1/jam/${cleanCode}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 404) {
          throw new Error("Sala de Jam não encontrada. Verifique o código.");
        }
        throw new Error(err.message || "Não foi possível entrar na Jam.");
      }

      const data = (await res.json()) as {
        ok: boolean;
        room: JamRoomState;
        jamUrl: string;
        shareUrl: string;
      };

      const currentUserId = getAuthSession()?.user.id;
      const isHost = Boolean(
        currentUserId && data.room.hostId === currentUserId,
      );

      playerEngine.setJamBridge({
        canControlPlayback: () => {
          const { isHost, allowGuestControl } = get();
          return isHost || allowGuestControl;
        },
        isHost: () => get().isHost,
        onSkipNext: () => {
          const { code, isHost, allowGuestControl } = get();
          if (!code || isHost || !allowGuestControl) return;
          void getValidAccessToken().then((token) => {
            if (token) {
              void sendJamSync(code, token, {
                action: "SKIP_NEXT",
              });
            }
          });
        },
        onSkipPrevious: () => {
          const { code, isHost, allowGuestControl } = get();
          if (!code || isHost || !allowGuestControl) return;
          void getValidAccessToken().then((token) => {
            if (token) {
              void sendJamSync(code, token, {
                action: "SKIP_PREV",
              });
            }
          });
        },
      });

      set({
        code: data.room.code,
        isHost,
        allowGuestControl: data.room.allowGuestControl ?? true,
        queue: (data.room.queue || []).map(toClientTrack),
        participants: data.room.participants,
        shareUrl: data.shareUrl,
        jamDeepLink: data.jamUrl,
        isConnecting: false,
        isOpen: true,
      });

      startRealtimeSync(data.room.code, token);

      // Sincroniza faixa inicial se o Host estiver tocando
      if (data.room.currentTrack && !isHost) {
        syncRemoteTrack(
          toClientTrack(data.room.currentTrack),
          data.room.status,
          data.room.positionMs,
          data.room.updatedAt,
        );
      }

      showToast.checkmark(`Conectado à Jam ${cleanCode}!`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao entrar na Jam.";
      set({ error: msg, isConnecting: false });
      showToast.error(msg);
      return false;
    }
  },

  updateSettings: async (allowGuestControl: boolean) => {
    const { code, isHost } = get();
    if (!code || !isHost) return;

    set({ allowGuestControl });
    try {
      const token = await getValidAccessToken();
      if (!token) return;

      await fetch(`${getApiBaseUrl()}/v1/jam/${code}/settings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ allowGuestControl }),
      });
      showToast.checkmark(
        allowGuestControl
          ? "Convidados agora podem alterar e pausar músicas."
          : "Controle de reprodução restrito ao Host.",
      );
    } catch {
      // rollback if failed
      set({ allowGuestControl: !allowGuestControl });
    }
  },

  addToQueue: async () => {},
  removeFromQueue: async () => {},

  leaveJam: async () => {
    const currentCode = get().code;
    playerEngine?.setJamBridge?.(null);
    stopRealtimeSync();

    if (currentCode) {
      try {
        const token = await getValidAccessToken();
        if (token) {
          void fetch(`${getApiBaseUrl()}/v1/jam/${currentCode}/leave`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          });
        }
      } catch {
        // ignore
      }
    }

    set({
      code: null,
      isHost: false,
      participants: [],
      queue: [],
      shareUrl: null,
      jamDeepLink: null,
      error: null,
    });
    showToast.info("Você saiu da sessão Jam.");
  },
}));

function stopRealtimeSync() {
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
  if (pollIntervalTimer) {
    clearInterval(pollIntervalTimer);
    pollIntervalTimer = null;
  }
}

function startRealtimeSync(code: string, token: string) {
  stopRealtimeSync();

  const sseUrl = `${getApiBaseUrl()}/v1/jam/${encodeURIComponent(code)}/events?token=${encodeURIComponent(token)}`;
  const es = new EventSource(sseUrl);
  activeEventSource = es;

  // Estado inicial completo recebido ao conectar
  es.addEventListener("init", (e) => {
    try {
      const room = JSON.parse(e.data) as JamRoomState;
      const currentUserId = getAuthSession()?.user.id;
      const isHost = Boolean(currentUserId && room.hostId === currentUserId);

      useJamStore.setState({
        isHost,
        allowGuestControl: room.allowGuestControl ?? true,
        queue: (room.queue || []).map(toClientTrack),
        participants: room.participants,
      });

      if (room.currentTrack && !isHost) {
        syncRemoteTrack(
          toClientTrack(room.currentTrack),
          room.status,
          room.positionMs,
          room.updatedAt,
        );
      }
    } catch {
      // ignore
    }
  });

  es.addEventListener("settings_updated", (e) => {
    try {
      const data = JSON.parse(e.data) as { allowGuestControl: boolean };
      useJamStore.setState({ allowGuestControl: data.allowGuestControl });
      showToast.info(
        data.allowGuestControl
          ? "O Host permitiu que todos controlem a música."
          : "O Host restringiu o controle de reprodução.",
      );
    } catch {
      // ignore
    }
  });

  es.addEventListener("queue_updated", (e) => {
    try {
      const data = JSON.parse(e.data) as { queue: unknown[] };
      useJamStore.setState({ queue: (data.queue || []).map(toClientTrack) });
    } catch {
      // ignore
    }
  });

  es.addEventListener("participant_joined", (e) => {
    try {
      const data = JSON.parse(e.data) as {
        user: JamParticipant;
        participants: JamParticipant[];
      };
      useJamStore.setState({ participants: data.participants });
      if (data.user.displayName) {
        showToast.checkmark(`${data.user.displayName} entrou na Jam!`);
      }
    } catch {
      // ignore
    }
  });

  es.addEventListener("participant_left", (e) => {
    try {
      const data = JSON.parse(e.data) as {
        userId: string;
        participants: JamParticipant[];
      };
      const previous = useJamStore.getState().participants;
      const leftUser = previous.find((p) => p.userId === data.userId);
      useJamStore.setState({ participants: data.participants });
      if (leftUser?.displayName) {
        showToast.info(`${leftUser.displayName} saiu da Jam.`);
      }
    } catch {
      // ignore
    }
  });

  es.addEventListener("jam_closed", () => {
    playerEngine?.setJamBridge?.(null);
    useJamStore.setState({
      code: null,
      isHost: false,
      participants: [],
      queue: [],
      shareUrl: null,
      jamDeepLink: null,
    });
    stopRealtimeSync();
    showToast.info("A sessão de Jam foi encerrada pelo Host.");
  });

  es.addEventListener("sync", (e) => {
    try {
      const event = JSON.parse(e.data) as JamSyncEvent;
      // Se quem enviou foi este próprio cliente, ignora
      handleRemoteSync(event);
    } catch {
      // ignore
    }
  });

  es.onerror = () => {
    // Se a conexão cair ou o token de acesso expirar, reconecta com token renovado
    if (es.readyState === EventSource.CLOSED) {
      void getValidAccessToken().then((freshToken) => {
        const currentCode = useJamStore.getState().code;
        if (currentCode && freshToken) {
          startRealtimeSync(currentCode, freshToken);
        }
      });
    }
  };

  // Polling de contingência a cada 4 segundos (garante consistência mesmo se a rede falhar)
  pollIntervalTimer = setInterval(async () => {
    const { code, isHost } = useJamStore.getState();
    if (!code || isHost) return;

    try {
      const res = await fetch(`${getApiBaseUrl()}/v1/jam/${code}`);
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; room: JamRoomState };
        if (data.room) {
          useJamStore.setState({
            allowGuestControl: data.room.allowGuestControl ?? true,
            queue: (data.room.queue || []).map(toClientTrack),
            participants: data.room.participants,
          });

          if (data.room.currentTrack) {
            const currentTrack = usePlayerStore.getState().currentTrack;
            const currentPos = usePlayerStore.getState().positionMs;
            const status = usePlayerStore.getState().status;

            const clientTrack = toClientTrack(data.room.currentTrack);
            const elapsed =
              data.room.status === "playing"
                ? Math.max(0, Date.now() - data.room.updatedAt)
                : 0;
            const expectedPos = data.room.positionMs + elapsed;

            // Se a música for diferente ou houver drift maior que 4.5 segundos
            if (currentTrack?.id !== clientTrack.id) {
              syncRemoteTrack(
                clientTrack,
                data.room.status,
                data.room.positionMs,
                data.room.updatedAt,
              );
            } else if (
              Math.abs(currentPos - expectedPos) > 4500 &&
              status === "playing"
            ) {
              setRemoteSyncingState(true, 1500);
              playerRuntime?.seek(expectedPos);
            } else if (status !== data.room.status) {
              setRemoteSyncingState(true, 1500);
              if (data.room.status === "playing") {
                playerRuntime?.resume();
              } else if (data.room.status === "paused") {
                playerRuntime?.pause();
              }
            }
          }
        }
      }
    } catch {
      // ignore background poll error
    }
  }, 4000);
}

async function sendJamSync(
  code: string,
  token: string,
  payload: {
    action: "PLAY" | "PAUSE" | "SEEK" | "TRACK_CHANGE" | "SKIP_NEXT" | "SKIP_PREV";
    track?: Track;
    positionMs?: number;
  },
) {
  try {
    await fetch(`${getApiBaseUrl()}/v1/jam/${code}/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // network retry is handled by periodic status updates
  }
}

let syncCooldownTimer: ReturnType<typeof setTimeout> | null = null;

function setRemoteSyncingState(active: boolean, cooldownMs: number = 1800) {
  isRemoteSyncing = active;
  if (syncCooldownTimer) {
    clearTimeout(syncCooldownTimer);
    syncCooldownTimer = null;
  }
  if (active) {
    syncCooldownTimer = setTimeout(() => {
      isRemoteSyncing = false;
    }, cooldownMs);
  }
}

function syncRemoteTrack(
  track: Track,
  status: "playing" | "paused" | "idle",
  positionMs: number,
  updatedAt: number,
) {
  if (!track || !track.id) return;
  setRemoteSyncingState(true, 2500);

  const now = Date.now();
  const elapsed = status === "playing" ? Math.max(0, now - updatedAt) : 0;
  const targetPos = Math.max(0, positionMs + elapsed);

  const currentTrack = usePlayerStore.getState().currentTrack;
  const currentStatus = usePlayerStore.getState().status;
  const currentPos = usePlayerStore.getState().positionMs;

  // Se já estamos tocando essa mesma faixa, sincroniza tempo / reprodução
  if (currentTrack?.id === track.id) {
    if (Math.abs(currentPos - targetPos) > 2500) {
      playerRuntime?.seek(targetPos);
    }
    if (
      status === "playing" &&
      currentStatus !== "playing" &&
      currentStatus !== "loading"
    ) {
      playerRuntime?.resume();
    } else if (status === "paused" && currentStatus === "playing") {
      playerRuntime?.pause();
    }
    return;
  }

  const clientTrack = toClientTrack(track);

  void playerEngine
    .playTrack(
      clientTrack,
      [clientTrack],
      "jam",
      null,
      undefined,
      undefined,
      targetPos,
    )
    .then(() => {
      if (status === "paused") {
        playerRuntime?.pause();
      }
    });
}

function handleRemoteSync(event: JamSyncEvent) {
  const myUserId = getAuthSession()?.user.id;
  if (event.senderId && myUserId && event.senderId === myUserId) {
    return;
  }

  // Comandos de controle de faixa vindos de convidados autorizados: o Host executa na fila
  if (event.action === "SKIP_NEXT") {
    if (useJamStore.getState().isHost) {
      void playerEngine.skipNext(false);
    }
    return;
  }
  if (event.action === "SKIP_PREV") {
    if (useJamStore.getState().isHost) {
      void playerEngine.skipPrevious();
    }
    return;
  }

  setRemoteSyncingState(true, 1800);
  lastSyncTimestamp = Date.now();

  const currentTrack = usePlayerStore.getState().currentTrack;
  const currentPos = usePlayerStore.getState().positionMs;

  if (event.action === "TRACK_CHANGE" && event.track) {
    syncRemoteTrack(
      toClientTrack(event.track),
      event.status,
      event.positionMs,
      event.updatedAt,
    );
    return;
  }

  if (event.track && (!currentTrack || currentTrack.id !== event.track.id)) {
    syncRemoteTrack(
      toClientTrack(event.track),
      event.status,
      event.positionMs,
      event.updatedAt,
    );
    return;
  }

  const elapsed =
    event.status === "playing" ? Math.max(0, Date.now() - event.updatedAt) : 0;
  const targetPos = Math.max(0, event.positionMs + elapsed);

  if (event.action === "PLAY") {
    if (Math.abs(currentPos - targetPos) > 2500) {
      usePlayerStore.getState().setPosition(targetPos);
      playerRuntime?.seek(targetPos);
    }
    playerRuntime?.resume();
  } else if (event.action === "PAUSE") {
    playerRuntime?.pause();
    if (event.positionMs !== undefined) {
      usePlayerStore.getState().setPosition(event.positionMs);
      playerRuntime?.seek(event.positionMs);
    }
  } else if (event.action === "SEEK") {
    usePlayerStore.getState().setPosition(event.positionMs);
    playerRuntime?.seek(event.positionMs);
  }
}

// Observador do player local: se este usuário puder sincronizar com a Jam, propaga as alterações
if (typeof usePlayerStore?.subscribe === "function") {
  usePlayerStore.subscribe((state, prev) => {
  const { code, isHost, allowGuestControl } = useJamStore.getState();
  if (!code || isRemoteSyncing) return;

  // Se for ouvinte e convidados não tiverem permissão de controle, não envia
  if (!isHost && !allowGuestControl) return;

  // Faixa mudou
  if (state.currentTrack && state.currentTrack.id !== prev.currentTrack?.id) {
    void getValidAccessToken().then((token) => {
      if (token) {
        void sendJamSync(code, token, {
          action: "TRACK_CHANGE",
          track: state.currentTrack!,
          positionMs: state.positionMs,
        });
      }
    });
    return;
  }

  // Play / Pause mudou
  if (
    state.status !== prev.status &&
    (state.status === "playing" || state.status === "paused")
  ) {
    const action = state.status === "playing" ? "PLAY" : "PAUSE";
    void getValidAccessToken().then((token) => {
      if (token) {
        void sendJamSync(code, token, {
          action,
          track: state.currentTrack ?? undefined,
          positionMs: state.positionMs,
        });
      }
    });
    return;
  }

  // Seek disparado (salto manual para trás ou mais de 3 segundos para frente)
  const isBackwardSeek = state.positionMs < prev.positionMs - 500;
  const isForwardJump = state.positionMs > prev.positionMs + 3000;
  if (
    (isBackwardSeek || isForwardJump) &&
    Math.abs(Date.now() - lastSyncTimestamp) > 800
  ) {
    lastSyncTimestamp = Date.now();
    void getValidAccessToken().then((token) => {
      if (token) {
        void sendJamSync(code, token, {
          action: "SEEK",
          track: state.currentTrack ?? undefined,
          positionMs: state.positionMs,
        });
      }
    });
  }
});
}

// Re-sincroniza o estado da Jam imediatamente ao retomar o foco da janela
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    const { code, isHost } = useJamStore.getState();
    if (!code || isHost) return;

    void fetch(`${getApiBaseUrl()}/v1/jam/${code}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: any) => {
        if (!data?.room) return;
        useJamStore.setState({
          allowGuestControl: data.room.allowGuestControl ?? true,
          queue: (data.room.queue || []).map(toClientTrack),
          participants: data.room.participants,
        });

        if (data.room.currentTrack) {
          const currentTrack = usePlayerStore.getState().currentTrack;
          const currentPos = usePlayerStore.getState().positionMs;
          const status = usePlayerStore.getState().status;

          const clientTrack = toClientTrack(data.room.currentTrack);
          const elapsed =
            data.room.status === "playing"
              ? Math.max(0, Date.now() - data.room.updatedAt)
              : 0;
          const expectedPos = data.room.positionMs + elapsed;

          if (currentTrack?.id !== clientTrack.id) {
            syncRemoteTrack(
              clientTrack,
              data.room.status,
              data.room.positionMs,
              data.room.updatedAt,
            );
          } else if (
            Math.abs(currentPos - expectedPos) > 2500 &&
            status === "playing"
          ) {
            setRemoteSyncingState(true, 1500);
            playerRuntime?.seek(expectedPos);
          } else if (status !== data.room.status) {
            setRemoteSyncingState(true, 1500);
            if (data.room.status === "playing") playerRuntime?.resume();
            else if (data.room.status === "paused") playerRuntime?.pause();
          }
        }
      })
      .catch(() => {});
  });
}
