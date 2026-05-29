import { and, count, eq, isNull, ne } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db, govtAssignments, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

import { GovtSelfDeactivateForm } from "./GovtSelfDeactivateForm";

// Server component gate: only active institutional govt accounts reach the form.
// Queries coverage per locality so the UI can show the per-row status without
// a separate client-side fetch.

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

  // Gate: must be active institutional govt
  if (
    !profile ||
    profile.role !== "govt" ||
    profile.accountType !== "institutional" ||
    profile.deactivatedAt !== null
  ) {
    redirect("/cuenta");
  }

  // Load active assignments for the caller
  const myAssignments = await db
    .select({
      province: govtAssignments.jurisdictionProvince,
      locality: govtAssignments.jurisdictionLocality,
    })
    .from(govtAssignments)
    .where(and(eq(govtAssignments.userId, user.id), isNull(govtAssignments.revokedAt)));

  // For each assignment, count OTHER active govts covering the same (province, locality).
  // "Active" means: their assignment is not revoked AND their profile is not deactivated.
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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <Link
          href="/cuenta"
          className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text mb-4"
        >
          ← Volver a mi cuenta
        </Link>
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">
            Desactivar mi cuenta
          </h1>
          <p className="text-sm text-gob-text-gray ">
            Hola, <strong>{profile.displayName}</strong>. Esta accion es irreversible desde este
            panel. Si necesitás reactivar tu cuenta, contacta a un administrador.
          </p>
        </header>

        <GovtSelfDeactivateForm localities={localitiesWithCoverage} />
      </div>
    </main>
  );
}
