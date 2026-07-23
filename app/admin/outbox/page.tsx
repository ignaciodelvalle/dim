// Admin Outbox list — shows recent event notification outbox rows with filters.
//
// Design: pure server component, admin-gated via layout. Filters are pushed
// into the SQL WHERE clause so the result set is correct regardless of total
// outbox size — the previous JS-side filter over LIMIT 200 silently missed
// matching rows beyond position 200 (P1-12).
// Filter row is the canonical OpFilterBar (F-migration 2026-07-21, was a
// bespoke <form method="get">) — every axis change commits via a full-document
// navigation (serverNavCommit), so the URL/query contract is unchanged.

import { decodeCursor, newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { OpBreach, OpCard, type OpFilterAxis, OpFilterBar } from "@/components/ui/dashboard";
import { OutboxTable } from "@/components/ui/dashboard/OutboxTable";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { db, eventNotificationOutbox, petEvents, pets } from "@/db";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { countOutboxBreaches } from "@/lib/infra/outbox-queries";
import { OUTBOX_PAGE_LIMIT, buildOutboxWhere } from "@/lib/infra/outbox-query";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { buildOutboxDomainAxes } from "@/lib/ui/outbox-filter-axes";
import { pluralizeEs } from "@/lib/utils/format";

export default async function AdminOutboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    target_kind?: string;
    breach?: string;
    province?: string;
    cursor?: string;
  }>;
}) {
  await requireAdminOrRedirect();

  const sp = await searchParams;
  const filters = {
    status: sp.status?.trim() || undefined,
    target_kind: sp.target_kind?.trim() || undefined,
    breach: sp.breach?.trim() || undefined,
    province: sp.province?.trim() || undefined,
  };
  const rawCursor = sp.cursor;
  const cursor = decodeCursor(rawCursor);

  const hasFilters = Object.values(filters).some(Boolean);

  // Shared builder with /gob/outbox (#26 D3) — admin passes NO jurisdiction
  // scope (universal). The filter-building SQL (status/target_kind/province/
  // breach + keyset cursor) lives in lib/infra/outbox-query.ts so the two
  // surfaces can never silently diverge again.
  const whereClause = buildOutboxWhere(filters, { cursor });

  // Fetch limit+1 to detect hasMore for keyset pagination (PERF-5).
  const rawRows = await db
    .select()
    .from(eventNotificationOutbox)
    .where(whereClause)
    .orderBy(desc(eventNotificationOutbox.createdAt), desc(eventNotificationOutbox.id))
    .limit(OUTBOX_PAGE_LIMIT + 1);

  const hasMore = rawRows.length > OUTBOX_PAGE_LIMIT;
  const rows = hasMore ? rawRows.slice(0, OUTBOX_PAGE_LIMIT) : rawRows;

  // Banner count is GLOBAL (same predicate as the nav badge in layout.tsx), not
  // derived from the visible page — otherwise it sub-reports breaches that live
  // beyond page 1 and disagrees with the badge (C2). Per-row cues below still
  // use buildBreachCue for the page.
  const breachCount = await countOutboxBreaches();

  // Batch-resolve sourceEventId → pet publicToken for the "Evento origen" column.
  // One query: join pet_events → pets for all sourceEventIds on the current page.
  const uniqueSourceEventIds = [...new Set(rows.map((r) => r.sourceEventId))];
  const sourceEventPetTokenMap = new Map<string, string>(); // sourceEventId → pet publicToken
  if (uniqueSourceEventIds.length > 0) {
    const resolved = await db
      .select({ eventId: petEvents.id, publicToken: pets.publicToken })
      .from(petEvents)
      .innerJoin(pets, eq(petEvents.petId, pets.id))
      .where(inArray(petEvents.id, uniqueSourceEventIds));
    for (const r of resolved) {
      sourceEventPetTokenMap.set(r.eventId, r.publicToken);
    }
  }

  // Pagination links — filter params exclude cursor so changing a filter resets to page 1.
  const filterParams: Record<string, string | undefined> = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.target_kind ? { target_kind: filters.target_kind } : {}),
    ...(filters.breach ? { breach: filters.breach } : {}),
    ...(filters.province ? { province: filters.province } : {}),
  };
  const lastRow = rows.at(-1);
  const olderLink =
    hasMore && lastRow
      ? olderHref("/admin/outbox", filterParams, { ts: lastRow.createdAt, id: lastRow.id })
      : null;
  const newerLink = rawCursor ? newerHref("/admin/outbox", filterParams) : null;

  return (
    <div className="space-y-6">
      <ScreenHeader
        eyebrow="Admin"
        title="Bandeja de salida de notificaciones"
        subtitle={
          <p className="text-[13px] text-ln-op-ink-2">
            {hasFilters
              ? `${rows.length} ${pluralizeEs(rows.length, "fila")} con los filtros aplicados.`
              : `Últimas ${rows.length} filas de la bandeja de salida de eventos de notificación ENO/govt.`}
          </p>
        }
      />

      {/* SLA breach banner */}
      {breachCount > 0 && (
        <OpBreach
          title={`${breachCount} ${pluralizeEs(breachCount, "item", "items")} en incumplimiento de SLA`}
          detail="Revisa los items marcados en rojo y reintenta si es necesario."
        />
      )}

      {/* Unified filter bar — Estado/Destino/SLA/Provincia domain axes
          (migrated off the bespoke <form>, mirrors /gob/outbox so the two
          outbox twins render identically). status/target_kind/breach axis
          defs are shared via buildOutboxDomainAxes (#26 D3 lineage). A filter
          change drops the keyset `cursor` (page 1), matching the old form's
          implicit reset (it never carried `cursor` as a field). */}
      <OpFilterBar
        showPeriod={false}
        resetParamsOnChange={["cursor"]}
        axes={
          [
            ...buildOutboxDomainAxes(filters),
            {
              id: "province",
              label: "Provincia",
              paramKey: "province",
              options: PROVINCES.map((p) => ({ value: p.name, label: p.name })),
              current: filters.province ?? null,
              allLabel: "Todas las provincias",
            },
          ] satisfies OpFilterAxis[]
        }
      />

      {/* Table */}
      {rows.length === 0 ? (
        <p className="text-[13px] text-ln-op-mute">
          {hasFilters
            ? "No hay items que coincidan con los filtros aplicados."
            : "No hay items en la bandeja de salida."}
        </p>
      ) : (
        <OpCard>
          <OutboxTable
            rows={rows}
            caption="Cola de notificaciones salientes con estado SLA, destino y acciones"
            petTokenBySourceEventId={sourceEventPetTokenMap}
            detailHrefFor={(row) => `/admin/outbox/${row.id}`}
          />
        </OpCard>
      )}

      {/* Pagination footer */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de la bandeja de salida"
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
