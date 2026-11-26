import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftLine,
  CheckLine,
  Edit2Line,
  PinFill,
  SearchLine,
  ShareForwardFill,
  Upload2Line,
  UserAddLine,
  UserFollowLine,
} from "@mingcute/react";
import { useModalStore } from "@/features/library";
import { useAuthStore } from "@/features/auth";
import { useDiscordStatus } from "@/features/discord";
import { playerEngine } from "@/features/player";
import { CoverImage } from "@/features/covers";
import { mediaUrl, toClientTrack } from "@/shared/api";
import { showToast } from "@/shared/ui";
import {
  profileApi,
  type FriendsListResponse,
  type ProfileMiniUser,
  type ProfileSummaryResponse,
} from "../api/profileApi";

function DiscordGlyph({
  size = 15,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function resolveAvatarSrc(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return mediaUrl(url);
}

async function compressAvatarFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const minSide = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - minSide) / 2;
  const sy = (bitmap.height - minSide) / 2;
  ctx.drawImage(bitmap, sx, sy, minSide, minSide, 0, 0, size, size);
  bitmap.close();

  const webp = canvas.toDataURL("image/webp", 0.82);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", 0.85);
}

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (diffSec < 60) return "agora";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function formatTotalDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${mins} min`;
}

function formatMonthHours(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hrs}H ${mins} Min`;
}

