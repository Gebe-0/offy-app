import type { FastifyInstance } from "fastify";
import { sql } from "../db.js";
import { ApiError, int, requireUserId, sendError, str } from "../http.js";
import { USERNAME_PATTERN, userProfile } from "../users.js";

async function findUser(idOrUsername: string): Promise<any> {
  const rows = await sql`
    select * from users
    where id::text = ${idOrUsername} or lower(username) = ${idOrUsername.toLowerCase()}
    limit 1
  `;
  if (!rows[0]) throw new ApiError(404, "USER_NOT_FOUND", "USER_NOT_FOUND");
  return rows[0];
}

async function counts(userId: string): Promise<{ followersCount: number; followingCount: number }> {
  const rows = await sql`
    select
      (select count(*) from follows where followee_id = ${userId}) as followers,
      (select count(*) from follows where follower_id = ${userId}) as following
  `;
  return {
    followersCount: Number(rows[0]?.followers ?? 0),
    followingCount: Number(rows[0]?.following ?? 0),
  };
}

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/users/search", async (request, reply) => {
    try {
      const viewer = requireUserId(request);
      const query = request.query as Record<string, unknown>;
      const term = str(query.q).trim();
      if (!term) return reply.send([]);
      const limit = Math.min(50, Math.max(1, int(query.limit, 20)));
      const rows = await sql`
        select * from users
        where lower(username) like ${`%${term.toLowerCase()}%`}
           or lower(coalesce(display_name, '')) like ${`%${term.toLowerCase()}%`}
        order by username asc
        limit ${limit}
      `;
      const results = [];
      for (const row of rows) {
        const stats = await counts(String(row.id));
        const follows = await sql`
          select 1 from follows where follower_id = ${viewer} and followee_id = ${row.id} limit 1
        `;
        results.push(userProfile(row, { ...stats, isFollowing: Boolean(follows[0]) }));
      }
      return reply.send(results);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/users/me", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const rows = await sql`select * from users where id = ${userId} limit 1`;
      if (!rows[0]) throw new ApiError(404, "USER_NOT_FOUND", "USER_NOT_FOUND");
      return reply.send(userProfile(rows[0], { ...(await counts(userId)), includePrivate: true }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/v1/users/me", async (request, reply) => {
    try {
      const userId = requireUserId(request);
      const body = (request.body ?? {}) as Record<string, unknown>;

      if (typeof body.username === "string") {
        const username = body.username.trim().toLowerCase();
        if (!USERNAME_PATTERN.test(username)) throw new ApiError(400, "INVALID_USERNAME", "INVALID_USERNAME");
        const taken = await sql`
          select 1 from users where lower(username) = ${username} and id <> ${userId} limit 1
        `;
        if (taken[0]) throw new ApiError(409, "USERNAME_TAKEN", "USERNAME_TAKEN");
        await sql`update users set username = ${username} where id = ${userId}`;
      }

      const textFields: Array<[string, string]> = [
        ["display_name", "displayName"],
        ["avatar_url", "avatarUrl"],
        ["bio", "bio"],
      ];
      for (const [column, key] of textFields) {
        if (key in body) {
          const value = typeof body[key] === "string" ? (body[key] as string) : null;
          await sql`update users set ${sql(column)} = ${value} where id = ${userId}`;
        }
      }

      const boolFields: Array<[string, string]> = [
        ["is_public", "isPublic"],
        ["show_activity", "showActivity"],
        ["show_history", "showHistory"],
        ["show_liked_tracks", "showLikedTracks"],
        ["participate_leaderboards", "participateLeaderboards"],
      ];
      for (const [column, key] of boolFields) {
        if (typeof body[key] === "boolean") {
          await sql`update users set ${sql(column)} = ${body[key] as boolean} where id = ${userId}`;
        }
      }

      await sql`update users set updated_at = now() where id = ${userId}`;
      const rows = await sql`select * from users where id = ${userId} limit 1`;
      return reply.send(userProfile(rows[0], await counts(userId)));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/users/:id", async (request, reply) => {
    try {
      const viewer = requireUserId(request);
      const { id } = request.params as { id: string };
      const row = await findUser(id);
      const follows = await sql`
        select 1 from follows where follower_id = ${viewer} and followee_id = ${row.id} limit 1
      `;
      return reply.send(userProfile(row, { ...(await counts(String(row.id))), isFollowing: Boolean(follows[0]) }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/v1/users/:id/follow", async (request, reply) => {
    try {
      const viewer = requireUserId(request);
      const { id } = request.params as { id: string };
      const row = await findUser(id);
      if (String(row.id) === viewer) throw new ApiError(400, "CANNOT_FOLLOW_SELF", "CANNOT_FOLLOW_SELF");
      await sql`
        insert into follows (follower_id, followee_id) values (${viewer}, ${row.id})
        on conflict do nothing
      `;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/v1/users/:id/follow", async (request, reply) => {
    try {
      const viewer = requireUserId(request);
      const { id } = request.params as { id: string };
      const row = await findUser(id);
      await sql`delete from follows where follower_id = ${viewer} and followee_id = ${row.id}`;
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/users/:id/followers", async (request, reply) => {
    try {
      const viewer = requireUserId(request);
      const { id } = request.params as { id: string };
      const row = await findUser(id);
      const rows = await sql`
        select u.* from follows f join users u on u.id = f.follower_id
        where f.followee_id = ${row.id} order by f.created_at desc limit 100
      `;
      void viewer;
      return reply.send(rows.map((entry: any) => userProfile(entry, { followersCount: 0, followingCount: 0 })));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/users/:id/following", async (request, reply) => {
    try {
      const viewer = requireUserId(request);
      const { id } = request.params as { id: string };
      const row = await findUser(id);
      const rows = await sql`
        select u.* from follows f join users u on u.id = f.followee_id
        where f.follower_id = ${row.id} order by f.created_at desc limit 100
      `;
      void viewer;
      return reply.send(rows.map((entry: any) => userProfile(entry, { followersCount: 0, followingCount: 0 })));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/v1/users/:id/playlists", async (request, reply) => {
    try {
      const viewer = requireUserId(request);
      const { id } = request.params as { id: string };
      const row = await findUser(id);
      const rows = await sql`
        select p.*, u.username as owner_username, u.display_name as owner_display_name, u.avatar_url as owner_avatar_url,
               (select count(*) from playlist_items i where i.playlist_id = p.id) as track_count
        from playlists p join users u on u.id = p.owner_id
        where p.owner_id = ${row.id} and (p.is_public = true or p.owner_id::text = ${viewer})
        order by p.created_at desc
      `;
      return reply.send({
        items: rows.map((entry: any) => ({
          id: String(entry.id),
          title: String(entry.title),
          description: entry.description ?? "",
          isPublic: Boolean(entry.is_public),
          createdAt: String(entry.created_at),
          updatedAt: String(entry.updated_at),
          revision: Number(entry.revision ?? 1),
          trackCount: Number(entry.track_count ?? 0),
          ownerId: String(entry.owner_id),
          owner: {
            id: String(entry.owner_id),
            username: entry.owner_username ?? null,
            displayName: entry.owner_display_name ?? null,
            avatarUrl: entry.owner_avatar_url ?? null,
          },
        })),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
