// Govt/admin-scope case index rendered under the /gob operator shell. Lists
// every case in scope for the viewer: a govt operator sees cases whose
// jurisdiction matches their active assignments (province + locality); an
// admin browsing /gob (rather than /admin) sees the SAME shell but with
// UNIVERSAL scope — no redirect to /admin/casos. This mirrors the
// admin-viewing-a-/gob-screen pattern established in
// app/gob/mascotas/[token]/page.tsx (search/omnibox-upgrade): the viewer's
// ROLE picks the query scope, the ROUTE stays /gob. Removing a prior
// `redirect("/admin/casos")` here was a PO decision (2026-07-21) — admins
// browsing /gob should not get yanked into the admin portal.
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
// govt query to session.jurisdictions. An admin viewer instead uses
// listCasesForAdmin/countCasesForAdmin (the SAME universal functions
// /admin/casos calls) — no jurisdiction predicate at all, matching the
// universal scope admins already have there. SECURITY: the govt branch is
// UNCHANGED and remains fail-closed on session.jurisdictions — only the
// admin branch is universal, and admins already had universal case access
// via /admin/casos, so this does not widen anyone's scope.
//
// The province filter selector is shown ONLY when it is meaningful for the
// viewer: for govt, only when their assignments span MORE than one province
// (a single-province govt operator has nothing to choose — the selector
// would be a no-op control); for admin it always shows, offering every
// province, same as /admin/casos.
//
// F6 fusion (2026-07-22): this is the byte-identical body of the former
// /gob/casos page.tsx, relocated so the Casos hub (app/gob/casos/page.tsx)
// can render it as its "Casos" expediente under ?expediente=casos (the
// default). /gob/casos itself is now the hub; this component is a
// RELOCATION, not a redesign — same searchParams contract, same auth guard,
// same query logic.

import Link from "next/link";
import { Suspense } from "react";

