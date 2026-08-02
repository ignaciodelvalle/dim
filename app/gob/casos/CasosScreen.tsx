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
  CsvExportLink,
  type OpFilterAxis,
  OpFilterBar,
  parseCasoEstado,
} from "@/components/ui/dashboard";
import { CaseQueue, type CaseQueueRow } from "@/components/ui/dashboard/CaseQueue";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { ViewScopeCaption } from "@/components/ui/dashboard/ViewScopeCaption";
import {
  CASE_QUEUE_CSV_COLUMNS,
  CASE_QUEUE_CSV_ORDER_NOTE,
  caseQueueCsvRows,
} from "@/components/ui/dashboard/case-queue-csv";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import {
  countCasesForAdmin,
  countCasesForGovt,
  listCasesForAdmin,
  listCasesForGovt,
} from "@/lib/infra/case-queries";
import { csvPageDisclosure } from "@/lib/ui/csv-export";
import { describeNarrowedView } from "@/lib/ui/view-scope-caption";
import { todayIsoInAr } from "@/lib/utils/format";
import { newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import {
  CASE_KINDS,
  CASE_KINDS_ROUTED_ELSEWHERE,
  type CaseKind,
  caseKindLabel,
} from "@/src/modules/cases/domain/case-kinds";

const GOVT_CASOS_PAGE_LIMIT = 50;

// Domain-axis options for the OpFilterBar (F-migration 2026-07-21, off the
// bespoke <form>) — same values/labels the old hand-rolled selects used.
// Estado is NOT here — see CasoEstadoFilter (BUGFIX opfilterbar-sweep-2026-07-21).
// Kinds routed to their own screen are not offered here — a filter that can
// only ever return zero rows is a dead control (see CASE_KINDS_ROUTED_ELSEWHERE).
const QUEUE_KINDS = CASE_KINDS.filter((k) => !CASE_KINDS_ROUTED_ELSEWHERE.includes(k));
const KIND_OPTIONS = QUEUE_KINDS.map((k) => ({ value: k, label: caseKindLabel(k) }));

type GovtCasosSearchParams = {
  cursor?: string;
  status?: string;
  kind?: string;
  /** ISO 3166-2:AR code, e.g. "AR-B" — the canonical /gob contract. */
  province?: string;
  /** Locality slug, e.g. "la-plata" — the canonical /gob contract. */
  locality?: string;
};

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
// fence), narrowed only by the explicit URL drill it resolved; govt = fenced
// to the account's active jurisdiction assignments, already narrowed by
// resolveJurisdictionScope (THE FENCE — it can only ever intersect DOWN).
type ViewerScope =
  | { role: "admin"; province: string | null; locality: string | null }
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
  // A ?kind= naming a routed-away kind is ignored rather than honoured — the
  // exclusion below would zero it out anyway, and honouring it would render a
  // filter chip for a queue that cannot contain the kind.
  const kindFilter =
    sp.kind && QUEUE_KINDS.includes(sp.kind as CaseKind) ? (sp.kind as CaseKind) : null;

  // Jurisdiction narrowing is NOT re-derived here. It arrives already resolved
  // through the canonical `resolveJurisdictionScope` (province = ISO code,
  // locality = slug — the SAME URL contract /gob and every sibling screen
  // commit): for govt it is baked into `scope.jurisdictions` (the fence, which
  // can only intersect DOWN against the assignment set), for admin it is the
  // explicit province/locality predicate below. This screen used to own a
  // bespoke `?province=<canonical name>` axis of its own, which is why a
  // drill-down from /gob silently evaporated on arrival.
  const filters = {
    status: activeStatus,
    kind: kindFilter,
    // Govt narrowing already lives in scope.jurisdictions — passing it again
    // as a predicate would be redundant, not safer.
    ...(scope.role === "admin" ? { province: scope.province, locality: scope.locality } : {}),
    // excludeKinds applies to the LIST, the COUNT and the cursor at once — they
    // share buildCaseKindStatusClauses, so the header can never claim a total the
    // rows do not contain (live review 2026-07-28: 11 custody-dispute rows here
    // against 1 workable row in /gob/disputas, same dispute, two codes).
    excludeKinds: CASE_KINDS_ROUTED_ELSEWHERE,
  };

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
    // The RAW jurisdiction params, forwarded verbatim: they are the URL
    // contract (ISO code + slug), and re-resolving them into names here would
    // produce a link this screen can no longer read back.
    ...(sp.province ? { province: sp.province } : {}),
    ...(sp.locality ? { locality: sp.locality } : {}),
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
    primarySubjectKind: c.primarySubjectKind,
    primaryPetName: c.primaryPetName,
    primaryPetPublicToken: c.primaryPetPublicToken,
    jurisdictionProvince: c.jurisdictionProvince,
    jurisdictionLocality: c.jurisdictionLocality,
    openedAt: c.openedAt,
    closedAt: c.closedAt,
    detailHref: `/gob/casos/${c.publicCode}`,
  }));

  // The two casos twins must read identically, so the admin branch gets the
  // same true-empty / filter-empty split /admin/casos now uses: "para los
  // filtros aplicados" blamed filters nobody had applied on the untouched
  // default view (RA-6 finding 5). The govt branches below were already honest.
  const hasFilters =
    casoEstado !== "open" || kindFilter !== null || Boolean(sp.province) || Boolean(sp.locality);

  const emptyMessage =
    scope.role === "admin"
      ? hasFilters
        ? "Ningún caso coincide con los filtros aplicados."
        : "No hay casos abiertos."
      : activeStatus === "open"
        ? "No hay casos abiertos en tu jurisdicción."
        : activeStatus === "closed"
          ? "No hay casos cerrados en tu jurisdicción."
          : "Sin casos en tu jurisdicción por ahora.";

  return {
    activeStatus,
    casoEstado,
    kindFilter,
    rawCursor,
    olderLink,
    newerLink,
    hasFilters,
    queueRows,
    totalCount,
    emptyMessage,
  };
}

