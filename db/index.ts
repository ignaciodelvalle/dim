// Database client. Use this `db` export from server-side code (server components,
// server actions, route handlers). NEVER import this file into client components.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment");
}

// `prepare: false` keeps us compatible with Supabase's pooled (Supavisor) connection
// when we eventually deploy. No real cost locally.
const client = postgres(process.env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });

// Re-export everything from schema so app code can `import { pets, db } from "@/db"`.
export * from "./schema";
