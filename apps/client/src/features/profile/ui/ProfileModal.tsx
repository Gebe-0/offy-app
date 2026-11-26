import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftLine,
  CheckLine,
  CloseLine,
  Edit2Line,
  PinFill,
  SearchLine,
  ShareForwardFill,
  UserAddLine,
  UserFollowLine,
} from "@mingcute/react";
import { useModalStore } from "@/features/library";
import { useAuthStore } from "@/features/auth";
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

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
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
  size = 56,
  rounded = "rounded-[14px]",
}: {
  user: { displayName?: string; username?: string; avatarUrl?: string | null };
  size?: number;
  rounded?: string;
}) {
  const label = user.displayName || user.username || "U";
  const initial = (label.trim()[0] || "U").toUpperCase();
  const src = user.avatarUrl ? mediaUrl(user.avatarUrl) : "";
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

export default function ProfileModal() {
  const open = useModalStore((s) => s.profileOpen);
  const targetId = useModalStore((s) => s.profileTargetId);
  const openProfile = useModalStore((s) => s.openProfile);
  const closeProfile = useModalStore((s) => s.closeProfile);
  const navigate = useNavigate();

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
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editDiscord, setEditDiscord] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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
    setEditAvatarUrl(summary.user.avatarUrl || "");
    setEditDiscord(summary.user.discordHandle || "");
    setView("edit");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      await profileApi.updateProfile({
        displayName: editDisplayName.trim(),
        username: editUsername.trim().toLowerCase(),
        avatarUrl: editAvatarUrl.trim() || undefined,
        discordHandle: editDiscord.trim().replace(/^@+/, "") || undefined,
      });
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.setState({
          user: {
            ...currentUser,
            displayName: editDisplayName.trim() || currentUser.displayName,
            username: editUsername.trim().toLowerCase() || currentUser.username,
            avatarUrl: editAvatarUrl.trim() || currentUser.avatarUrl,
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={closeProfile}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-[20px] backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[88vh] w-full max-w-[820px] flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#131417]/95 p-[22px] text-text-primary shadow-2xl backdrop-blur-2xl"
          >
            {/* Header */}
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
                    <AvatarBox user={summary.user} size={56} rounded="rounded-[14px]" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-[8px]">
                        <h2 className="truncate text-[23px] font-[700] leading-tight tracking-tight text-white">
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
                      <p className="mt-[2px] text-[13px] text-white/45">
                        @{summary.user.username}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="h-[56px] w-[220px] animate-pulse rounded-[14px] bg-white/[0.06]" />
                )}
              </div>

              {/* Right header controls */}
              {summary && (
                <div className="flex shrink-0 flex-col items-end gap-[8px]">
                  <div className="flex items-center gap-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        summary.isSelf ? handleOpenFriends("friends") : undefined
                      }
                      className="flex items-center gap-[8px] border-0 bg-transparent p-0 text-[13px] font-[500] text-white/75 hover:text-white cursor-pointer"
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
                              className="ring-2 ring-[#131417] rounded-full overflow-hidden"
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

                    <button
                      type="button"
                      onClick={closeProfile}
                      aria-label="Close"
                      className="flex h-[28px] w-[28px] items-center justify-center rounded-full border-0 bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white cursor-pointer"
                    >
                      <CloseLine size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-[8px]">
                    {summary.user.discordHandle && (
                      <span className="inline-flex h-[32px] items-center gap-[6px] rounded-full bg-white/[0.07] px-[12px] text-[12.5px] font-[500] text-white/85">
                        <span className="text-[#7289da] font-bold">DC</span>
                        <span>@{summary.user.discordHandle}</span>
                      </span>
                    )}

                    {summary.isSelf ? (
                      <>
                        <button
                          type="button"
                          onClick={handleShareProfile}
                          title="Copiar usuário"
                          className="flex h-[32px] w-[32px] items-center justify-center rounded-full border-0 bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white cursor-pointer"
                        >
                          <ShareForwardFill size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenEdit}
                          title="Editar perfil"
                          className="flex h-[32px] w-[32px] items-center justify-center rounded-full border-0 bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white cursor-pointer"
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
            <div className="mt-[18px] flex-1 overflow-y-auto pr-[2px] [scrollbar-width:thin]">
              {loading && !summary ? (
                <div className="grid grid-cols-2 gap-[14px]">
                  <div className="h-[320px] animate-pulse rounded-[16px] bg-white/[0.04]" />
                  <div className="h-[320px] animate-pulse rounded-[16px] bg-white/[0.04]" />
                </div>
              ) : view === "profile" && summary ? (
                <div className="grid grid-cols-1 gap-[14px] md:grid-cols-[1fr_1.06fr]">
                  {/* LEFT COLUMN: Recent + Top Artists */}
                  <div className="flex flex-col gap-[14px]">
                    {/* Recent Card */}
                    <div className="rounded-[16px] border border-white/[0.05] bg-white/[0.03] p-[16px]">
                      <h3 className="mb-[12px] text-[16px] font-[600] text-white">
                        Recent
                      </h3>
                      {summary.recent.length === 0 ? (
                        <p className="py-[18px] text-center text-[13px] text-white/40">
                          Nenhuma música recente ainda.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-[10px]">
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
                                className="group flex w-full items-center gap-[11px] rounded-[10px] border-0 bg-transparent p-[4px] text-left transition-colors hover:bg-white/[0.05] cursor-pointer"
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
                                  <p className="truncate text-[13.5px] font-[500] text-white">
                                    {track.title}
                                  </p>
                                  <p className="truncate text-[12px] text-white/45">
                                    {track.artists}
                                  </p>
                                </div>
                                <span className="shrink-0 text-[12px] text-white/35">
                                  {formatRelativeTime(item.playedAt)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Top Artists Month Card */}
                    <div className="relative overflow-hidden rounded-[16px] border border-white/[0.05] bg-white/[0.03] p-[16px]">
                      <div className="relative z-10 mb-[12px] flex items-baseline gap-[8px]">
                        <h3 className="text-[16px] font-[600] text-white">
                          Top artists
                        </h3>
                        <span className="text-[13px] text-white/40">Month</span>
                      </div>

                      {/* Decorative faded circles on right */}
                      {summary.topArtistsMonth.length > 0 && (
                        <div className="pointer-events-none absolute -right-[10px] top-[12px] flex flex-wrap justify-end gap-[6px] w-[170px] opacity-30">
                          {summary.topArtistsMonth.slice(0, 4).map((a) => (
                            <div
                              key={`bg-${a.name}`}
                              className="h-[68px] w-[68px] overflow-hidden rounded-full bg-white/[0.08]"
                            >
                              {a.coverUrl && (
                                <img
                                  src={a.coverUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {summary.topArtistsMonth.length === 0 ? (
                        <p className="py-[12px] text-[13px] text-white/40">
                          Ouça mais faixas este mês para ver seus artistas.
                        </p>
                      ) : (
                        <div className="relative z-10 flex flex-wrap gap-[8px]">
                          {summary.topArtistsMonth.map((artist, idx) => (
                            <button
                              key={artist.name}
                              type="button"
                              onClick={() => {
                                closeProfile();
                                navigate(
                                  `/artist?id=${encodeURIComponent(artist.id || artist.name)}`,
                                );
                              }}
                              className="inline-flex items-center gap-[8px] rounded-[11px] border border-white/[0.06] bg-[#18191d]/85 px-[10px] py-[6px] text-left hover:bg-white/[0.12] cursor-pointer backdrop-blur-md"
                            >
                              <span className="text-[12px] font-[600] text-white/45">
                                {idx + 1}
                              </span>
                              <div className="h-[24px] w-[24px] overflow-hidden rounded-full bg-white/[0.08]">
                                {artist.coverUrl && (
                                  <img
                                    src={artist.coverUrl}
                                    alt={artist.name}
                                    className="h-full w-full object-cover"
                                  />
                                )}
                              </div>
                              <span className="max-w-[130px] truncate text-[13px] font-[600] text-white">
                                {artist.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: 2x2 Pinned Cards + Top Tracks Month */}
                  <div className="flex flex-col gap-[14px]">
                    {/* 2x2 Pinned Playlists / Likes */}
                    <div className="grid grid-cols-2 gap-[10px]">
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
                            className="group relative aspect-square w-full overflow-hidden rounded-[15px] border border-white/[0.06] bg-white/[0.04] p-0 text-left cursor-pointer"
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

                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                            <span className="absolute left-[10px] top-[10px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/45 text-white/85 backdrop-blur-sm">
                              <PinFill size={12} />
                            </span>

                            <div className="absolute inset-x-[12px] bottom-[10px]">
                              <p className="truncate text-[14px] font-[600] text-white">
                                {card.title}
                              </p>
                              <p className="mt-[2px] text-[11.5px] text-white/65">
                                {card.trackCount} tracks ·{" "}
                                {formatTotalDuration(card.totalDurationMs)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Top Tracks Month Card */}
                    <div className="rounded-[16px] border border-white/[0.05] bg-white/[0.03] p-[16px]">
                      <div className="mb-[12px] flex items-center justify-between">
                        <div className="flex items-baseline gap-[8px]">
                          <h3 className="text-[16px] font-[600] text-white">
                            Top tracks
                          </h3>
                          <span className="text-[13px] text-white/40">Month</span>
                        </div>
                        <span className="text-[14px] font-[600] tabular-nums text-white/85">
                          {formatMonthHours(summary.monthlyListeningMs)}
                        </span>
                      </div>

                      {summary.topTracksMonth.length === 0 ? (
                        <p className="py-[10px] text-[13px] text-white/40">
                          Sem faixas suficientes neste mês.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-[8px]">
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
                                className="flex w-full items-center gap-[10px] rounded-[10px] border-0 bg-transparent p-[4px] text-left hover:bg-white/[0.05] cursor-pointer"
                              >
                                <span className="w-[16px] text-center text-[12px] font-[600] text-white/40">
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
                                  <p className="truncate text-[13.5px] font-[500] text-white">
                                    {track.title}
                                  </p>
                                  <p className="truncate text-[12px] text-white/45">
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
                  {/* Search users to add */}
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

                  {/* Tabs: Friends / Requests */}
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
                              <AvatarBox user={req.user} size={38} rounded="rounded-[10px]" />
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
                /* Edit Profile View */
                <form
                  onSubmit={handleSaveEdit}
                  className="mx-auto flex max-w-[460px] flex-col gap-[14px] py-[8px]"
                >
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
                  <div className="flex flex-col gap-[6px]">
                    <label className="text-[12.5px] font-[500] text-white/65">
                      Discord (@handle)
                    </label>
                    <input
                      type="text"
                      placeholder="ex: v0rt1s"
                      value={editDiscord}
                      onChange={(e) => setEditDiscord(e.target.value)}
                      className="h-[40px] rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-[12px] text-[13.5px] text-white outline-none focus:border-white/25"
                    />
                  </div>
                  <div className="flex flex-col gap-[6px]">
                    <label className="text-[12.5px] font-[500] text-white/65">
                      URL da foto de perfil
                    </label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={editAvatarUrl}
                      onChange={(e) => setEditAvatarUrl(e.target.value)}
                      className="h-[40px] rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-[12px] text-[13.5px] text-white outline-none focus:border-white/25"
                    />
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
