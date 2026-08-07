// Génesis precondition: create ONLY the bootstrap founder (admin@dim.test) on an
// otherwise-empty DB (after db:reset && db:bootstrap). The rest of the world is
// grown BY the Génesis test. No demo data. See 2026-07-05-uxgate-genesis.md.
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = "admin@dim.test";
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    // Already there? (idempotent)
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = list?.users.find((u) => u.email === email);
    if (existing) {
      // Guarantee the role even on a re-run against a pre-existing user.
      await sql`update public.profiles set role = 'admin', updated_at = now() where id = ${existing.id}::uuid`;
      console.log(`admin@ already exists (${existing.id}) — ensured role=admin`);
      return;
    }
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: "Test1234!",
      email_confirm: true,
      user_metadata: { display_name: "Admin" },
    });
    if (error || !data.user) {
      console.error(`createUser failed: ${error?.message ?? "no user"}`);
      process.exit(1);
    }
    // The profiles trigger ALWAYS creates the row as 'owner' — it never trusts
    // request metadata for the role (see migration 0134). Privileged roles are
    // granted only by this explicit service-role UPDATE, mirroring
    // bootstrapAdmin() in scripts/seed-test-users.ts.
    await sql`update public.profiles set role = 'admin', updated_at = now() where id = ${data.user.id}::uuid`;
    console.log(
      `Génesis: created admin@dim.test (${data.user.id}) role=admin. World is empty otherwise.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().then(
  () => {
    process.exitCode = 0;
  },
  (err) => {
    console.error(err);
    process.exitCode = 1;
  },
);
