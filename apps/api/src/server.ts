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
import { registerJamRoutes } from "./routes/jam.js";
import { registerDocsRoutes } from "./routes/docs.js";
import { registerShareRoutes, renderNotFoundHtml, renderShareHtml } from "./routes/share.js";
import { sendError } from "./http.js";

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 8 * 1024 * 1024,
});

// Suporta corpos vazios com content-type: application/json sem erro FST_ERR_CTP_EMPTY_JSON_BODY
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_req, body, done) => {
    if (!body || (typeof body === "string" && body.trim().length === 0)) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  },
);

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

app.get("/", async (request, reply) => {
  const accept = request.headers.accept ?? "";
  if (accept.includes("text/html")) {
    reply.type("text/html; charset=utf-8");
    return reply.send(
      renderShareHtml("home", "", {
        title: "OFFY Music Player",
        subtitle: "Ouça suas músicas favoritas sem limites e com alta fidelidade.",
        badge: "OFFY APP",
      }),
    );
  }
  return { ok: true, name: "offy-api", version: "1.1.3" };
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
await app.register(registerJamRoutes);
await app.register(registerDocsRoutes);
await app.register(registerShareRoutes);

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request failed");
  if (reply.sent) return;
  sendError(reply, error);
});

app.setNotFoundHandler((request, reply) => {
  const accept = request.headers.accept ?? "";
  const isHtml = accept.includes("text/html");
  const isApiRoute =
    request.url.startsWith("/v1/") || request.url.startsWith("/health");

  if (isHtml || (!isApiRoute && request.method === "GET")) {
    reply.status(404).type("text/html; charset=utf-8");
    return reply.send(renderNotFoundHtml());
  }

  reply.status(404);
  return reply.send({ code: "NOT_FOUND", message: "route not found" });
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
