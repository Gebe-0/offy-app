import { create } from "zustand";
import { getApiBaseUrl } from "@/shared/api/baseUrl";
import { getValidAccessToken } from "@/shared/api/auth-session";
import { showToast } from "@/shared/ui";
import { usePlayerStore, playerEngine, playerRuntime } from "@/features/player";
import type { Track } from "@/shared/types";
import type { JamParticipant, JamRoomState, JamSyncEvent } from "../types";

let activeEventSource: EventSource | null = null;
let isRemoteSyncing = false;
let lastKnownHostTrackId: string | null = null;
let lastSyncTimestamp = 0;

export interface JamState {
  code: string | null;
  isHost: boolean;
  isOpen: boolean;
  isConnecting: boolean;
  error: string | null;
  participants: JamParticipant[];
  shareUrl: string | null;
  jamDeepLink: string | null;

  openModal: () => void;
  closeModal: () => void;
  createJam: () => Promise<void>;
  joinJam: (code: string) => Promise<boolean>;
  leaveJam: () => Promise<void>;
}

export const useJamStore = create<JamState>((set, get) => ({
  code: null,
  isHost: false,
  isOpen: false,
  isConnecting: false,
  error: null,
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

      const res = await fetch(`${getApiBaseUrl()}/v1/jam/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
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
        participants: data.room.participants,
        shareUrl: data.shareUrl,
        jamDeepLink: data.jamUrl,
        isConnecting: false,
        isOpen: true,
      });

      connectJamEvents(data.room.code, token);

      // Se já estiver tocando uma faixa localmente, sincroniza imediatamente
      const currentPlayerState = usePlayerStore.getState();
      if (currentPlayerState.currentTrack) {
        void sendJamSync(data.room.code, token, {
          action: "TRACK_CHANGE",
          track: currentPlayerState.currentTrack,
          positionMs: currentPlayerState.positionMs,
        });
      }

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
      };

      const isHost = data.room.hostId === data.room.participants.find((p) => p.isHost)?.userId;

      set({
        code: data.room.code,
        isHost,
        participants: data.room.participants,
        shareUrl: `https://offy-api-fp82.onrender.com/jam/${data.room.code}`,
        jamDeepLink: data.jamUrl,
        isConnecting: false,
        isOpen: true,
      });

      connectJamEvents(data.room.code, token);

      // Sincroniza áudio inicial se houver música ativa na sala
      if (data.room.currentTrack && !isHost) {
        syncRemoteTrack(data.room.currentTrack as Track, data.room.status, data.room.positionMs, data.room.updatedAt);
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

  leaveJam: async () => {
    const currentCode = get().code;
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }

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
      shareUrl: null,
      jamDeepLink: null,
      error: null,
    });
    showToast.info("Você saiu da sessão Jam.");
  },
}));

function connectJamEvents(code: string, token: string) {
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }

  const sseUrl = `${getApiBaseUrl()}/v1/jam/${encodeURIComponent(code)}/events?token=${encodeURIComponent(token)}`;
  const es = new EventSource(sseUrl);
  activeEventSource = es;

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
      shareUrl: null,
      jamDeepLink: null,
    });
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    showToast.info("A sessão de Jam foi encerrada.");
  });

  es.addEventListener("sync", (e) => {
    const { isHost } = useJamStore.getState();
    if (isHost) return; // Host não sobrescreve suas ações locais

    try {
      const event = JSON.parse(e.data) as JamSyncEvent;
      handleRemoteSync(event);
    } catch {
      // ignore
    }
  });

  es.onerror = () => {
    // EventSource reconecta automaticamente no browser/Electron
  };
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
    if (targetPos > 500) {
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
    syncRemoteTrack(event.track, event.status, event.positionMs, event.updatedAt);
    return;
  }

  // Se o ouvinte não estiver com a mesma música do host, sincroniza a música
  if (event.track && (!currentTrack || currentTrack.id !== event.track.id)) {
    syncRemoteTrack(event.track, event.status, event.positionMs, event.updatedAt);
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

// Observador do player local: se este usuário for o Host, propaga alterações para os convidados
usePlayerStore.subscribe((state, prev) => {
  const { code, isHost } = useJamStore.getState();
  if (!code || !isHost || isRemoteSyncing) return;

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
