import Link from "next/link";

import { custodyDisputes, db, pets } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { desc, eq } from "drizzle-orm";

export default async function GobDisputasPage() {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  // Admin sees every open dispute. Govt is filtered to their jurisdictions
  // tuples; client-side because the (province, locality) pairs aren't a
  // single column we can ANY() against without a CTE.
  const allOpen = await db
    .select({ dispute: custodyDisputes, pet: pets })
    .from(custodyDisputes)
    .innerJoin(pets, eq(pets.id, custodyDisputes.petId))
    .where(eq(custodyDisputes.status, "open"))
    .orderBy(desc(custodyDisputes.createdAt));

  const scoped =
    profile.role === "admin"
      ? allOpen
      : allOpen.filter((row) =>
          jurisdictions.some(
            (j) =>
              j.province === row.dispute.jurisdictionProvince &&
              j.locality === row.dispute.jurisdictionLocality,
          ),
        );

  return (
    <main className="px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold text-gob-text">Disputas de custodia</h1>
          <p className="text-sm text-gob-text-gray">
            {profile.role === "admin"
              ? "Todas las disputas abiertas en el sistema."
              : "Disputas abiertas en tu cobertura."}
          </p>
        </header>

        {scoped.length === 0 ? (
          <p className="text-sm text-gob-text-muted">No hay disputas abiertas.</p>
        ) : (
          <ul className="space-y-2">
            {scoped.map(({ dispute, pet }) => (
              <li key={dispute.id} className="rounded-lg border border-gob-border">
                <Link
                  href={`/gob/disputas/${dispute.publicToken}`}
                  className="block px-4 py-3 hover:bg-gob-surface-alt transition"
                >
                  <p className="text-sm font-medium text-gob-text">
                    {pet.name} <span className="text-neutral-500 font-normal">({pet.species})</span>
                  </p>
                  <p className="text-xs text-gob-text-muted mt-0.5">
                    {dispute.jurisdictionLocality}, {dispute.jurisdictionProvince} · Abierta{" "}
                    {new Date(dispute.createdAt).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-[10px] text-gob-text-muted font-mono mt-1">
                    {dispute.publicToken}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
