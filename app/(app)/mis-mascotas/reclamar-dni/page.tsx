// Stub-profile claim page. Lets a user who recently signed up for DIM vincular
// their auth account with a "stub" profile a refugio created at adoption time
// (DNI-keyed). After the claim, the pets registered to the stub appear in the
// user's /mis-mascotas listing.

import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { ClaimForm } from "./ClaimForm";

export default async function ClaimPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db
    .select({ dniNumber: profiles.dniNumber })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const alreadyHasDni = !!profile?.dniNumber;

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-10 space-y-6">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4"
        >
          ← Mis mascotas
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            Reclamar adopción por DNI
          </h1>
          <p className="text-sm text-gob-text-gray ">
            ¿El refugio te registró como adoptante con tu DNI antes de que abrieras tu cuenta?
            Ingresá tu DNI y vinculamos las mascotas a tu perfil. Si tu mascota tiene chip o
            tatuaje,{" "}
            <Link
              href="/mis-mascotas/reclamar"
              className="underline underline-offset-2 hover:text-gob-text "
            >
              usá el reclamo por identificación
            </Link>
            .
          </p>
        </header>

        {alreadyHasDni ? (
          <div className="rounded border border-gob-warning bg-gob-warning/10 px-3 py-3 text-sm text-gob-warning-text   ">
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
