// Génesis precondition: create ONLY the bootstrap founder (admin@dim.test) on an
// otherwise-empty DB (after db:reset && db:bootstrap). The rest of the world is
// grown BY the Génesis test. No demo data. See 2026-07-05-uxgate-genesis.md.
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "http://127.0.0.1:54321";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = "admin@dim.test";
  // Already there? (idempotent)
  const { data: list } = await supabase.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  if (existing) {
    console.log(`admin@ already exists (${existing.id}) — nothing to do`);
    return;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    // the profiles trigger reads user_role from raw_user_meta_data
    user_metadata: { display_name: "Admin", user_role: "admin" },
  });
  if (error || !data.user) {
    console.error(`createUser failed: ${error?.message ?? "no user"}`);
    process.exit(1);
  }
  console.log(`Génesis: created admin@dim.test (${data.user.id}) role=admin. World is empty otherwise.`);
}

main().then(() => process.exit(0));
