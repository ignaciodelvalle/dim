import Link from "next/link";

import { OpCard, OpCardBody } from "@/components/ui/dashboard";
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
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Disputas
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Disputas de custodia</h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Todas las disputas abiertas en el sistema."
            : "Disputas abiertas en tu cobertura."}
        </p>
      </header>

      {scoped.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">No hay disputas abiertas.</p>
      ) : (
        <ul className="space-y-2">
          {scoped.map(({ dispute, pet }) => (
            <li key={dispute.id}>
              <OpCard>
                <OpCardBody className="p-0">
                  <Link
                    href={`/gob/disputas/${dispute.publicToken}`}
                    className="block px-4 py-3 hover:bg-ln-op-stripe transition-colors no-underline"
                  >
                    <p className="text-[13px] font-medium text-ln-op-ink">
                      {pet.name}{" "}
                      <span className="text-ln-op-mute font-normal">({pet.species})</span>
                    </p>
                    <p className="text-[12px] text-ln-op-mute mt-0.5">
                      {dispute.jurisdictionLocality}, {dispute.jurisdictionProvince} · Abierta{" "}
                      {new Date(dispute.createdAt).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-[10px] text-ln-op-faint font-mono mt-1">
                      {dispute.publicToken}
                    </p>
                  </Link>
                </OpCardBody>
              </OpCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
