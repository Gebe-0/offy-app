import { create } from "zustand";
import { getApiBaseUrl } from "@/shared/api/baseUrl";
import { getValidAccessToken } from "@/shared/api/auth-session";
import { toClientTrack } from "@/shared/api/track";
import { showToast } from "@/shared/ui";
import { usePlayerStore, playerEngine, playerRuntime } from "@/features/player";
import type { Track } from "@/shared/types";
import type { JamParticipant, JamRoomState, JamSyncEvent } from "../types";

let activeEventSource: EventSource | null = null;
let pollIntervalTimer: ReturnType<typeof setInterval> | null = null;
let isRemoteSyncing = false;
let lastKnownHostTrackId: string | null = null;
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
    const cleanCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
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

      const isHost = data.room.hostId === data.room.participants.find((p) => p.isHost)?.userId;

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

  addToQueue: async (track: Track) => {
    const { code, isHost, allowGuestControl } = get();
    if (!code) return;
    if (!isHost && !allowGuestControl) {
      showToast.info("Apenas o Host pode adicionar músicas à fila da Jam.");
      return;
    }

    try {
      const token = await getValidAccessToken();
      if (!token) return;

      const res = await fetch(`${getApiBaseUrl()}/v1/jam/${code}/queue`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ track }),
      });

      if (res.ok) {
        showToast.checkmark(`Adicionado à fila da Jam: ${track.title}`);
      }
    } catch {
      showToast.error("Erro ao adicionar faixa à fila da Jam.");
    }
  },

  removeFromQueue: async (trackId: string) => {
    const { code, isHost, allowGuestControl } = get();
    if (!code) return;
    if (!isHost && !allowGuestControl) {
      showToast.info("Apenas o Host pode gerenciar a fila da Jam.");
      return;
    }

    try {
      const token = await getValidAccessToken();
      if (!token) return;

      await fetch(`${getApiBaseUrl()}/v1/jam/${code}/queue/${encodeURIComponent(trackId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
    } catch {
      // ignore
    }
  },

  leaveJam: async () => {
    const currentCode = get().code;
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
      useJamStore.setState({
        allowGuestControl: room.allowGuestControl ?? true,
        queue: (room.queue || []).map(toClientTrack),
        participants: room.participants,
      });

      const { isHost } = useJamStore.getState();
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
      useJamStore.setState({ participants: data.participants });
    } catch {
      // ignore
    }
  });

  es.addEventListener("jam_closed", () => {
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
    const { isHost, allowGuestControl } = useJamStore.getState();
    try {
      const event = JSON.parse(e.data) as JamSyncEvent;
      // Se quem enviou foi este próprio cliente, ignora
      handleRemoteSync(event);
    } catch {
      // ignore
    }
  });

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
            const elapsed = data.room.status === "playing" ? Math.max(0, Date.now() - data.room.updatedAt) : 0;
            const expectedPos = data.room.positionMs + elapsed;

            // Se a música for diferente ou houver drift maior que 4.5 segundos
            if (currentTrack?.id !== clientTrack.id) {
              syncRemoteTrack(clientTrack, data.room.status, data.room.positionMs, data.room.updatedAt);
            } else if (Math.abs(currentPos - expectedPos) > 4500 && status === "playing") {
              playerRuntime?.seek(expectedPos);
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
    action: "PLAY" | "PAUSE" | "SEEK" | "TRACK_CHANGE";
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

function syncRemoteTrack(
  track: Track,
  status: "playing" | "paused" | "idle",
  positionMs: number,
  updatedAt: number,
) {
  isRemoteSyncing = true;
  lastKnownHostTrackId = track.id;

  const elapsed = status === "playing" ? Math.max(0, Date.now() - updatedAt) : 0;
  const targetPos = Math.max(0, positionMs + elapsed);

  void playerEngine.playTrack(track, [track], track.artists, track.coverUrl).then(() => {
    if (targetPos > 600) {
      playerRuntime?.seek(targetPos);
    }
    if (status === "paused") {
      playerRuntime?.pause();
    }
    setTimeout(() => {
      isRemoteSyncing = false;
    }, 800);
  });
}

function handleRemoteSync(event: JamSyncEvent) {
  isRemoteSyncing = true;
  lastSyncTimestamp = Date.now();

  const currentTrack = usePlayerStore.getState().currentTrack;

  if (event.action === "TRACK_CHANGE" && event.track) {
    syncRemoteTrack(toClientTrack(event.track), event.status, event.positionMs, event.updatedAt);
    return;
  }

  if (event.track && (!currentTrack || currentTrack.id !== event.track.id)) {
    syncRemoteTrack(toClientTrack(event.track), event.status, event.positionMs, event.updatedAt);
    return;
  }

  const elapsed = event.status === "playing" ? Math.max(0, Date.now() - event.updatedAt) : 0;
  const targetPos = Math.max(0, event.positionMs + elapsed);

  if (event.action === "PLAY") {
    playerRuntime?.seek(targetPos);
    playerRuntime?.resume();
  } else if (event.action === "PAUSE") {
    playerRuntime?.pause();
    if (event.positionMs !== undefined) {
      playerRuntime?.seek(event.positionMs);
    }
  } else if (event.action === "SEEK") {
    playerRuntime?.seek(event.positionMs);
  }

  setTimeout(() => {
    isRemoteSyncing = false;
  }, 600);
}

// Observador do player local: se este usuário puder sincronizar com a Jam, propaga as alterações
usePlayerStore.subscribe((state, prev) => {
  const { code, isHost, allowGuestControl } = useJamStore.getState();
  if (!code || isRemoteSyncing) return;

  // Se for ouvinte e convidados não tiverem permissão de controle, não envia
  if (!isHost && !allowGuestControl) return;

  // Faixa mudou
  if (state.currentTrack && state.currentTrack.id !== prev.currentTrack?.id) {
    lastKnownHostTrackId = state.currentTrack.id;
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
  if (state.status !== prev.status && (state.status === "playing" || state.status === "paused")) {
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

  // Seek disparado (diferença maior que 3.5 segundos sem transição de status)
  if (Math.abs(state.positionMs - prev.positionMs) > 3500 && Math.abs(Date.now() - lastSyncTimestamp) > 1000) {
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
