import type { FastifyInstance } from "fastify";
import { sql } from "../db.js";
import { ApiError, requireUserId, sendError } from "../http.js";
import { rowToTrack } from "../tracks.js";

function extractCoverUrl(cover: unknown): string {
  if (!cover) return "";
  if (typeof cover === "string") return cover;
  if (typeof cover === "object" && cover !== null && "url" in cover) {
    return String((cover as { url?: unknown }).url ?? "");
  }
  return "";
}

function extractArtistNames(artists: unknown): Array<{ id?: string; name: string }> {
  if (!Array.isArray(artists)) return [];
  return artists
    .map((a) => {
      if (typeof a === "string") return { name: a };
      if (a && typeof a === "object" && "name" in a) {
        return {
          id: typeof (a as any).id === "string" ? (a as any).id : undefined,
          name: String((a as any).name ?? "").trim(),
        };
      }
      return { name: "" };
    })
    .filter((a) => a.name.length > 0);
}

async function resolveTargetUser(idOrUsername: string, viewerId: string): Promise<any> {
  if (idOrUsername === "me") {
    const rows = await sql`select * from users where id = ${viewerId} limit 1`;
    if (!rows[0]) throw new ApiError(404, "Usuário não encontrado.", "USER_NOT_FOUND");
    return rows[0];
  }
  const rows = await sql`
    select * from users
    where id::text = ${idOrUsername} or lower(username) = ${idOrUsername.toLowerCase()}
    limit 1
  `;
  if (!rows[0]) throw new ApiError(404, "Usuário não encontrado.", "USER_NOT_FOUND");
  return rows[0];
}

function miniUser(row: any) {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name || row.username),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    discordHandle: row.discord_handle ? String(row.discord_handle) : null,
  };
}

