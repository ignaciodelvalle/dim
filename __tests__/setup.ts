// Vitest setup. Loads .env.local so DATABASE_URL is available, and falls
// back to the local Supabase Postgres URL so tests work even on a fresh
// clone where the env file isn't filled in yet.

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}
