// Stub-profile claim by DNI — Libreta Nacional redesign.
// Presentation only; ClaimForm and data fetching unchanged.

import Link from "next/link";

import { LnCallout } from "@/components/ui/DocElements";
import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { eq } from "drizzle-orm";
import { ClaimForm } from "./ClaimForm";

export default async function ClaimPage() {
  const { user } = await requireUserOrRedirect();

  // Wave 5 Item 25a: check presence of dni_hash (no plaintext stored).
  const [profile] = await db
    .select({ dniHash: profiles.dniHash })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const alreadyHasDni = !!profile?.dniHash;

  return (
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/mis-mascotas"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mis mascotas
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Reclamar adopción por DNI
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          ¿El refugio te registró como adoptante con tu DNI antes de que abrieras tu cuenta? Ingresá
          tu DNI y vinculamos las mascotas a tu perfil. Si tu mascota tiene chip o tatuaje,{" "}
          <Link
            href="/mis-mascotas/reclamar"
            className="text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            usá el reclamo por identificación
          </Link>
          .
        </p>
      </div>

      {alreadyHasDni ? (
        <LnCallout tone="warn">
          Tu perfil ya tiene un DNI registrado. Si esperás reclamar una mascota con otro DNI,
          contactá al refugio o a soporte.
        </LnCallout>
      ) : (
        <ClaimForm />
      )}
    </div>
  );
}
