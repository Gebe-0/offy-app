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

const isProduction = process.env.NODE_ENV === "production";
const authSecret = required("AUTH_SECRET");
if (isProduction && authSecret.length < 32) {
  throw new Error("AUTH_SECRET must be at least 32 characters in production");
}

export const env = {
  isProduction,
  databaseUrl: required("DATABASE_URL"),
  databaseDirectUrl: process.env.DATABASE_URL_DIRECT ?? required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",
  authSecret,
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