import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  CasoEstadoFilter,
  type OpFilterAxis,
  OpFilterBar,
  parseCasoEstado,
} from "@/components/ui/dashboard";
import { CaseQueue, type CaseQueueRow } from "@/components/ui/dashboard/CaseQueue";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  countCasesForAdmin,
  countCasesForGovt,
  listCasesForAdmin,
  listCasesForGovt,
} from "@/lib/infra/case-queries";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import { CASE_KINDS, type CaseKind, caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

const GOVT_CASOS_PAGE_LIMIT = 50;

// Domain-axis options for the OpFilterBar (F-migration 2026-07-21, off the
// bespoke <form>) — same values/labels the old hand-rolled selects used.
// Estado is NOT here — see CasoEstadoFilter (BUGFIX opfilterbar-sweep-2026-07-21).
const KIND_OPTIONS = CASE_KINDS.map((k) => ({ value: k, label: caseKindLabel(k) }));

type GovtCasosSearchParams = { cursor?: string; status?: string; kind?: string; province?: string };

export type CasosScreenProps = {
  searchParams: GovtCasosSearchParams;
  /**
   * True when rendered as the Casos hub's "Casos" tab (app/gob/casos/page.tsx)
   * — see components/ui/dashboard/ScreenHeader.tsx.
   */
  underHub?: boolean;
};

// Viewer scope for this page — mirrors the shape used in
// app/gob/mascotas/[token]/page.tsx. Admin = universal (no jurisdiction
// fence); govt = fenced to the account's active jurisdiction assignments.
type ViewerScope =
  | { role: "admin" }
  | { role: "govt"; jurisdictions: ReadonlyArray<{ province: string; locality: string }> };

// Extracted so the page component's own cognitive complexity stays under the
// lint ceiling — all filter-parsing, querying, and pagination-link logic
// lives here; the component below only renders (#26 D2).
async function loadCasosForViewer(sp: GovtCasosSearchParams, scope: ViewerScope) {
  const rawCursor = sp.cursor;
  // 3-way Estado value ("open" default / "all" / "closed") for the
  // CasoEstadoFilter control (BUGFIX opfilterbar-sweep-2026-07-21) — collapses
  // to the SQL-facing open|closed|null via activeStatus below.
  const casoEstado = parseCasoEstado(sp.status);
  const activeStatus: "open" | "closed" | null = casoEstado === "all" ? null : casoEstado;
  const kindFilter =
    sp.kind && CASE_KINDS.includes(sp.kind as CaseKind) ? (sp.kind as CaseKind) : null;

  // Province filter — scope-dependent:
  //  - admin: universal, every province is a valid choice, same as
  //    /admin/casos' province selector.
  //  - govt: only offered (and only honored) when the viewer's own
  //    assignments span more than one province. A value outside this list is
  //    ignored here AND would be intersected to zero rows by
  //    listCasesForGovt/countCasesForGovt's mandatory jurisdiction predicate
  //    even if it slipped through — defense in depth, never a scope widening.
  const scopeProvinces =
    scope.role === "admin"
      ? PROVINCES.map((p) => p.name)
      : Array.from(new Set(scope.jurisdictions.map((j) => j.province))).sort((a, b) =>
          a.localeCompare(b, "es-AR"),
        );
  const showProvinceFilter = scope.role === "admin" ? true : scopeProvinces.length > 1;
  const provinceFilter =
    showProvinceFilter && sp.province && scopeProvinces.includes(sp.province) ? sp.province : null;

  const filters = { status: activeStatus, kind: kindFilter, province: provinceFilter };

  // Fetch limit+1 to detect hasMore, plus the true total behind the cap (M4,
  // mirrors /admin/casos) so the header can read "N más recientes de M" when
  // more exist. The count uses the SAME filters as the list. Admin uses the
  // universal admin queries (no jurisdiction predicate); govt keeps the
  // mandatory jurisdiction-membership predicate — this branch is the ONLY
  // place scope diverges.
  const [rawItems, totalCount] =
    scope.role === "admin"
      ? await Promise.all([
          listCasesForAdmin({ limit: GOVT_CASOS_PAGE_LIMIT + 1, cursor: rawCursor, filters }),
          countCasesForAdmin(filters),
        ])
      : await Promise.all([
          listCasesForGovt(scope.jurisdictions, {
            limit: GOVT_CASOS_PAGE_LIMIT + 1,
            cursor: rawCursor,
            filters,
          }),
          countCasesForGovt(scope.jurisdictions, filters),
        ]);
  const hasMore = rawItems.length > GOVT_CASOS_PAGE_LIMIT;
  const items = hasMore ? rawItems.slice(0, GOVT_CASOS_PAGE_LIMIT) : rawItems;

  // Preserve the active filters across cursor links. Links always point back
  // at /gob/casos — an admin viewing this page stays in the /gob shell.
  const filterParams: Record<string, string | undefined> = {
    // "open" is the default — omit it for a clean URL; "all"/"closed" are
    // explicit choices and must survive pagination (BUGFIX
    // opfilterbar-sweep-2026-07-21: previously keyed off `activeStatus`,
    // which is null for BOTH "no param" and the explicit "all" choice —
    // silently dropping "Todos" across a page turn).
    ...(casoEstado !== "open" ? { status: casoEstado } : {}),
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
    scope.role === "admin"
      ? "Sin casos registrados para los filtros aplicados."
      : activeStatus === "open"
        ? "No hay casos abiertos en tu jurisdicción."
        : activeStatus === "closed"
          ? "No hay casos cerrados en tu jurisdicción."
          : "Sin casos en tu jurisdicción por ahora.";

  return {
    activeStatus,
    casoEstado,
    kindFilter,
    provinceFilter,
    scopeProvinces,
    showProvinceFilter,
    rawCursor,
    olderLink,
    newerLink,
    hasFilters: casoEstado !== "open" || kindFilter !== null || provinceFilter !== null,
    queueRows,
    totalCount,
    emptyMessage,
  };
}

export async function CasosScreen({ searchParams: sp, underHub = false }: CasosScreenProps) {
  const session = await requireAdminOrGovtOrRedirect();
  const scope: ViewerScope =
    session.profile.role === "admin"
      ? { role: "admin" }
      : { role: "govt", jurisdictions: session.jurisdictions };

  const {
    activeStatus,
    casoEstado,
    kindFilter,
    provinceFilter,
    scopeProvinces,
    showProvinceFilter,
    rawCursor,
    olderLink,
    newerLink,
    queueRows,
    totalCount,
    emptyMessage,
  } = await loadCasosForViewer(sp, scope);

  return (
    <div className="space-y-6">
      <ScreenHeader
        underHub={underHub}
        className="mb-6 space-y-1"
        eyebrow="Casos regulatorios"
        title="Casos"
        subtitle={
          <p className="text-[13px] text-ln-op-mute">
            {scope.role === "admin"
              ? "Expedientes en todo el sistema. Vista universal admin."
              : "Expedientes en tu jurisdicción asignada."}
          </p>
        }
      />

      {scope.role === "govt" && scope.jurisdictions.length === 0 ? (
        <LnEmptyState
          icon="usuarios"
          title="No tenés jurisdicciones asignadas todavía."
          description="Pedile a un administrador que te asigne una jurisdicción."
        />
      ) : (
        <>
          {/* Unified filter bar — Estado/Tipo/Provincia (F-migration
              2026-07-21, off the bespoke <form>). Estado is rendered as a
              plain child control (CasoEstadoFilter), NOT an `axis` — an axis
              would get OpFilterBar's own injected blank "Todas" option, which
              maps to "no status param" = the page's Abiertos default, giving
              a dead second "Todos" beside the real one (BUGFIX
              opfilterbar-sweep-2026-07-21). CaseQueue's own status CHIP strip
              stays suppressed (showStatusChips=false below): its chip links
              only encode kind+status (buildFilterHref), so clicking a chip
              would silently drop an active province filter — the same reason
              /admin/casos owns status itself instead of relying on the chips
              once it has more than one filter axis. A filter change drops the
              keyset `cursor` (page 1), matching the old form's implicit reset
              (it never carried `cursor` as a field). */}
          <OpFilterBar
            showPeriod={false}
            resetParamsOnChange={["cursor"]}
            axes={
              [
                {
                  id: "kind",
                  label: "Tipo",
                  paramKey: "kind",
                  options: KIND_OPTIONS,
                  current: kindFilter,
                  allLabel: "Todos los tipos",
                },
                ...(showProvinceFilter
                  ? [
                      {
                        id: "province",
                        label: "Provincia",
                        paramKey: "province",
                        options: scopeProvinces.map((p) => ({ value: p, label: p })),
                        current: provinceFilter,
                        allLabel:
                          scope.role === "admin" ? "Todas las provincias" : "Todas tus provincias",
                      } satisfies OpFilterAxis,
                    ]
                  : []),
              ] satisfies OpFilterAxis[]
            }
          >
            <CasoEstadoFilter value={casoEstado} />
          </OpFilterBar>

          <Suspense>
            <CaseQueue
              rows={queueRows}
              filters={{ status: activeStatus, kind: kindFilter }}
              filterBase="/gob/casos"
              showStatusChips={false}
              caption={
                scope.role === "admin"
                  ? "Cola de casos — vista universal admin"
                  : "Cola de casos de tu jurisdicción"
              }
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
