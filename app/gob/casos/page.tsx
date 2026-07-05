// Govt-scope case index. Lists every case whose jurisdiction matches
// the govt's active assignments (province + locality). Admins see the
// same view but redirected via /admin/casos.
//
// Migrated to the shared CaseQueue (Wave B systemic — master-detail /
// shared-component adoption). Previously this surface hand-rolled a divergent
// list with ZERO filters; it now shares the canonical queue table, per-row
// SLA/age badge, a11y semantics, and status filter chips with /org/…/casos
// and /admin/casos. Keyset pagination (PERF-5) is preserved via the footer
// below — CaseQueue renders the table + chips; the page owns cursor links.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { CaseQueue, type CaseQueueRow } from "@/components/ui/dashboard/CaseQueue";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { listCasesForGovt } from "@/lib/infra/case-queries";
import { newerHref, olderHref } from "@/lib/utils/keyset-pagination";

const GOVT_CASOS_PAGE_LIMIT = 50;

function parseStatus(raw: string | undefined): "open" | "closed" | null {
  if (raw === "open") return "open";
  if (raw === "closed") return "closed";
  return null;
}

export default async function GovtCasosPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; status?: string }>;
}) {
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role === "admin") redirect("/admin/casos");

  const sp = await searchParams;
  const rawCursor = sp.cursor;
  const activeStatus = parseStatus(sp.status);

  // Fetch limit+1 to detect hasMore.
  const rawItems = await listCasesForGovt(session.jurisdictions, {
    limit: GOVT_CASOS_PAGE_LIMIT + 1,
    cursor: rawCursor,
    filters: { status: activeStatus },
  });
  const hasMore = rawItems.length > GOVT_CASOS_PAGE_LIMIT;
  const items = hasMore ? rawItems.slice(0, GOVT_CASOS_PAGE_LIMIT) : rawItems;

  // Preserve the active status filter across cursor links.
  const filterParams: Record<string, string | undefined> = {
    ...(activeStatus ? { status: activeStatus } : {}),
  };
  const lastItem = items.at(-1);
  const olderLink =
    hasMore && lastItem
      ? olderHref("/gob/casos", filterParams, { ts: lastItem.openedAt, id: lastItem.id })
      : null;
  const newerLink = rawCursor ? newerHref("/gob/casos", filterParams) : null;

  // Map CaseListItem → CaseQueueRow (shapes are identical except detailHref).
  // Detail links stay INSIDE the /gob operator shell via /gob/casos/[code]
  // (task #47): the row previously pointed at the public /casos/[publicCode]
  // route, which renders under the citizen layout and stripped the operator
  // rail. The gob route reuses the same CaseDetailView; canReadCase still
  // gates govt-in-scope access, so nothing is widened.
  const queueRows: CaseQueueRow[] = items.map((c) => ({
    id: c.id,
    publicCode: c.publicCode,
    caseKind: c.caseKind,
    status: c.status,
    primaryPetName: c.primaryPetName,
    primaryPetPublicToken: c.primaryPetPublicToken,
    jurisdictionProvince: c.jurisdictionProvince,
    jurisdictionLocality: c.jurisdictionLocality,
    openedAt: c.openedAt,
    closedAt: c.closedAt,
    detailHref: `/gob/casos/${c.publicCode}`,
  }));

  const emptyMessage =
    activeStatus === "open"
      ? "No hay casos abiertos en tu jurisdicción."
      : activeStatus === "closed"
        ? "No hay casos cerrados en tu jurisdicción."
        : "Sin casos en tu jurisdicción por ahora.";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Casos regulatorios
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">Casos</h1>
        <p className="text-[13px] text-ln-op-mute">Expedientes en tu jurisdicción asignada.</p>
      </header>

      {session.jurisdictions.length === 0 ? (
        <LnEmptyState
          icon="usuarios"
          title="No tenés jurisdicciones asignadas todavía."
          description="Pedile a un administrador que te asigne una jurisdicción."
        />
      ) : (
        <Suspense>
          <CaseQueue
            rows={queueRows}
            filters={{ status: activeStatus }}
            filterBase="/gob/casos"
            caption="Cola de casos de tu jurisdicción"
            emptyMessage={emptyMessage}
          />
        </Suspense>
      )}

      {/* Keyset pagination footer — preserves the active status filter. */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de casos"
          className="mt-6 flex items-center justify-between gap-4 border-t border-ln-op-line pt-4"
        >
          <div>
            {newerLink && (
              <Link
                href={newerLink}
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
              >
                ← Más recientes
              </Link>
            )}
          </div>
          <div>
            {olderLink && (
              <Link
                href={olderLink}
                className="text-sm font-medium text-ln-op-azul no-underline hover:underline"
              >
                Ver más antiguos →
              </Link>
            )}
          </div>
        </nav>
      )}
    </main>
  );
}
