// Stub-profile claim page. Lets a user who recently signed up for DIM vincular
// their auth account with a "stub" profile a refugio created at adoption time
// (DNI-keyed). After the claim, the pets registered to the stub appear in the
// user's /mis-mascotas listing.

import { db, profiles } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { ClaimForm } from "./ClaimForm";

export default async function ClaimPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await db
    .select({ dniNumber: profiles.dniNumber })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const alreadyHasDni = !!profile?.dniNumber;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-10 space-y-6">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
        >
          ← Mis mascotas
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Reclamar adopción
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            ¿El refugio te registró como adoptante con tu DNI antes de que abrieras tu cuenta?
            Ingresá tu DNI y vinculamos las mascotas a tu perfil.
          </p>
        </header>

        {alreadyHasDni ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Tu perfil ya tiene un DNI registrado. Si esperás reclamar una mascota con otro DNI,
            contactá al refugio o a soporte.
          </div>
        ) : (
          <ClaimForm />
        )}
      </div>
    </main>
  );
}
