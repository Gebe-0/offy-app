import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  databaseDirectUrl: process.env.DATABASE_URL_DIRECT ?? required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",
  authSecret: required("AUTH_SECRET"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
