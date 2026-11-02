import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_DIRECT ausente no .env");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });

try {
  const dir = path.join(root, "migrations");
  const all = await readdir(dir);
  const files = all.filter((name) => name.endsWith(".sql")).sort();

  for (const name of files) {
    const full = path.join(dir, name);
    const body = await readFile(full, "utf8");
    await sql.unsafe(body);
    console.log("ok:", name);
  }

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log("migration ok:", tables.map((row) => row.table_name).join(", "));
} catch (error) {
  console.error("migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
}
