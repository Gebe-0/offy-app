import postgres from "postgres";
import { env } from "./env.js";

/**
 * Neon entrega um pooler na frente do Postgres; prepared statements não
 * sobrevivem a ele. `prepare: false` é obrigatório nessa URL.
 */
export const sql = postgres(env.databaseUrl, {
  max: Number(process.env.DB_MAX_CONNECTIONS ?? 30),
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
  onnotice: () => undefined,
});

export type Sql = typeof sql;
