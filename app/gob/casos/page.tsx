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
//
// kind + province filters + total count (#26 admin↔gob drift unification,
// D2): mirrors /admin/casos' kind filter and count, via
// listCasesForGovt/countCasesForGovt (lib/infra/case-queries.ts) — the SAME
// kind/status clause builder admin uses (buildCaseKindStatusClauses), ANDed
// onto the mandatory jurisdiction-membership predicate that bounds every
// query to session.jurisdictions. The province filter is shown ONLY when the
// viewer's assignments span MORE than one province — a single-province govt
// operator has nothing to choose (their whole scope is already that one
// province), so the selector would be a no-op control.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpButton, OpSelect } from "@/components/ui/dashboard";
import { CaseQueue, type CaseQueueRow } from "@/components/ui/dashboard/CaseQueue";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { countCasesForGovt, listCasesForGovt } from "@/lib/infra/case-queries";
import { newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import { CASE_KINDS, type CaseKind, caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

const GOVT_CASOS_PAGE_LIMIT = 50;

function parseStatus(raw: string | undefined): "open" | "closed" | null {
  if (raw === "open") return "open";
  if (raw === "closed") return "closed";
  return null;
}

type GovtCasosSearchParams = { cursor?: string; status?: string; kind?: string; province?: string };

// Extracted so the page component's own cognitive complexity stays under the
// lint ceiling — all filter-parsing, querying, and pagination-link logic
// lives here; the component below only renders (#26 D2).
async function loadGovtCasos(
  sp: GovtCasosSearchParams,
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
) {
  const rawCursor = sp.cursor;
  const activeStatus = parseStatus(sp.status);
  const kindFilter =
    sp.kind && CASE_KINDS.includes(sp.kind as CaseKind) ? (sp.kind as CaseKind) : null;

  // Province filter — only offered (and only honored) when the viewer's own
  // assignments span more than one province. A value outside this list is
  // ignored here AND would be intersected to zero rows by
  // listCasesForGovt/countCasesForGovt's mandatory jurisdiction predicate
  // even if it slipped through — defense in depth, never a scope widening.
  const scopeProvinces = Array.from(new Set(jurisdictions.map((j) => j.province))).sort((a, b) =>
    a.localeCompare(b, "es-AR"),
  );
  const showProvinceFilter = scopeProvinces.length > 1;
  const provinceFilter =
    showProvinceFilter && sp.province && scopeProvinces.includes(sp.province) ? sp.province : null;

  // Fetch limit+1 to detect hasMore, plus the true total behind the cap (M4,
  // mirrors /admin/casos) so the header can read "N más recientes de M" when
  // more exist. The count uses the SAME filters as the list.
  const [rawItems, totalCount] = await Promise.all([
    listCasesForGovt(jurisdictions, {
      limit: GOVT_CASOS_PAGE_LIMIT + 1,
      cursor: rawCursor,
      filters: { status: activeStatus, kind: kindFilter, province: provinceFilter },
    }),
    countCasesForGovt(jurisdictions, {
      status: activeStatus,
      kind: kindFilter,
      province: provinceFilter,
    }),
  ]);
  const hasMore = rawItems.length > GOVT_CASOS_PAGE_LIMIT;
  const items = hasMore ? rawItems.slice(0, GOVT_CASOS_PAGE_LIMIT) : rawItems;

  // Preserve the active filters across cursor links.
  const filterParams: Record<string, string | undefined> = {
    ...(activeStatus ? { status: activeStatus } : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(provinceFilter ? { province: provinceFilter } : {}),
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

  return {
    activeStatus,
    kindFilter,
    provinceFilter,
    scopeProvinces,
    showProvinceFilter,
    rawCursor,
    olderLink,
    newerLink,
    hasFilters: activeStatus !== null || kindFilter !== null || provinceFilter !== null,
    queueRows,
    totalCount,
    emptyMessage,
  };
}

export default async function GovtCasosPage({
  searchParams,
}: {
  searchParams: Promise<GovtCasosSearchParams>;
}) {
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role === "admin") redirect("/admin/casos");

  const sp = await searchParams;
  const {
    activeStatus,
    kindFilter,
    provinceFilter,
    scopeProvinces,
    showProvinceFilter,
    rawCursor,
    olderLink,
    newerLink,
    hasFilters,
    queueRows,
    totalCount,
    emptyMessage,
  } = await loadGovtCasos(sp, session.jurisdictions);

  return (
    <div className="space-y-6">
      <header className="mb-6 space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Casos regulatorios
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Casos</h1>
        <p className="text-[13px] text-ln-op-mute">Expedientes en tu jurisdicción asignada.</p>
      </header>

      {session.jurisdictions.length === 0 ? (
        <LnEmptyState
          icon="usuarios"
          title="No tenés jurisdicciones asignadas todavía."
          description="Pedile a un administrador que te asigne una jurisdicción."
        />
      ) : (
        <>
          {/* Status + kind (+ province, when in scope) filter form — all three
              axes in ONE form, mirroring /admin/casos. CaseQueue's own status
              CHIP strip is suppressed (showStatusChips=false below): its chip
              links only encode kind+status (buildFilterHref), so clicking a
              chip would silently drop an active province filter — the same
              reason /admin/casos owns status itself instead of relying on the
              chips once it has more than one filter axis. */}
          <form action="/gob/casos" method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="casos-status" className="block text-xs font-medium text-ln-op-ink-2">
                Estado
              </label>
              <OpSelect id="casos-status" name="status" defaultValue={activeStatus ?? ""}>
                <option value="">Todos los estados</option>
                <option value="open">Abiertos</option>
                <option value="closed">Cerrados</option>
              </OpSelect>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="casos-kind" className="block text-xs font-medium text-ln-op-ink-2">
                Tipo
              </label>
              <OpSelect id="casos-kind" name="kind" defaultValue={kindFilter ?? ""}>
                <option value="">Todos los tipos</option>
                {CASE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {caseKindLabel(k)}
                  </option>
                ))}
              </OpSelect>
            </div>

            {showProvinceFilter && (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="casos-province"
                  className="block text-xs font-medium text-ln-op-ink-2"
                >
                  Provincia
                </label>
                <OpSelect id="casos-province" name="province" defaultValue={provinceFilter ?? ""}>
                  <option value="">Todas tus provincias</option>
                  {scopeProvinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </OpSelect>
              </div>
            )}

            <OpButton type="submit" variant="primary" size="sm">
              Filtrar
            </OpButton>
            {hasFilters && (
              <a href="/gob/casos" className="text-sm text-ln-op-mute underline underline-offset-4">
                Limpiar filtros
              </a>
            )}
          </form>

          <Suspense>
            <CaseQueue
              rows={queueRows}
              filters={{ status: activeStatus, kind: kindFilter }}
              filterBase="/gob/casos"
              showStatusChips={false}
              caption="Cola de casos de tu jurisdicción"
              // "más recientes de N" is a first-page affordance; on a keyset
              // page (cursor set) these are the NEXT 50, not the most recent.
              totalCount={rawCursor ? undefined : totalCount}
              emptyMessage={emptyMessage}
            />
          </Suspense>
        </>
      )}

      {/* Keyset pagination footer — preserves the active filters. */}
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
    </div>
  );
}
