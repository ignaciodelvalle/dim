import Link from "next/link";

import { db, ownerships, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { and, eq, isNull } from "drizzle-orm";

const REASON_LABELS: Record<string, string> = {
  medical_treatment: "Tratamiento médico en curso",
  behavioral_evaluation: "Evaluación de comportamiento",
  recovery: "Recuperación",
  quarantine: "Cuarentena",
  legal_hold: "Retención legal",
  age: "Edad",
  pending_intake_eval: "Evaluación de intake pendiente",
  other: "Otro",
};

export default async function PetsNoAptasPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization } = await requireOrgAccessByToken(orgToken);

  const rows = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(ownerships.ownerOrganizationId, organization.id),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
        eq(pets.adoptionEligible, false),
      ),
    );

  // Group by reason.
  const byReason = new Map<string, typeof rows>();
  for (const row of rows) {
    const reason = row.pet.adoptionIneligibleReason ?? "other";
    const list = byReason.get(reason) ?? [];
    list.push(row);
    byReason.set(reason, list);
  }

  const now = new Date();

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto pt-10 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Mascotas no aptas para adopción
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Animales en custodia marcados explícitamente como NO aptos para adopción. Resolvé el
            motivo desde el perfil del pet para volver a marcarlos como aptos.
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6 text-center">
            No hay mascotas marcadas como no aptas.
          </p>
        ) : (
          Array.from(byReason.entries()).map(([reason, list]) => (
            <section key={reason} className="space-y-2">
              <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-50">
                {REASON_LABELS[reason] ?? reason}
              </h2>
              <ul className="space-y-2">
                {list.map(({ pet }) => {
                  const until = pet.adoptionIneligibleUntil
                    ? new Date(pet.adoptionIneligibleUntil)
                    : null;
                  const reEvalDue = until ? until < now : false;
                  return (
                    <li
                      key={pet.id}
                      className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-3 space-y-1"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`/org/${orgToken}/mascotas/${pet.publicToken}/eligibility`}
                          className="font-medium hover:underline"
                        >
                          {pet.name}
                        </Link>
                        {reEvalDue && (
                          <span className="text-xs rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-2 py-0.5">
                            Re-evaluación vencida
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500">
                        {pet.species}
                        {pet.adoptionIneligibleReasonNotes &&
                          ` · ${pet.adoptionIneligibleReasonNotes}`}
                        {until && (
                          <>
                            {" · "}
                            <span>
                              vence{" "}
                              {until.toLocaleDateString("es-AR", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
