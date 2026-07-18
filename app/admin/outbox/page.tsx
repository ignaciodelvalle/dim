// Admin Outbox list — shows recent event notification outbox rows with filters.
//
// Design: pure server component, admin-gated via layout. Filters are pushed
// into the SQL WHERE clause so the result set is correct regardless of total
// outbox size — the previous JS-side filter over LIMIT 200 silently missed
// matching rows beyond position 200 (P1-12).
// Filter form uses <form method="get"> — no JS required.

import { decodeCursor, keysetWhere, newerHref, olderHref } from "@/lib/utils/keyset-pagination";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { OpBreach, OpButton, OpCard } from "@/components/ui/dashboard";
import {
  OUTBOX_STATUS_VALUES,
  OUTBOX_TARGET_KIND_LABEL,
  OUTBOX_TARGET_KIND_VALUES,
  OutboxTable,
  buildStatusLabel,
} from "@/components/ui/dashboard/OutboxTable";
import { db, eventNotificationOutbox, petEvents, pets } from "@/db";
import type { OutboxStatus, OutboxTargetKind } from "@/db";
import { requireAdminOrRedirect } from "@/lib/infra/auth-guards";
import { countOutboxBreaches } from "@/lib/infra/outbox-queries";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { pluralizeEs } from "@/lib/utils/format";

// Set of canonical province names for filter validation.
const VALID_PROVINCE_NAMES = new Set<string>(PROVINCES.map((p) => p.name));

const OUTBOX_PAGE_LIMIT = 200;

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

  // Build SQL WHERE clauses for each active filter so the LIMIT is applied
  // AFTER narrowing — prevents silently missing matching rows beyond 200 (P1-12).
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous Drizzle SQL expression union
  const conditions: any[] = [];
  // When breach=yes, status is implied to be 'pending' — skip the standalone status
  // condition to avoid the always-false contradiction (e.g. status='delivered' AND status='pending').
  if (
    filters.status &&
    filters.breach !== "yes" &&
    (["pending", "delivered", "failed"] as string[]).includes(filters.status)
  ) {
    conditions.push(eq(eventNotificationOutbox.status, filters.status as OutboxStatus));
  }
  if (
    filters.target_kind &&
    (["govt_webhook", "eno_authority", "audit_export", "internal_dashboard"] as string[]).includes(
      filters.target_kind,
    )
  ) {
    conditions.push(
      eq(eventNotificationOutbox.targetKind, filters.target_kind as OutboxTargetKind),
    );
  }
  // Province: only push condition when the value is a known canonical province name.
  if (filters.province && VALID_PROVINCE_NAMES.has(filters.province)) {
    conditions.push(eq(eventNotificationOutbox.targetJurisdictionProvince, filters.province));
  }
  // breach filter: "yes" → pending AND slaDueAt < now() (skip separate status condition —
  // breach already implies pending, combining them produces status='delivered' AND status='pending'
  // which is always-false); "no" → NOT (pending AND slaDueAt < now()).
  if (filters.breach === "yes") {
    conditions.push(lt(eventNotificationOutbox.slaDueAt, sql`now()`));
    conditions.push(eq(eventNotificationOutbox.status, "pending"));
  } else if (filters.breach === "no") {
    conditions.push(
      sql`NOT (${eventNotificationOutbox.status} = 'pending' AND ${eventNotificationOutbox.slaDueAt} < now())`,
    );
  }

  // Keyset predicate — AND-composed with filter conditions so limit is applied after narrowing.
  const cursorClause = keysetWhere(
    eventNotificationOutbox.createdAt,
    eventNotificationOutbox.id,
    cursor,
  );
  if (cursorClause) conditions.push(cursorClause);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Admin {"·"} Bandeja de salida
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Bandeja de salida de notificaciones
        </h1>
        <p className="text-[13px] text-ln-op-ink-2">
          {hasFilters
            ? `${rows.length} ${pluralizeEs(rows.length, "fila")} con los filtros aplicados.`
            : `Últimas ${rows.length} filas de la bandeja de salida de eventos de notificación ENO/govt.`}
        </p>
      </header>

      {/* SLA breach banner */}
      {breachCount > 0 && (
        <OpBreach
          title={`${breachCount} ${pluralizeEs(breachCount, "item", "items")} en incumplimiento de SLA`}
          detail="Revisa los items marcados en rojo y reintenta si es necesario."
        />
      )}

      {/* Filters */}
      <form action="/admin/outbox" method="get" className="flex items-center gap-2 flex-wrap">
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todos los estados</option>
          {OUTBOX_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {buildStatusLabel(s as OutboxStatus)}
            </option>
          ))}
        </select>

        <select
          name="target_kind"
          defaultValue={filters.target_kind ?? ""}
          className="text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todos los destinos</option>
          {OUTBOX_TARGET_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {OUTBOX_TARGET_KIND_LABEL[k]}
            </option>
          ))}
        </select>

        <select
          name="breach"
          defaultValue={filters.breach ?? ""}
          className="text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todos (breach o no)</option>
          <option value="yes">Solo incumplimientos SLA</option>
          <option value="no">Solo dentro de SLA</option>
        </select>

        <select
          name="province"
          defaultValue={filters.province ?? ""}
          className="text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        >
          <option value="">Todas las provincias</option>
          {PROVINCES.map((p) => (
            <option key={p.code} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>

        <OpButton type="submit" variant="primary" size="sm">
          Filtrar
        </OpButton>

        {hasFilters && (
          <a href="/admin/outbox" className="text-sm text-ln-op-mute underline underline-offset-4">
            Limpiar filtros
          </a>
        )}
      </form>

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