export async function registerFriendsRoutes(app: FastifyInstance): Promise<void> {
  // Resumo completo do perfil para o Bento Modal
  app.get("/v1/users/:id/summary", async (request, reply) => {
    try {
      const viewerId = requireUserId(request);
      const { id } = request.params as { id: string };
      const target = await resolveTargetUser(id, viewerId);
      const targetId = String(target.id);
      const isSelf = targetId === viewerId;

      // Amigos aceitos (bidirecional)
      const friendRows = await sql`
        select u.*
        from friend_requests fr
        join users u on u.id = case
          when fr.requester_id = ${targetId} then fr.recipient_id
          else fr.requester_id
        end
        where fr.status = 'accepted'
          and (fr.requester_id = ${targetId} or fr.recipient_id = ${targetId})
        order by fr.updated_at desc
      `;

      // Pedidos pendentes (apenas para o próprio usuário)
      let pendingRequestsCount = 0;
      if (isSelf) {
        const reqRows = await sql`
          select count(*)::int as cnt
          from friend_requests
          where recipient_id = ${viewerId} and status = 'pending'
        `;
        pendingRequestsCount = Number(reqRows[0]?.cnt ?? 0);
      }

      // Status de amizade entre viewer e target
      let friendshipStatus: "self" | "friends" | "pending_sent" | "pending_received" | "none" =
        isSelf ? "self" : "none";
      let pendingRequestId: string | null = null;
      if (!isSelf) {
        const relRows = await sql`
          select id, requester_id, recipient_id, status
          from friend_requests
          where (requester_id = ${viewerId} and recipient_id = ${targetId})
             or (requester_id = ${targetId} and recipient_id = ${viewerId})
          order by updated_at desc
          limit 1
        `;
        const rel = relRows[0];
        if (rel) {
          if (rel.status === "accepted") {
            friendshipStatus = "friends";
          } else if (rel.status === "pending") {
            friendshipStatus =
              String(rel.requester_id) === viewerId ? "pending_sent" : "pending_received";
            pendingRequestId = String(rel.id);
          }
        }
      }

      const canViewProfile = isSelf || Boolean(target.is_public ?? true) || friendshipStatus === "friends";
      const canSeeHistory = canViewProfile && (isSelf || Boolean(target.show_history));
      const canSeeLikes = canViewProfile && (isSelf || Boolean(target.show_liked_tracks));

      if (!canViewProfile) {
        return reply.send({
          user: {
            id: String(target.id),
            username: String(target.username),
            displayName: String(target.display_name || target.username),
            avatarUrl: target.avatar_url ? String(target.avatar_url) : null,
            discordHandle: null,
            bio: "",
            badges: [] as Array<{ id: string; label: string; icon?: string }>,
          },
          isSelf: false,
          isPrivate: true,
          friendsCount: 0,
          friendAvatars: [],
          pendingRequestsCount: 0,
          friendshipStatus,
          pendingRequestId,
          recent: [],
          topArtistsMonth: [],
          topTracksMonth: [],
          monthlyListeningMs: 0,
          pinnedCards: [],
        });
      }

      // Recentes (últimas 5 faixas distintas tocadas)
      let recent: Array<{ track: ReturnType<typeof rowToTrack>; playedAt: string }> = [];
      let topArtistsMonth: Array<{ name: string; id?: string; coverUrl: string; playCount: number }> = [];
      let topTracksMonth: Array<{ track: ReturnType<typeof rowToTrack>; playCount: number }> = [];
      let monthlyListeningMs = 0;

      if (canSeeHistory) {
        const recentRows = await sql`
          select pe.created_at, t.*
          from playback_events pe
          join tracks t on t.id = pe.track_id
          where pe.user_id = ${targetId}
          order by pe.created_at desc, pe.id desc
          limit 25
        `;
        const seenRecent = new Set<string>();
        for (const r of recentRows) {
          const tid = String(r.id);
          if (seenRecent.has(tid)) continue;
          seenRecent.add(tid);
          recent.push({
            track: rowToTrack(r),
            playedAt: new Date(r.created_at).toISOString(),
          });
          if (recent.length >= 5) break;
        }

        // Estatísticas dos últimos 30 dias
        const monthRows = await sql`
          select pe.played_duration_ms, pe.track_duration_ms, t.*
          from playback_events pe
          join tracks t on t.id = pe.track_id
          where pe.user_id = ${targetId}
            and pe.created_at >= now() - interval '30 days'
          order by pe.created_at desc
          limit 1000
        `;

        const trackCounts = new Map<string, { row: any; count: number }>();
        const artistCounts = new Map<
          string,
          { name: string; id?: string; coverUrl: string; count: number }
        >();

        for (const r of monthRows) {
          const listened = Number(r.played_duration_ms || r.track_duration_ms || r.duration_ms || 0);
          monthlyListeningMs += Math.max(0, listened);

          const tid = String(r.id);
          const existingTrack = trackCounts.get(tid);
          if (existingTrack) {
            existingTrack.count += 1;
          } else {
            trackCounts.set(tid, { row: r, count: 1 });
          }

          const coverUrl = extractCoverUrl(r.cover);
          const artistList = extractArtistNames(r.artists);
          const primary = artistList[0];
          if (primary) {
            const key = primary.name.toLowerCase();
            const existingArtist = artistCounts.get(key);
            if (existingArtist) {
              existingArtist.count += 1;
              if (!existingArtist.coverUrl && coverUrl) existingArtist.coverUrl = coverUrl;
            } else {
              artistCounts.set(key, {
                name: primary.name,
                id: primary.id,
                coverUrl,
                count: 1,
              });
            }
          }
        }

        topTracksMonth = Array.from(trackCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map((item) => ({ track: rowToTrack(item.row), playCount: item.count }));

        topArtistsMonth = Array.from(artistCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map((a) => ({
            name: a.name,
            id: a.id,
            coverUrl: a.coverUrl,
            playCount: a.count,
          }));
      }

      // 2x2 Pinned Cards: até 3 playlists + card de Curtidas (ou 4 playlists)
      const pinnedCards: Array<{
        kind: "playlist" | "likes";
        id: string;
        title: string;
        trackCount: number;
        totalDurationMs: number;
        coverUrls: string[];
      }> = [];

      const plRows = await sql`
        select p.id, p.title,
               (select count(*)::int from playlist_items pi where pi.playlist_id = p.id) as track_count,
               coalesce((
                 select sum(t.duration_ms)::bigint
                 from playlist_items pi join tracks t on t.id = pi.track_id
                 where pi.playlist_id = p.id
               ), 0) as total_duration_ms
        from playlists p
        where p.owner_id = ${targetId}
          and (p.is_public = true or p.owner_id = ${viewerId})
        order by p.updated_at desc
        limit 3
      `;

      for (const pl of plRows) {
        const covRows = await sql`
          select t.cover
          from playlist_items pi
          join tracks t on t.id = pi.track_id
          where pi.playlist_id = ${pl.id}
          order by pi.position asc
          limit 4
        `;
        const coverUrls = covRows
          .map((c: any) => extractCoverUrl(c.cover))
          .filter(Boolean);
        pinnedCards.push({
          kind: "playlist",
          id: String(pl.id),
          title: String(pl.title),
          trackCount: Number(pl.track_count ?? 0),
          totalDurationMs: Number(pl.total_duration_ms ?? 0),
          coverUrls,
        });
      }

      if (canSeeLikes) {
        const likeStats = await sql`
          select count(*)::int as cnt, coalesce(sum(t.duration_ms), 0)::bigint as total_ms
          from likes l
          join tracks t on t.id = l.track_id
          where l.user_id = ${targetId}
        `;
        const likeCount = Number(likeStats[0]?.cnt ?? 0);
        if (likeCount > 0 || pinnedCards.length === 0) {
          const likeCovs = await sql`
            select t.cover
            from likes l
            join tracks t on t.id = l.track_id
            where l.user_id = ${targetId}
            order by l.liked_at desc
            limit 4
          `;
          pinnedCards.push({
            kind: "likes",
            id: "saved",
            title: `${target.display_name || target.username} — Likes`,
            trackCount: likeCount,
            totalDurationMs: Number(likeStats[0]?.total_ms ?? 0),
            coverUrls: likeCovs.map((c: any) => extractCoverUrl(c.cover)).filter(Boolean),
          });
        }
      }

      return reply.send({
        user: {
          ...miniUser(target),
          bio: target.bio ? String(target.bio) : "",
          badges: [] as Array<{ id: string; label: string; icon?: string }>,
        },
        isSelf,
        friendsCount: friendRows.length,
        friendAvatars: friendRows.slice(0, 4).map(miniUser),
        pendingRequestsCount,
        friendshipStatus,
        pendingRequestId,
        recent,
        topArtistsMonth,
        topTracksMonth,
        monthlyListeningMs,
        pinnedCards: pinnedCards.slice(0, 4),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Listar amigos e pedidos pendentes
  app.get("/v1/friends", async (request, reply) => {
    try {
      const userId = requireUserId(request);

      const friends = await sql`
        select u.*, fr.id as friendship_id, fr.updated_at as friends_since
        from friend_requests fr
        join users u on u.id = case
          when fr.requester_id = ${userId} then fr.recipient_id
          else fr.requester_id
        end
        where fr.status = 'accepted'
          and (fr.requester_id = ${userId} or fr.recipient_id = ${userId})
        order by fr.updated_at desc
      `;

      const incoming = await sql`
        select fr.id as request_id, fr.created_at as requested_at, u.*
        from friend_requests fr
        join users u on u.id = fr.requester_id
        where fr.recipient_id = ${userId} and fr.status = 'pending'
        order by fr.created_at desc
      `;

      const outgoing = await sql`
        select fr.id as request_id, fr.created_at as requested_at, u.*
        from friend_requests fr
        join users u on u.id = fr.recipient_id
        where fr.requester_id = ${userId} and fr.status = 'pending'
        order by fr.created_at desc
      `;

      return reply.send({
        friends: friends.map((r: any) => ({
          ...miniUser(r),
          friendsSince: new Date(r.friends_since).toISOString(),
        })),
        incomingRequests: incoming.map((r: any) => ({
          requestId: String(r.request_id),
          requestedAt: new Date(r.requested_at).toISOString(),
          user: miniUser(r),
        })),
        outgoingRequests: outgoing.map((r: any) => ({
          requestId: String(r.request_id),
          requestedAt: new Date(r.requested_at).toISOString(),
          user: miniUser(r),
        })),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Enviar pedido de amizade
  app.post("/v1/friends/request", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = (request.body ?? {}) as { targetUserId?: unknown; username?: unknown };
      const lookup =
        typeof body.targetUserId === "string" && body.targetUserId.trim()
          ? body.targetUserId.trim()
          : typeof body.username === "string" && body.username.trim()
            ? body.username.trim()
            : "";
      if (!lookup) throw new ApiError(400, "Informe o usuário.", "INVALID_TARGET");

      const target = await resolveTargetUser(lookup, userId);
      const targetId = String(target.id);
      if (targetId === userId) {
        throw new ApiError(400, "Você não pode adicionar a si mesmo.", "CANNOT_ADD_SELF");
      }

      // Verifica se já existe relação inversa pendente -> aceita automaticamente!
      const reverse = await sql`
        select id, status from friend_requests
        where requester_id = ${targetId} and recipient_id = ${userId}
        limit 1
      `;
      if (reverse[0]) {
        if (reverse[0].status === "accepted") {
          return reply.send({ status: "friends" });
        }
        if (reverse[0].status === "pending") {
          await sql`
            update friend_requests set status = 'accepted', updated_at = now()
            where id = ${reverse[0].id}
          `;
          return reply.send({ status: "friends" });
        }
      }

      // Insere ou reativa pedido
      const existing = await sql`
        select id, status from friend_requests
        where requester_id = ${userId} and recipient_id = ${targetId}
        limit 1
      `;
      if (existing[0]) {
        if (existing[0].status === "accepted") return reply.send({ status: "friends" });
        await sql`
          update friend_requests set status = 'pending', updated_at = now()
          where id = ${existing[0].id}
        `;
        return reply.send({ status: "pending_sent", requestId: String(existing[0].id) });
      }

      const inserted = await sql`
        insert into friend_requests (requester_id, recipient_id, status)
        values (${userId}, ${targetId}, 'pending')
        returning id
      `;
      return reply.send({ status: "pending_sent", requestId: String(inserted[0].id) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Aceitar pedido
  app.post("/v1/friends/requests/:id/accept", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      const updated = await sql`
        update friend_requests
        set status = 'accepted', updated_at = now()
        where id::text = ${id} and recipient_id = ${userId} and status = 'pending'
        returning id
      `;
      if (!updated[0]) throw new ApiError(404, "Pedido não encontrado.", "REQUEST_NOT_FOUND");
      return reply.send({ ok: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Recusar / cancelar pedido
  app.post("/v1/friends/requests/:id/decline", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const { id } = request.params as { id: string };
      await sql`
        delete from friend_requests
        where id::text = ${id} and (recipient_id = ${userId} or requester_id = ${userId})
      `;
      return reply.send({ ok: true });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Remover amigo
  app.delete("/v1/friends/:userId", async (request, reply) => {
    try {
      const viewerId = requireUserId(request);
      const { userId: targetId } = request.params as { userId: string };
      await sql`
        delete from friend_requests
        where (requester_id = ${viewerId} and recipient_id::text = ${targetId})
           or (requester_id::text = ${targetId} and recipient_id = ${viewerId})
      `;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
