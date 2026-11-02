import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { sql } from "./db.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerLibraryRoutes } from "./routes/library.js";
import { registerPlaylistRoutes } from "./routes/playlists.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerLyricsRoutes } from "./routes/lyrics.js";
import { registerRecommendationRoutes } from "./routes/recommendations.js";
import { registerPresenceRoutes } from "./routes/presence.js";

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 8 * 1024 * 1024,
});

await app.register(cors, {
  origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(","),
  credentials: true,
  exposedHeaders: ["etag", "x-request-id"],
});

app.get("/health", async () => {
  const started = Date.now();
  await sql`select 1`;
  return { ok: true, dbMs: Date.now() - started };
});

await app.register(registerAuthRoutes);
await app.register(registerCatalogRoutes);
await app.register(registerLibraryRoutes);
await app.register(registerPlaylistRoutes);
await app.register(registerUserRoutes);
await app.register(registerHistoryRoutes);
await app.register(registerLyricsRoutes);
await app.register(registerRecommendationRoutes);
await app.register(registerPresenceRoutes);

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request failed");
  if (reply.sent) return;
  reply.status(500).send({ code: "INTERNAL", message: "internal error" });
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await sql.end({ timeout: 5 }).catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.port, host: env.host });
  app.log.info(`offy api on http://${env.host}:${env.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
