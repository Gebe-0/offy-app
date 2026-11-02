import postgres from "postgres";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "..", ".env") });

const sql = postgres(process.env.DATABASE_URL_DIRECT, { max: 1, prepare: false });
await sql`truncate lyrics_cache`;
const rows = await sql`select count(*)::int as n from lyrics_cache`;
console.log("lyrics_cache limpo, linhas:", rows[0].n);
await sql.end();