function AvatarBox({
  user,
  size = 60,
  rounded = "rounded-[14px]",
}: {
  user: { displayName?: string; username?: string; avatarUrl?: string | null };
  size?: number;
  rounded?: string;
}) {
  const label = user.displayName || user.username || "U";
  const initial = (label.trim()[0] || "U").toUpperCase();
  const src = resolveAvatarSrc(user.avatarUrl);
  return (
    <div
      style={{ width: size, height: size }}
      className={`shrink-0 overflow-hidden ${rounded} bg-white/[0.08] flex items-center justify-center font-[600] text-text-primary select-none`}
    >
      {src ? (
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : (
        <span style={{ fontSize: Math.max(12, Math.round(size * 0.4)) }}>
          {initial}
        </span>
      )}
    </div>
  );
}

// Coordenadas orgânicas espalhadas para os círculos de fundo do Top Artists
const SCATTERED_ARTIST_POSITIONS = [
  { top: "-12px", right: "118px", size: 78, opacity: 0.72 },
  { top: "-8px", right: "38px", size: 74, opacity: 0.62 },
  { top: "-6px", right: "-26px", size: 72, opacity: 0.45 },
  { top: "68px", right: "68px", size: 76, opacity: 0.55 },
  { top: "62px", right: "-10px", size: 74, opacity: 0.42 },
];

export default function ProfileModal() {
  const open = useModalStore((s) => s.profileOpen);
  const targetId = useModalStore((s) => s.profileTargetId);
  const openProfile = useModalStore((s) => s.openProfile);
  const closeProfile = useModalStore((s) => s.closeProfile);
  const { status: discordStatus } = useDiscordStatus();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [view, setView] = useState<"profile" | "friends" | "edit">("profile");
  const [friendsTab, setFriendsTab] = useState<"friends" | "requests">("friends");
  const [summary, setSummary] = useState<ProfileSummaryResponse | null>(null);
  const [friendsData, setFriendsData] = useState<FriendsListResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Friends search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileMiniUser[]>([]);
  const [searching, setSearching] = useState(false);

  // Edit profile form
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editAvatarData, setEditAvatarData] = useState<string | null>(null);
  const [editDiscordManual, setEditDiscordManual] = useState("");
  const [showRpcDiscord, setShowRpcDiscord] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  const rpcDiscordUsername =
    discordStatus.connected && discordStatus.username
      ? discordStatus.username.replace(/^@+/, "")
      : null;

  const loadSummary = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await profileApi.getSummary(id);
      setSummary(data);
    } catch (err: any) {
      showToast.error(err?.message || "Não foi possível carregar o perfil.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFriends = useCallback(async () => {
    try {
      const data = await profileApi.getFriends();
      setFriendsData(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setView("profile");
    void loadSummary(targetId);
  }, [open, targetId, loadSummary]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeProfile();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeProfile]);

  useEffect(() => {
    if (view !== "friends") return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      void profileApi
        .searchUsers(q)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 260);
    return () => clearTimeout(timer);
  }, [searchQuery, view]);

  const handleOpenFriends = (tab: "friends" | "requests") => {
    setFriendsTab(tab);
    setView("friends");
    void loadFriends();
  };

  const handleOpenEdit = () => {
    if (!summary) return;
    setEditDisplayName(summary.user.displayName || "");
    setEditUsername(summary.user.username || "");
    setEditAvatarData(summary.user.avatarUrl || null);
    setEditDiscordManual(summary.user.discordHandle || "");
    setShowRpcDiscord(Boolean(summary.user.discordHandle ?? true));
    setView("edit");
  };

  const handlePickAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast.error("Selecione um arquivo de imagem válido.");
      return;
    }
    try {
      const compressed = await compressAvatarFile(file);
      setEditAvatarData(compressed);
    } catch {
      showToast.error("Não foi possível processar a imagem.");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const nextDiscord = rpcDiscordUsername
        ? showRpcDiscord
          ? rpcDiscordUsername
          : null
        : editDiscordManual.trim().replace(/^@+/, "") || null;

      await profileApi.updateProfile({
        displayName: editDisplayName.trim(),
        username: editUsername.trim().toLowerCase(),
        avatarUrl: editAvatarData,
        discordHandle: nextDiscord,
      });

      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.setState({
          user: {
            ...currentUser,
            displayName: editDisplayName.trim() || currentUser.displayName,
            username: editUsername.trim().toLowerCase() || currentUser.username,
            avatarUrl: editAvatarData ?? undefined,
          },
        });
      }

      showToast.success("Perfil atualizado!");
      setView("profile");
      await loadSummary("me");
    } catch (err: any) {
      showToast.error(err?.message || "Erro ao salvar perfil.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleShareProfile = () => {
    if (!summary) return;
    void navigator.clipboard.writeText(`@${summary.user.username}`);
    showToast.success("Usuário copiado!");
  };

  const handleSendFriendRequest = async (uid: string) => {
    try {
      const res = await profileApi.sendFriendRequest(uid);
      showToast.success(
        res.status === "friends" ? "Agora vocês são amigos!" : "Pedido enviado!",
      );
      void loadSummary(targetId);
      void loadFriends();
    } catch (err: any) {
      showToast.error(err?.message || "Não foi possível enviar pedido.");
    }
  };

  const handleAcceptRequest = async (reqId: string) => {
    try {
      await profileApi.acceptRequest(reqId);
      showToast.success("Pedido aceito!");
      void loadFriends();
      void loadSummary(targetId);
    } catch (err: any) {
      showToast.error(err?.message || "Erro ao aceitar pedido.");
    }
  };

  const handleDeclineRequest = async (reqId: string) => {
    try {
      await profileApi.declineRequest(reqId);
      void loadFriends();
      void loadSummary(targetId);
    } catch {
      // ignore
    }
  };

  const handleRemoveFriend = async (uid: string) => {
    try {
      await profileApi.removeFriend(uid);
      showToast.info("Amigo removido.");
      void loadFriends();
      void loadSummary(targetId);
    } catch {
      // ignore
    }
  };

  const openDiscordDownload = () => {
    window.open("https://discord.com/download", "_blank", "noopener,noreferrer");
  };

  // Distribuição de pílulas do Top Artists em 3 linhas (1 | 2,3 | 4,5) igual à print
  const topArtistRows = summary
    ? [
        summary.topArtistsMonth.slice(0, 1),
        summary.topArtistsMonth.slice(1, 3),
        summary.topArtistsMonth.slice(3, 5),
      ].filter((row) => row.length > 0)
    : [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={closeProfile}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-[18px] backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[88vh] w-full max-w-[800px] flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#141517]/95 p-[20px] text-text-primary shadow-2xl backdrop-blur-2xl"
          >
            {/* Header (sem botão X — fecha clicando fora ou ESC) */}
            <div className="flex items-start justify-between gap-[16px]">
              <div className="flex min-w-0 items-center gap-[14px]">
                {view !== "profile" && (
                  <button
                    type="button"
                    onClick={() => setView("profile")}
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border-0 bg-white/[0.07] text-text-secondary hover:bg-white/[0.12] hover:text-white cursor-pointer"
                  >
                    <ArrowLeftLine size={18} />
                  </button>
                )}
                {summary ? (
                  <>
                    <AvatarBox user={summary.user} size={60} rounded="rounded-[14px]" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-[8px]">
                        <h2 className="truncate text-[27px] font-[700] leading-[1.1] tracking-[-0.02em] text-white">
                          {summary.user.displayName}
                        </h2>
                        {/* Slot reservado de conquistas — vazio por enquanto */}
                        {summary.user.badges.length > 0 && (
                          <div
                            data-achievements-slot
                            className="flex items-center gap-[5px]"
                          >
                            {summary.user.badges.map((badge) => (
                              <span
                                key={badge.id}
                                title={badge.label}
                                className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-[7px] bg-white/[0.1] text-[12px]"
                              >
                                {badge.icon || "★"}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="mt-[3px] text-[13.5px] font-[400] text-white/45">
                        @{summary.user.username}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="h-[60px] w-[220px] animate-pulse rounded-[14px] bg-white/[0.06]" />
                )}
              </div>

              {/* Right header controls */}
              {summary && (
                <div className="flex shrink-0 flex-col items-end gap-[9px]">
                  <div className="flex items-center gap-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        summary.isSelf ? handleOpenFriends("friends") : undefined
                      }
                      className="flex items-center gap-[8px] border-0 bg-transparent p-0 text-[13.5px] font-[500] text-white/75 hover:text-white cursor-pointer"
                    >
                      <span>
                        {summary.friendsCount}{" "}
                        {summary.friendsCount === 1 ? "friend" : "friends"}
                      </span>
                      {summary.friendAvatars.length > 0 && (
                        <div className="flex -space-x-2">
                          {summary.friendAvatars.slice(0, 4).map((f) => (
                            <div
                              key={f.id}
                              className="overflow-hidden rounded-full ring-2 ring-[#141517]"
                            >
                              <AvatarBox user={f} size={22} rounded="rounded-full" />
                            </div>
                          ))}
                        </div>
                      )}
                    </button>

                    {summary.isSelf && summary.pendingRequestsCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleOpenFriends("requests")}
                        className="flex items-center gap-[6px] rounded-full border-0 bg-[#3a161b] px-[10px] py-[4px] text-[12px] font-[600] text-[#ff5c6c] hover:bg-[#4c1c23] cursor-pointer"
                      >
                        <span className="h-[6px] w-[6px] rounded-full bg-[#ff4d5e]" />
                        <span>
                          {summary.pendingRequestsCount}{" "}
                          {summary.pendingRequestsCount === 1 ? "request" : "requests"}
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-[8px]">
                    {summary.user.discordHandle && (
                      <span className="inline-flex h-[32px] items-center gap-[7px] rounded-full bg-white/[0.08] px-[12px] text-[12.5px] font-[500] text-white/90">
                        <DiscordGlyph size={15} className="text-white" />
                        <span>@{summary.user.discordHandle}</span>
                      </span>
                    )}

                    {summary.isSelf ? (
                      <>
                        <button
                          type="button"
                          onClick={handleShareProfile}
                          title="Copiar usuário"
                          className="flex h-[32px] w-[32px] items-center justify-center rounded-full border-0 bg-white/[0.08] text-white/85 hover:bg-white/[0.15] hover:text-white cursor-pointer"
                        >
                          <ShareForwardFill size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenEdit}
                          title="Editar perfil"
                          className="flex h-[32px] w-[32px] items-center justify-center rounded-full border-0 bg-white/[0.08] text-white/85 hover:bg-white/[0.15] hover:text-white cursor-pointer"
                        >
                          <Edit2Line size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        {summary.friendshipStatus === "none" && (
                          <button
                            type="button"
                            onClick={() => handleSendFriendRequest(summary.user.id)}
                            className="inline-flex h-[32px] items-center gap-[6px] rounded-full border-0 bg-white px-[14px] text-[12.5px] font-[600] text-black hover:opacity-90 cursor-pointer"
                          >
                            <UserAddLine size={15} />
                            <span>Adicionar</span>
                          </button>
                        )}
                        {summary.friendshipStatus === "pending_sent" && (
                          <span className="inline-flex h-[32px] items-center rounded-full bg-white/[0.08] px-[12px] text-[12px] text-white/60">
                            Pedido enviado
                          </span>
                        )}
                        {summary.friendshipStatus === "pending_received" &&
                          summary.pendingRequestId && (
                            <button
                              type="button"
                              onClick={() =>
                                handleAcceptRequest(summary.pendingRequestId!)
                              }
                              className="inline-flex h-[32px] items-center gap-[6px] rounded-full border-0 bg-[#10b981] px-[14px] text-[12.5px] font-[600] text-white cursor-pointer"
                            >
                              <CheckLine size={15} />
                              <span>Aceitar</span>
                            </button>
                          )}
                        {summary.friendshipStatus === "friends" && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFriend(summary.user.id)}
                            className="inline-flex h-[32px] items-center gap-[6px] rounded-full border-0 bg-white/[0.08] px-[12px] text-[12.5px] font-[500] text-white/80 hover:bg-red-500/20 hover:text-red-300 cursor-pointer"
                          >
                            <UserFollowLine size={15} />
                            <span>Amigos</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openProfile("me")}
                          className="inline-flex h-[32px] items-center rounded-full border-0 bg-white/[0.07] px-[12px] text-[12px] text-white/75 hover:bg-white/[0.12] cursor-pointer"
                        >
                          Meu perfil
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="mt-[16px] flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {loading && !summary ? (
                <div className="grid grid-cols-2 gap-[12px]">
                  <div className="h-[340px] animate-pulse rounded-[16px] bg-white/[0.04]" />
                  <div className="h-[340px] animate-pulse rounded-[16px] bg-white/[0.04]" />
                </div>
              ) : view === "profile" && summary ? (
                <div className="grid grid-cols-1 gap-[12px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
                  {/* LEFT COLUMN: Recent + Top Artists */}
                  <div className="flex min-w-0 flex-col gap-[12px]">
                    {/* Recent Card com fade suave no canto inferior direito */}
                    <div
                      className="min-w-0 rounded-[16px] border border-white/[0.05] p-[16px]"
                      style={{
                        background:
                          "radial-gradient(circle at 92% 95%, rgba(255,255,255,0.085), rgba(255,255,255,0.03) 62%)",
                      }}
                    >
                      <h3 className="mb-[12px] text-[17px] font-[600] tracking-[-0.01em] text-white">
                        Recent
                      </h3>
                      {summary.recent.length === 0 ? (
                        <p className="py-[18px] text-center text-[13px] text-white/40">
                          Nenhuma música recente ainda.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-[7px]">
                          {summary.recent.map((item) => {
                            const track = toClientTrack(item.track);
                            return (
                              <button
                                key={`${track.id}-${item.playedAt}`}
                                type="button"
                                onClick={() => {
                                  void playerEngine.playTrack(
                                    track,
                                    summary.recent.map((r) => toClientTrack(r.track)),
                                    "Recent",
                                    track.coverUrl,
                                  );
                                }}
                                className="group flex w-full min-w-0 items-center gap-[10px] rounded-[9px] border-0 bg-transparent px-[4px] py-[3px] text-left transition-colors hover:bg-white/[0.05] cursor-pointer"
                              >
                                <div className="h-[38px] w-[38px] shrink-0 overflow-hidden rounded-[8px] bg-white/[0.06]">
                                  <CoverImage
                                    src={track.coverUrl}
                                    alt={track.title}
                                    width={38}
                                    height={38}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13.5px] font-[600] leading-[17px] text-white">
                                    {track.title}
                                  </p>
                                  <p className="mt-[1px] truncate text-[12px] leading-[15px] text-white/45">
                                    {track.artists}
                                  </p>
                                </div>
                                <span className="shrink-0 pl-[6px] text-[12px] text-white/35">
                                  {formatRelativeTime(item.playedAt)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Top Artists Month Card — círculos espalhados + 3 linhas */}
                    <div
                      className="relative min-w-0 overflow-hidden rounded-[16px] border border-white/[0.05] p-[16px]"
                      style={{
                        background:
                          "linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))",
                      }}
                    >
                      {/* Círculos espalhados orgânicos no fundo com fade lateral */}
                      {summary.topArtistsMonth.length > 0 && (
                        <div
                          className="pointer-events-none absolute inset-0 overflow-hidden"
                          style={{
                            WebkitMaskImage:
                              "linear-gradient(to left, rgba(0,0,0,0.92) 24%, rgba(0,0,0,0.38) 62%, transparent 90%)",
                            maskImage:
                              "linear-gradient(to left, rgba(0,0,0,0.92) 24%, rgba(0,0,0,0.38) 62%, transparent 90%)",
                          }}
                        >
                          {summary.topArtistsMonth.slice(0, 5).map((a, i) => {
                            const pos = SCATTERED_ARTIST_POSITIONS[i]!;
                            return (
                              <div
                                key={`scatter-${a.name}`}
                                style={{
                                  top: pos.top,
                                  right: pos.right,
                                  width: pos.size,
                                  height: pos.size,
                                  opacity: pos.opacity,
                                }}
                                className="absolute overflow-hidden rounded-full bg-white/[0.08]"
                              >
                                {a.coverUrl && (
                                  <img
                                    src={a.coverUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="relative z-10 mb-[12px] flex items-baseline gap-[8px]">
                        <h3 className="text-[17px] font-[600] tracking-[-0.01em] text-white">
                          Top artists
                        </h3>
                        <span className="text-[13.5px] font-[400] text-white/40">
                          Month
                        </span>
                      </div>

                      {summary.topArtistsMonth.length === 0 ? (
                        <p className="relative z-10 py-[12px] text-[13px] text-white/40">
                          Ouça mais faixas este mês para ver seus artistas.
                        </p>
                      ) : (
                        <div className="relative z-10 flex flex-col gap-[8px]">
                          {topArtistRows.map((row, rowIdx) => {
                            const startRank = rowIdx === 0 ? 1 : rowIdx === 1 ? 2 : 4;
                            return (
                              <div
                                key={rowIdx}
                                className="flex flex-wrap items-center gap-[8px]"
                              >
                                {row.map((artist, idx) => (
                                  <button
                                    key={artist.name}
                                    type="button"
                                    onClick={() => {
                                      closeProfile();
                                      navigate(
                                        `/artist?id=${encodeURIComponent(artist.id || artist.name)}`,
                                      );
                                    }}
                                    className="inline-flex max-w-full items-center gap-[8px] rounded-[11px] border border-white/[0.06] bg-[#1a1b1f]/80 px-[10px] py-[6px] text-left hover:bg-white/[0.14] cursor-pointer backdrop-blur-md"
                                  >
                                    <span className="text-[12.5px] font-[500] text-white/50">
                                      {startRank + idx}
                                    </span>
                                    <div className="h-[22px] w-[22px] shrink-0 overflow-hidden rounded-full bg-white/[0.08]">
                                      {artist.coverUrl && (
                                        <img
                                          src={artist.coverUrl}
                                          alt={artist.name}
                                          className="h-full w-full object-cover"
                                        />
                                      )}
                                    </div>
                                    <span className="max-w-[120px] truncate text-[13px] font-[600] text-white">
                                      {artist.name}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: 2x2 Pinned Cards + Top Tracks Month */}
                  <div className="flex min-w-0 flex-col gap-[12px]">
                    {/* 2x2 Pinned Playlists / Likes */}
                    <div className="grid min-w-0 grid-cols-2 gap-[10px]">
                      {summary.pinnedCards.map((card) => {
                        const hasCollage = card.coverUrls.length >= 4;
                        const firstCover = card.coverUrls[0] || "";
                        return (
                          <button
                            key={`${card.kind}-${card.id}`}
                            type="button"
                            onClick={() => {
                              closeProfile();
                              if (card.kind === "likes") {
                                navigate("/library/saved");
                              } else {
                                navigate(
                                  `/library/playlist?id=${encodeURIComponent(card.id)}`,
                                );
                              }
                            }}
                            className="group relative aspect-square w-full min-w-0 overflow-hidden rounded-[15px] border border-white/[0.06] bg-white/[0.04] p-0 text-left cursor-pointer"
                          >
                            {hasCollage ? (
                              <div className="grid h-full w-full grid-cols-2 grid-rows-2 transition-transform duration-300 group-hover:scale-105">
                                {card.coverUrls.slice(0, 4).map((u, i) => (
                                  <CoverImage
                                    key={`${card.id}-${i}`}
                                    src={u}
                                    alt=""
                                    width={100}
                                    height={100}
                                    className="h-full w-full object-cover"
                                  />
                                ))}
                              </div>
                            ) : firstCover ? (
                              <CoverImage
                                src={firstCover}
                                alt={card.title}
                                width={200}
                                height={200}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="h-full w-full bg-gradient-to-br from-white/[0.08] to-white/[0.02]" />
                            )}

                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                            <span className="absolute left-[10px] top-[10px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm">
                              <PinFill size={12} />
                            </span>

                            <div className="absolute inset-x-[12px] bottom-[10px] min-w-0">
                              <p className="truncate text-[14.5px] font-[600] leading-tight text-white">
                                {card.title}
                              </p>
                              <p className="mt-[2px] truncate text-[11.5px] text-white/65">
                                {card.trackCount} tracks ·{" "}
                                {formatTotalDuration(card.totalDurationMs)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Top Tracks Month Card com fade suave na base */}
                    <div
                      className="relative min-w-0 overflow-hidden rounded-[16px] border border-white/[0.05] p-[16px]"
                      style={{
                        background:
                          "linear-gradient(160deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))",
                      }}
                    >
                      <div className="mb-[12px] flex items-center justify-between gap-[8px]">
                        <div className="flex items-baseline gap-[8px]">
                          <h3 className="text-[17px] font-[600] tracking-[-0.01em] text-white">
                            Top tracks
                          </h3>
                          <span className="text-[13.5px] text-white/40">Month</span>
                        </div>
                        <span className="shrink-0 text-[15px] font-[600] tabular-nums text-white/90">
                          {formatMonthHours(summary.monthlyListeningMs)}
                        </span>
                      </div>

                      {summary.topTracksMonth.length === 0 ? (
                        <p className="py-[10px] text-[13px] text-white/40">
                          Sem faixas suficientes neste mês.
                        </p>
                      ) : (
                        <div
                          className="flex max-h-[168px] flex-col gap-[7px] overflow-y-auto pr-[2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                          style={{
                            WebkitMaskImage:
                              "linear-gradient(to bottom, #000 72%, transparent 100%)",
                            maskImage:
                              "linear-gradient(to bottom, #000 72%, transparent 100%)",
                          }}
                        >
                          {summary.topTracksMonth.map((entry, idx) => {
                            const track = toClientTrack(entry.track);
                            return (
                              <button
                                key={track.id}
                                type="button"
                                onClick={() => {
                                  void playerEngine.playTrack(
                                    track,
                                    summary.topTracksMonth.map((t) =>
                                      toClientTrack(t.track),
                                    ),
                                    "Top tracks",
                                    track.coverUrl,
                                  );
                                }}
                                className="flex w-full min-w-0 items-center gap-[10px] rounded-[9px] border-0 bg-transparent px-[4px] py-[3px] text-left hover:bg-white/[0.05] cursor-pointer"
                              >
                                <span className="w-[16px] shrink-0 text-center text-[12px] font-[600] text-white/45">
                                  {idx + 1}
                                </span>
                                <div className="h-[36px] w-[36px] shrink-0 overflow-hidden rounded-[8px] bg-white/[0.06]">
                                  <CoverImage
                                    src={track.coverUrl}
                                    alt={track.title}
                                    width={36}
                                    height={36}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13.5px] font-[600] leading-[17px] text-white">
                                    {track.title}
                                  </p>
                                  <p className="mt-[1px] truncate text-[12px] leading-[15px] text-white/45">
                                    {track.artists}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : view === "friends" ? (
                <div className="flex flex-col gap-[16px]">
                  <div className="relative">
                    <SearchLine
                      size={16}
                      className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 text-white/40"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar usuário por @username para adicionar..."
                      className="h-[40px] w-full rounded-[12px] border border-white/[0.08] bg-white/[0.04] pl-[36px] pr-[12px] text-[13.5px] text-white placeholder:text-white/35 outline-none focus:border-white/25"
                    />
                  </div>

                  {searchQuery.trim() && (
                    <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.03] p-[12px]">
                      <p className="mb-[8px] text-[12px] font-[600] uppercase tracking-wider text-white/40">
                        {searching ? "Buscando..." : "Resultados"}
                      </p>
                      {searchResults.length === 0 && !searching ? (
                        <p className="text-[13px] text-white/45">
                          Nenhum usuário encontrado.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-[8px]">
                          {searchResults.map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-[10px] py-[8px]"
                            >
                              <button
                                type="button"
                                onClick={() => openProfile(u.id)}
                                className="flex items-center gap-[10px] border-0 bg-transparent p-0 text-left cursor-pointer"
                              >
                                <AvatarBox user={u} size={34} rounded="rounded-[9px]" />
                                <div>
                                  <p className="text-[13.5px] font-[500] text-white">
                                    {u.displayName}
                                  </p>
                                  <p className="text-[12px] text-white/45">
                                    @{u.username}
                                  </p>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSendFriendRequest(u.id)}
                                className="inline-flex h-[30px] items-center gap-[5px] rounded-[8px] border-0 bg-white px-[12px] text-[12px] font-[600] text-black hover:opacity-90 cursor-pointer"
                              >
                                <UserAddLine size={14} />
                                <span>Adicionar</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-[8px]">
                    <button
                      type="button"
                      onClick={() => setFriendsTab("friends")}
                      className={`h-[34px] rounded-[10px] border-0 px-[14px] text-[13px] font-[600] cursor-pointer ${
                        friendsTab === "friends"
                          ? "bg-white text-black"
                          : "bg-white/[0.06] text-white/70 hover:text-white"
                      }`}
                    >
                      Amigos ({friendsData?.friends.length ?? 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFriendsTab("requests")}
                      className={`h-[34px] rounded-[10px] border-0 px-[14px] text-[13px] font-[600] cursor-pointer ${
                        friendsTab === "requests"
                          ? "bg-white text-black"
                          : "bg-white/[0.06] text-white/70 hover:text-white"
                      }`}
                    >
                      Pedidos ({friendsData?.incomingRequests.length ?? 0})
                    </button>
                  </div>

                  {friendsTab === "friends" ? (
                    <div className="flex flex-col gap-[8px]">
                      {(friendsData?.friends ?? []).length === 0 ? (
                        <p className="py-[20px] text-center text-[13px] text-white/45">
                          Você ainda não adicionou amigos. Busque pelo @username acima!
                        </p>
                      ) : (
                        friendsData!.friends.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center justify-between rounded-[12px] border border-white/[0.05] bg-white/[0.03] px-[12px] py-[10px]"
                          >
                            <button
                              type="button"
                              onClick={() => openProfile(f.id)}
                              className="flex items-center gap-[10px] border-0 bg-transparent p-0 text-left cursor-pointer"
                            >
                              <AvatarBox user={f} size={38} rounded="rounded-[10px]" />
                              <div>
                                <p className="text-[14px] font-[600] text-white">
                                  {f.displayName}
                                </p>
                                <p className="text-[12px] text-white/45">
                                  @{f.username}
                                </p>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFriend(f.id)}
                              className="h-[30px] rounded-[8px] border-0 bg-white/[0.06] px-[10px] text-[12px] text-white/60 hover:bg-red-500/20 hover:text-red-300 cursor-pointer"
                            >
                              Remover
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-[8px]">
                      {(friendsData?.incomingRequests ?? []).length === 0 ? (
                        <p className="py-[20px] text-center text-[13px] text-white/45">
                          Nenhum pedido de amizade pendente.
                        </p>
                      ) : (
                        friendsData!.incomingRequests.map((req) => (
                          <div
                            key={req.requestId}
                            className="flex items-center justify-between rounded-[12px] border border-white/[0.05] bg-white/[0.03] px-[12px] py-[10px]"
                          >
                            <button
                              type="button"
                              onClick={() => openProfile(req.user.id)}
                              className="flex items-center gap-[10px] border-0 bg-transparent p-0 text-left cursor-pointer"
                            >
                              <AvatarBox
                                user={req.user}
                                size={38}
                                rounded="rounded-[10px]"
                              />
                              <div>
                                <p className="text-[14px] font-[600] text-white">
                                  {req.user.displayName}
                                </p>
                                <p className="text-[12px] text-white/45">
                                  @{req.user.username}
                                </p>
                              </div>
                            </button>
                            <div className="flex items-center gap-[8px]">
                              <button
                                type="button"
                                onClick={() => handleAcceptRequest(req.requestId)}
                                className="h-[30px] rounded-[8px] border-0 bg-[#10b981] px-[12px] text-[12px] font-[600] text-white cursor-pointer"
                              >
                                Aceitar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeclineRequest(req.requestId)}
                                className="h-[30px] rounded-[8px] border-0 bg-white/[0.08] px-[10px] text-[12px] text-white/70 hover:text-white cursor-pointer"
                              >
                                Recusar
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Edit Profile View — Upload do PC + Discord RPC automático */
                <form
                  onSubmit={handleSaveEdit}
                  className="mx-auto flex max-w-[460px] flex-col gap-[16px] py-[8px]"
                >
                  {/* Foto de perfil do PC */}
                  <div className="flex items-center gap-[16px]">
                    <AvatarBox
                      user={{
                        displayName: editDisplayName,
                        username: editUsername,
                        avatarUrl: editAvatarData,
                      }}
                      size={64}
                      rounded="rounded-[16px]"
                    />
                    <div className="flex flex-col gap-[8px]">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePickAvatarFile}
                        className="hidden"
                      />
                      <div className="flex items-center gap-[8px]">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex h-[34px] items-center gap-[6px] rounded-[10px] border-0 bg-white/[0.1] px-[14px] text-[13px] font-[500] text-white hover:bg-white/[0.16] cursor-pointer"
                        >
                          <Upload2Line size={15} />
                          <span>Escolher foto do PC</span>
                        </button>
                        {editAvatarData && (
                          <button
                            type="button"
                            onClick={() => setEditAvatarData(null)}
                            className="h-[34px] rounded-[10px] border-0 bg-transparent px-[10px] text-[12.5px] text-white/50 hover:text-red-300 cursor-pointer"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      <span className="text-[11.5px] text-white/40">
                        PNG, JPG ou WebP — ajustada automaticamente para 256×256.
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-[6px]">
                    <label className="text-[12.5px] font-[500] text-white/65">
                      Nome de exibição
                    </label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="h-[40px] rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-[12px] text-[13.5px] text-white outline-none focus:border-white/25"
                    />
                  </div>

                  <div className="flex flex-col gap-[6px]">
                    <label className="text-[12.5px] font-[500] text-white/65">
                      Username (@)
                    </label>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      className="h-[40px] rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-[12px] text-[13.5px] text-white outline-none focus:border-white/25"
                    />
                  </div>

                  {/* Discord: automático via RPC ou manual com ícone branco brilhante */}
                  <div className="flex flex-col gap-[6px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-[8px]">
                        <label className="text-[12.5px] font-[500] text-white/65">
                          Discord (@handle)
                        </label>
                        {!rpcDiscordUsername && (
                          <button
                            type="button"
                            onClick={openDiscordDownload}
                            title="Baixar Discord"
                            className="inline-flex items-center justify-center border-0 bg-transparent p-0 text-white cursor-pointer transition-transform hover:scale-110"
                            style={{
                              filter: "drop-shadow(0 0 6px rgba(255,255,255,0.85))",
                            }}
                          >
                            <DiscordGlyph size={16} />
                          </button>
                        )}
                      </div>

                      {rpcDiscordUsername && (
                        <label className="flex items-center gap-[6px] text-[12px] text-white/65 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={showRpcDiscord}
                            onChange={(e) => setShowRpcDiscord(e.target.checked)}
                            className="accent-white"
                          />
                          <span>Mostrar no perfil</span>
                        </label>
                      )}
                    </div>

                    {rpcDiscordUsername ? (
                      <div className="flex h-[40px] items-center gap-[8px] rounded-[10px] border border-white/[0.08] bg-white/[0.06] px-[12px] text-[13.5px] text-white/85">
                        <DiscordGlyph size={15} className="text-white" />
                        <span>@{rpcDiscordUsername}</span>
                        <span className="ml-auto rounded-full bg-[#10b981]/20 px-[8px] py-[2px] text-[11px] font-[600] text-[#34d399]">
                          RPC conectado
                        </span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder="ex: arlw_"
                        value={editDiscordManual}
                        onChange={(e) => setEditDiscordManual(e.target.value)}
                        className="h-[40px] rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-[12px] text-[13.5px] text-white placeholder:text-white/35 outline-none focus:border-white/25"
                      />
                    )}
                  </div>

                  <div className="mt-[6px] flex justify-end gap-[10px]">
                    <button
                      type="button"
                      onClick={() => setView("profile")}
                      className="h-[38px] rounded-[10px] border-0 bg-white/[0.08] px-[16px] text-[13px] font-[500] text-white/80 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="h-[38px] rounded-[10px] border-0 bg-white px-[18px] text-[13px] font-[600] text-black hover:opacity-90 cursor-pointer"
                    >
                      {savingEdit ? "Salvando..." : "Salvar alterações"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