export async function CasosScreen({ searchParams: sp, underHub = false }: CasosScreenProps) {
  const session = await requireAdminOrGovtOrRedirect();

  // THE CANONICAL JURISDICTION CONTRACT (demo review 2026-08-01). This screen
  // used to parse `?province=<canonical name>` itself, against a hand-built
  // list of province names — the only /gob surface not speaking the shared
  // `province=ISO&locality=slug` contract, and the reason a drill-down from
  // the /gob home evaporated on arrival: the Panel's "Casos regulatorios" tile
  // counted CABA (32) or PBA and the queue it linked to counted the country.
  // resolveJurisdictionScope is THE fence — for govt it can only intersect
  // DOWN against the assignment set, and it hands admin its drill as explicit
  // province/locality NAMES to push into SQL (admin has no assignments to
  // narrow). Same primitive /gob, /gob/perdidas and the rest already use.
  const {
    filteredJurisdictions,
    localities,
    allowedProvinces,
    adminSelectedProvince,
    adminSelectedLocality,
  } = await resolveJurisdictionScope({
    role: session.profile.role,
    jurisdictions: session.jurisdictions,
    params: { province: sp.province, locality: sp.locality },
  });

  const scope: ViewerScope =
    session.profile.role === "admin"
      ? { role: "admin", province: adminSelectedProvince, locality: adminSelectedLocality }
      : { role: "govt", jurisdictions: filteredJurisdictions };

  // C3. The moment this screen started resolving scope through the canonical
  // fence (demo review 2026-08-01 — it was the only /gob surface still parsing
  // `?province=<canonical name>` against a hand-built list, so the `AR-B` every
  // other screen writes fell through in silence), it inherited the obligation
  // that comes with narrowing: a view showing LESS than the operator's mandate
  // has to say so. `lint:view-scope` caught the gap on the very next run — the
  // fence is the reason this line exists, not an afterthought.
  const narrowedView = describeNarrowedView({
    role: session.profile.role,
    mandateJurisdictions: session.jurisdictions,
    effectiveJurisdictions: filteredJurisdictions,
    // The resolver returns null for "no drill"; the descriptor's contract is
    // undefined. Coalescing rather than widening the descriptor: null and
    // undefined mean the same thing here, and the descriptor is shared.
    adminProvince: adminSelectedProvince ?? undefined,
    adminLocality: adminSelectedLocality ?? undefined,
  });

  const {
    activeStatus,
    casoEstado,
    kindFilter,
    rawCursor,
    olderLink,
    newerLink,
    queueRows,
    totalCount,
    emptyMessage,
  } = await loadCasosForViewer(sp, scope);

  // Q1 (CSV export parity) — the shared CaseQueue CSV projection: exactly the
  // rendered page rows, page-hood declared (csvPageDisclosure), order note
  // included because the on-screen default sort is Urgencia (client-side).
  const csvPageLine = csvPageDisclosure(queueRows.length, totalCount);
  const csvContextLines = [
    `miMAR · Casos — ${scope.role === "admin" ? "vista universal admin" : "tu jurisdicción asignada"}`,
    CASE_QUEUE_CSV_ORDER_NOTE,
    ...(csvPageLine ? [csvPageLine] : []),
  ];

  return (
    <div className="space-y-6">
      <ScreenHeader
        underHub={underHub}
        className="mb-6 space-y-1"
        eyebrow="Casos regulatorios"
        title="Casos"
        subtitle={
          <>
            <ViewScopeCaption scope={narrowedView} />
            <p className="text-md text-ln-op-mute">
              {scope.role === "admin"
                ? "Expedientes en todo el sistema. Vista universal admin."
                : "Expedientes en tu jurisdicción asignada."}{" "}
              {/* The queue no longer lists custody disputes (they live in their
                own expediente, with the resolve form). Saying so — and linking —
                is what keeps the exclusion from reading as data loss.

                The link points at the SIBLING TAB, not at /gob/disputas. Since
                the F6 fusion that route only redirects into
                /gob/casos?expediente=disputas — i.e. back into the hub the
                reader already has open — so the old href spent a round trip to
                land one tab over (link-integrity.test.ts block 5, 2026-08-01).
                Same target app/gob/analytics/AnalyticsScreen.tsx already links.
                The copy says "expediente" now because that is what the click
                does: it switches the tab of this hub, it does not leave it. */}
              Las disputas de custodia se trabajan en el expediente{" "}
              <Link href="/gob/casos?expediente=disputas" className="underline underline-offset-2">
                Disputas
              </Link>{" "}
              de este mismo hub.
            </p>
          </>
        }
      />

      {/* The MANDATE is what is empty here, not the filtered view — a govt
          operator who narrowed to an out-of-mandate province gets an empty
          QUEUE (fail-closed), not this "pedile a un administrador" copy. */}
      {session.profile.role === "govt" && session.jurisdictions.length === 0 ? (
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
            savedViewsKey="op-saved-views:casos:v1"
            actions={
              <CsvExportLink
                filename={`casos-${todayIsoInAr()}`}
                columns={CASE_QUEUE_CSV_COLUMNS}
                rows={caseQueueCsvRows(queueRows)}
                contextLines={csvContextLines}
              />
            }
            // The canonical jurisdiction control (ISO code + locality slug),
            // replacing this screen's bespoke province-NAME axis. It also
            // gains a Localidad level the queue never had — which is what lets
            // a /gob tile counting one barrio link to a queue that counts the
            // same barrio.
            jurisdiction={{ allowedProvinces, localities }}
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
