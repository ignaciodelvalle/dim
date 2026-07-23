// Govt custody-dispute list — migrated to CaseQueue (Wave 2 Item 12).
//
// Behaviour unchanged: admin sees all, govt scoped to their jurisdiction tuples.
// The existing URL-tab filter (?tab=open|resolved) is preserved via CaseQueue's
// status filter chips which map to the same search-param semantics.
//
// F6 fusion (2026-07-22): this is the byte-identical body of the former
// /gob/disputas page.tsx, relocated so the Casos hub (app/gob/casos/page.tsx)
// can render it as its "Disputas" expediente under ?expediente=disputas.
// /gob/disputas itself now only redirects here via the hub (see
// app/gob/disputas/page.tsx) — this is a RELOCATION, not a redesign: same
// searchParams contract, same auth guard, same query logic. The nested
// detail route (/gob/disputas/[disputeToken]) is UNCHANGED.

import { Suspense } from "react";

import { CaseQueue, type CaseQueueRow } from "@/components/ui/dashboard/CaseQueue";
import { custodyDisputes, db, pets } from "@/db";
import { custodyDisputesScopeClause } from "@/lib/analytics/govt-dashboards";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { type SQL, and, desc, eq, ne } from "drizzle-orm";

function parseStatus(raw: string | undefined): "open" | "closed" | null {
  if (raw === "open") return "open";
  if (raw === "closed") return "closed";
  return null;
}

export type DisputasScreenProps = { searchParams: { status?: string } };

export async function DisputasScreen({ searchParams: sp }: DisputasScreenProps) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const activeStatus = parseStatus(sp.status);

  // Fetch dispute rows filtered by active status (open vs. closed/resolved).
  // "closed" maps to non-open statuses: resolved + withdrawn.
  const statusFilter =
    activeStatus === "open"
      ? eq(custodyDisputes.status, "open")
      : activeStatus === "closed"
        ? ne(custodyDisputes.status, "open")
        : undefined;

  // Jurisdiction scope is a SQL predicate, NOT a JS post-filter — a CABA
  // operator must never READ a Córdoba row at the DB level (AGENTS.md). Admin =
  // no restriction; govt = OR of (province,locality) pairs; govt with no
  // assignments = sql`false` (matches nothing).
  //
  // The scope predicate comes from the SAME helper the analytics "Disputas de
  // custodia" KPI uses, so the queue count and the KPI alarm always reconcile
  // (count↔queue parity). null (admin) → undefined so the filter is omitted.
  const scopeFilter: SQL | undefined =
    custodyDisputesScopeClause({ role: profile.role }, jurisdictions) ?? undefined;

  const conditions = [statusFilter, scopeFilter].filter((c): c is SQL => c !== undefined);

  const query = db
    .select({ dispute: custodyDisputes, pet: pets })
    .from(custodyDisputes)
    .innerJoin(pets, eq(pets.id, custodyDisputes.petId))
    .orderBy(desc(custodyDisputes.createdAt));

  const scoped = conditions.length > 0 ? await query.where(and(...conditions)) : await query;

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
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Disputas de custodia
        </h1>
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
          filterBase="/gob/casos"
          extraFilterParams={{ expediente: "disputas" }}
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
