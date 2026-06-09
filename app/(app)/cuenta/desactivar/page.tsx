// Desactivar cuenta — Libreta Nacional redesign.
// GovtSelfDeactivateForm (client component) unchanged.

import { and, count, eq, isNull, ne } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LnCallout } from "@/components/ui/DocElements";
import { db, govtAssignments, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { GovtSelfDeactivateForm } from "./GovtSelfDeactivateForm";

export default async function DesactivarPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db
    .select({
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
      displayName: profiles.displayName,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (
    !profile ||
    profile.role !== "govt" ||
    profile.accountType !== "institutional" ||
    profile.deactivatedAt !== null
  ) {
    redirect("/cuenta");
  }

  const myAssignments = await db
    .select({
      province: govtAssignments.jurisdictionProvince,
      locality: govtAssignments.jurisdictionLocality,
    })
    .from(govtAssignments)
    .where(and(eq(govtAssignments.userId, user.id), isNull(govtAssignments.revokedAt)));

  const localitiesWithCoverage = await Promise.all(
    myAssignments.map(async (a) => {
      const [{ otherCount }] = await db
        .select({ otherCount: count() })
        .from(govtAssignments)
        .innerJoin(profiles, eq(profiles.id, govtAssignments.userId))
        .where(
          and(
            ne(govtAssignments.userId, user.id),
            eq(govtAssignments.jurisdictionProvince, a.province),
            eq(govtAssignments.jurisdictionLocality, a.locality),
            isNull(govtAssignments.revokedAt),
            isNull(profiles.deactivatedAt),
          ),
        );

      return {
        province: a.province,
        locality: a.locality,
        otherActiveGovtCount: otherCount,
      };
    }),
  );

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
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Desactivar mi cuenta
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Hola, <strong>{profile.displayName}</strong>. Esta acción es irreversible desde este
          panel. Si necesitás reactivar tu cuenta, contactá a un administrador.
        </p>
      </div>

      <LnCallout tone="warn" title="Esta acción es irreversible" className="mb-[24px]">
        Al desactivar tu cuenta, perdés acceso al panel de operador gubernamental.
      </LnCallout>

      <GovtSelfDeactivateForm localities={localitiesWithCoverage} />
    </div>
  );
}
