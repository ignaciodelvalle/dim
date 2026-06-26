// Govt custody-dispute list — migrated to CaseQueue (Wave 2 Item 12).
//
// Behaviour unchanged: admin sees all, govt scoped to their jurisdiction tuples.
// The existing URL-tab filter (?tab=open|resolved) is preserved via CaseQueue's
// status filter chips which map to the same search-param semantics.

import { Suspense } from "react";

import { CaseQueue, type CaseQueueRow } from "@/components/ui/dashboard/CaseQueue";
import { custodyDisputes, db, pets } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { desc, eq, ne } from "drizzle-orm";

function parseStatus(raw: string | undefined): "open" | "closed" | null {
  if (raw === "open") return "open";
  if (raw === "closed") return "closed";
  return null;
}

export default async function GobDisputasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const sp = await searchParams;
  const activeStatus = parseStatus(sp.status);

  // Fetch dispute rows filtered by active status (open vs. closed/resolved).
  // "closed" maps to non-open statuses: resolved + withdrawn.
  const statusFilter =
    activeStatus === "open"
      ? eq(custodyDisputes.status, "open")
      : activeStatus === "closed"
        ? ne(custodyDisputes.status, "open")
        : undefined;

  const query = db
    .select({ dispute: custodyDisputes, pet: pets })
    .from(custodyDisputes)
    .innerJoin(pets, eq(pets.id, custodyDisputes.petId))
    .orderBy(desc(custodyDisputes.createdAt));

  const rows = statusFilter ? await query.where(statusFilter) : await query;

  // Admin sees all; govt is filtered to their jurisdiction tuples.
  const scoped =
    profile.role === "admin"
      ? rows
      : rows.filter((row) =>
          jurisdictions.some(
            (j) =>
              j.province === row.dispute.jurisdictionProvince &&
              j.locality === row.dispute.jurisdictionLocality,
          ),
        );

  // Map dispute rows → CaseQueueRow (CaseQueue's expected shape).
  // custody_dispute status: "open" → CaseStatus "open"; others → "closed".
  const queueRows: CaseQueueRow[] = scoped.map(({ dispute, pet }) => ({
    id: dispute.id,
    publicCode: dispute.publicToken,
    caseKind: "custody_dispute" as const,
    status: dispute.status === "open" ? "open" : "closed",
    primaryPetName: pet.name,
    primaryPetPublicToken: pet.publicToken,
    jurisdictionProvince: dispute.jurisdictionProvince,
    jurisdictionLocality: dispute.jurisdictionLocality,
    openedAt: dispute.createdAt,
    closedAt: dispute.resolvedAt ?? null,
    // Dispute detail lives at its own route (uses publicToken, not publicCode).
    detailHref: `/gob/disputas/${dispute.publicToken}`,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">Disputas</p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Disputas de custodia</h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Todas las disputas en el sistema."
            : "Disputas en tu cobertura."}
        </p>
      </header>

      <Suspense>
        <CaseQueue
          rows={queueRows}
          filters={{ kind: "custody_dispute", status: activeStatus }}
          filterBase="/gob/disputas"
          caption="Cola de disputas de custodia"
          emptyMessage={
            activeStatus === "open"
              ? "No hay disputas abiertas."
              : activeStatus === "closed"
                ? "No hay disputas resueltas o retiradas."
                : "No hay disputas."
          }
        />
      </Suspense>
    </div>
  );
}

export const dynamic = "force-dynamic";
