// Crear consultorio — Libreta Nacional redesign.
// CrearConsultorioForm (client component) unchanged.

import { and, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { db, organizationMemberships, organizations, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { CrearConsultorioForm } from "./CrearConsultorioForm";

export default async function CrearConsultorioPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db
    .select({
      role: profiles.role,
      matriculaVerified: profiles.matriculaVerified,
      displayName: profiles.displayName,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile || profile.role !== "vet" || !profile.matriculaVerified) {
    redirect("/cuenta");
  }

  const [adminMembership] = await db
    .select({ publicToken: organizations.publicToken })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, user.id),
        inArray(organizationMemberships.role, ["admin", "coordinator"]),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (adminMembership) {
    redirect(`/org/${adminMembership.publicToken}`);
  }

  const defaultName = `Consultorio ${profile.displayName}`;

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-[28px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Crear consultorio
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Completá los datos de tu consultorio para empezar a ofrecer servicios en MiMAR.
        </p>
      </div>

      <LnCard>
        <LnCardHead title="Datos del consultorio" />
        <LnCardBody>
          <CrearConsultorioForm defaultName={defaultName} />
        </LnCardBody>
      </LnCard>
    </div>
  );
}
