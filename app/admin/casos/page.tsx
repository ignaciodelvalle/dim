// Admin-scope case index - universal view across all jurisdictions.

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  CasoEstadoFilter,
  type OpFilterAxis,
  OpFilterBar,
  parseCasoEstado,
} from "@/components/ui/dashboard";
import { CaseQueue, type CaseQueueRow } from "@/components/ui/dashboard/CaseQueue";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { countCasesForAdmin, listCasesForAdmin } from "@/lib/infra/case-queries";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import { CASE_KINDS, type CaseKind, caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

const ADMIN_CASOS_PAGE_LIMIT = 50;

// Tipo/Provincia axis options — same shape as /gob/casos so the two casos
// twins render identically. Estado is NOT an axis option set anymore — see
// CasoEstadoFilter (BUGFIX opfilterbar-sweep-2026-07-21).
const KIND_OPTIONS = CASE_KINDS.map((k) => ({ value: k, label: caseKindLabel(k) }));
const PROVINCE_OPTIONS = PROVINCES.map((p) => ({ value: p.name, label: p.name }));

export default async function AdminCasosPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    status?: string;
    kind?: string;
    province?: string;
  }>;
}) {
  const session = await requireAdminOrGovtOrRedirect();
  if (session.profile.role !== "admin") redirect("/gob/casos");

  const sp = await searchParams;
  const { cursor: rawCursor } = sp;

  // Parse filters from searchParams — push them all into SQL, not JS.
  // WS-PERF P2: default to "open" when no explicit status param is present so
  // the triager's first paint is the actionable open-case view (fast + relevant)
  // rather than a 500-row full scan across all statuses. An explicit status=
  // (including the "all" sentinel value) overrides the default.
  // 3-way Estado value ("open" default / "all" / "closed") for the
  // CasoEstadoFilter control (BUGFIX opfilterbar-sweep-2026-07-21) — collapses
  // to the SQL-facing open|closed|null via statusFilter below.
  const rawStatus = sp.status;
  const casoEstado = parseCasoEstado(rawStatus);
  const statusFilter: "open" | "closed" | null = casoEstado === "all" ? null : casoEstado;
  const kindFilter =
    sp.kind && CASE_KINDS.includes(sp.kind as CaseKind) ? (sp.kind as CaseKind) : null;
  const provinceFilter = sp.province?.trim() || null;

  // Whether the user explicitly changed from the default (open, no kind, no province).
  // Used to show/hide the "Limpiar filtros" link — the default open view is not
  // considered an active filter.
  const statusExplicitlyOverridden = casoEstado !== "open";

  const filterParams: Record<string, string | undefined> = {
    // Carry status in pagination links only when it differs from the default (open).
    // For status=all (null filter), use the "all" sentinel so the paginator
    // preserves the user's explicit choice.
    ...(statusExplicitlyOverridden ? { status: casoEstado } : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(provinceFilter ? { province: provinceFilter } : {}),
  };

  // Fetch limit+1 to detect hasMore, plus the true total behind the cap (M4) so
  // the header reads "Mostrando los 50 más recientes de N" instead of "50 casos"
  // when more exist. The count uses the SAME filters as the list.
  const [rawItems, totalCount] = await Promise.all([
    listCasesForAdmin({
      limit: ADMIN_CASOS_PAGE_LIMIT + 1,
      cursor: rawCursor,
      filters: {
        status: statusFilter,
        kind: kindFilter,
        province: provinceFilter,
      },
    }),
    countCasesForAdmin({
      status: statusFilter,
      kind: kindFilter,
      province: provinceFilter,
    }),
  ]);
  const hasMore = rawItems.length > ADMIN_CASOS_PAGE_LIMIT;
  const items = hasMore ? rawItems.slice(0, ADMIN_CASOS_PAGE_LIMIT) : rawItems;

  const lastItem = items.at(-1);
  const olderLink =
    hasMore && lastItem
      ? olderHref("/admin/casos", filterParams, { ts: lastItem.openedAt, id: lastItem.id })
      : null;
  const newerLink = rawCursor ? newerHref("/admin/casos", filterParams) : null;

  // Map CaseListItem → CaseQueueRow for the shared queue table. The rich
  // status/kind/province filter form above owns filtering, so the queue's
  // built-in status chips are suppressed (showStatusChips={false}) to avoid a
  // duplicate status control. Cases are reachable via the in-shell operator
  // detail /admin/casos/[publicCode] — NOT the public /casos/[publicCode],
  // which renders under the citizen layout and strips the operator rail/topbar
  // (the shell-loss class fixed for /gob in task #47; the admin half landed
  // 2026-07-16 after QA ronda 5 caught it).
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
    detailHref: `/admin/casos/${c.publicCode}`,
  }));

  return (
    <div className="space-y-6">
      <ScreenHeader
        eyebrow="Admin · Casos"
        title="Casos"
        subtitle={
          <p className="text-[var(--text-md)] text-ln-op-mute">
            Expedientes abiertos en el sistema. Vista universal admin.{" "}
            {!statusExplicitlyOverridden && (
              <a
                href="/admin/casos?status=all"
                className="underline underline-offset-2 hover:text-ln-op-ink"
              >
                Ver todos
              </a>
            )}
          </p>
        }
      />

      {/* Unified filter bar — Estado/Tipo/Provincia (migrated off the bespoke
          <form>, mirrors /gob/casos so the two casos twins render
          identically). Estado renders as a plain child control
          (CasoEstadoFilter), NOT an `axis`: an axis ALWAYS gets OpFilterBar's
          own injected blank "Todas" option (mapping to "no status param" =
          the Abiertos default), which sat right beside the explicit "all"
          option's OWN "Todos los estados" label — two visually-identical
          "show everything" entries where only one actually did (BUGFIX
          opfilterbar-sweep-2026-07-21: the injected blank silently reverted
          to Abiertos instead of showing every case). A filter change drops
          the keyset `cursor` (page 1), matching the old form's implicit reset
          (it never carried `cursor` as a field). */}
      <OpFilterBar
        showPeriod={false}
        resetParamsOnChange={["cursor"]}
        savedViewsKey="op-saved-views:casos:v1"
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
            {
              id: "province",
              label: "Provincia",
              paramKey: "province",
              options: PROVINCE_OPTIONS,
              current: provinceFilter,
              allLabel: "Todas las provincias",
            },
          ] satisfies OpFilterAxis[]
        }
      >
        <CasoEstadoFilter value={casoEstado} />
      </OpFilterBar>

      <Suspense>
        <CaseQueue
          rows={queueRows}
          filters={{ status: statusFilter, kind: kindFilter }}
          showStatusChips={false}
          caption="Cola de casos — vista universal admin"
          // "más recientes de N" is a first-page affordance; on a keyset page
          // (cursor set) these are the NEXT 50, not the most recent, so omit it.
          totalCount={rawCursor ? undefined : totalCount}
          emptyMessage="Sin casos registrados para los filtros aplicados."
        />
      </Suspense>

      {/* Pagination footer */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de casos"
          className="flex items-center justify-between gap-4 border-t border-ln-op-line pt-4"
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
