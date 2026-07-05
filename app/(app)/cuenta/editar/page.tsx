// Editar cuenta — Libreta Nacional redesign.
// Wraps EditProfileForm (client component) unchanged.

import { eq } from "drizzle-orm";
import Link from "next/link";

import { LnCallout } from "@/components/ui/DocElements";
import { db, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";

import { EditProfileForm } from "./EditProfileForm";

export default async function EditarCuentaPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db
    .select({
      displayName: profiles.displayName,
      phone: profiles.phone,
      avatarUrl: profiles.avatarUrl,
      preferredVetName: profiles.preferredVetName,
      preferredVetPhone: profiles.preferredVetPhone,
      emergencyContactName: profiles.emergencyContactName,
      emergencyContactPhone: profiles.emergencyContactPhone,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return (
    <div className="mx-auto max-w-2xl px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-5 inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-7">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Editar mi información
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Actualizá tu nombre, teléfono, contactos de emergencia y foto de perfil.
        </p>
      </div>

      <EditProfileForm
        initialProfile={{
          displayName: profile?.displayName ?? "",
          phone: profile?.phone ?? "",
          avatarUrl: profile?.avatarUrl ?? "",
          preferredVetName: profile?.preferredVetName ?? "",
          preferredVetPhone: profile?.preferredVetPhone ?? "",
          emergencyContactName: profile?.emergencyContactName ?? "",
          emergencyContactPhone: profile?.emergencyContactPhone ?? "",
        }}
      />
    </div>
  );
}
