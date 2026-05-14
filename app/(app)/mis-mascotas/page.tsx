// Placeholder pet list. Until we build the first-pet creation flow (next
// milestone), this just confirms the user is logged in and shows their name.

import { eq } from "drizzle-orm";
import { db, profiles } from "@/db";
import { logoutAction } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MisMascotasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // unreachable — layout guards this

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-12 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Hola, {profile?.displayName ?? "amigo"}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Todavía no tenés mascotas registradas.
          </p>
        </div>

        <button
          type="button"
          disabled
          className="px-5 py-3 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          title="Próximamente"
        >
          Agregar tu primera mascota (próximamente)
        </button>

        <form action={logoutAction}>
          <button
            type="submit"
            className="text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
